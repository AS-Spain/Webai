import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import Database from 'better-sqlite3'
import { scryptSync } from 'node:crypto'
import { runtimeConfig } from '../server/runtime.js'
import { installSecurity, apiErrors, rateLimiter, HttpError } from '../server/security.js'
import { passwordHash, validPassword } from '../server/passwords.js'
import { readJsonBounded } from '../server/upstream.js'

async function fixture(env = {}) {
  const db = new Database(':memory:'), app = express(), logs = []
  installSecurity(app, { db, runtime: runtimeConfig(env), log: (entry) => logs.push(entry) })
  app.use(express.json({ limit: '128kb' }))
  let writes = 0
  app.post('/api/change', (req, res) => { writes++; res.json({ ok: true }) })
  app.get('/api/health/live', (req, res) => res.json({ status: 'ok' }))
  app.get('/api/integrations/:provider/callback', (req, res) => res.json({ ok: true }))
  app.post('/api/failure', () => { throw new Error('SECRET-query-password-token') })
  app.use(apiErrors)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { db, logs, base, writes: () => writes, close: async () => { await new Promise((r) => server.close(r)); db.close() } }
}

test('CSRF: Origin, Fetch Metadata y JSON antes de ejecutar comandos sin cuerpo', async () => {
  const f = await fixture()
  try {
    for (const headers of [
      { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      { Origin: 'null', 'Content-Type': 'application/json' },
      { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
      { 'Sec-Fetch-Site': 'same-site', 'Content-Type': 'application/json' },
      { Origin: 'https://attacker.example', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' },
    ]) assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers })).status, 403)
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
      assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers: type ? { 'Content-Type': type } : {} })).status, 415)
    }
    assert.equal(f.writes(), 0)
    assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers: { Origin: f.base, 'Content-Type': 'application/json' } })).status, 200)
    assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status, 200, 'Cliente no navegador explícito')
    assert.equal(f.writes(), 2)
  } finally { await f.close() }
})

test('gateway Arena con Host sustituido: solo orígenes exactos del sandbox, no headers arbitrarios', async () => {
  const f = await fixture({ E2B_SANDBOX_ID: 'fixture-sandbox', PORT: '3002' })
  try {
    for (const origin of ['https://3002-fixture-sandbox.e2b.app', 'https://5174-fixture-sandbox.e2b.app']) assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin } })).status, 200)
    for (const origin of ['https://5174-other-sandbox.e2b.app', 'https://5175-fixture-sandbox.e2b.app']) assert.equal((await fetch(`${f.base}/api/change`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-Host': new URL(origin).host } })).status, 403)
  } finally { await f.close() }
})

test('cabeceras de producción, errores saneados, límites de cuerpo y logs sin URLs/secretos', async () => {
  const f = await fixture({ NODE_ENV: 'production', APP_BASE_URL: 'https://app.example.com' })
  try {
    const response = await fetch(`${f.base}/api/integrations/google/callback?state=SECRET-state&code=SECRET-code`)
    assert.match(response.headers.get('content-security-policy'), /script-src 'self';/)
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/)
    assert.match(response.headers.get('strict-transport-security'), /max-age=/)
    assert.equal(response.headers.get('x-powered-by'), null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('x-request-id'), /^[a-f\d-]{36}$/)
    for (const [path, body, expected] of [['change', '{', 400], ['change', JSON.stringify({ value: 'SECRET'.repeat(30000) }), 413], ['failure', '{}', 500]]) {
      const result = await fetch(`${f.base}/api/${path}?secret=SECRET`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      assert.equal(result.status, expected)
      const data = await result.json()
      assert.ok(data.requestId)
      assert.doesNotMatch(JSON.stringify(data), /SECRET|Error:|stack|sqlite|\/home/)
    }
    const logs = JSON.stringify(f.logs)
    assert.doesNotMatch(logs, /SECRET|state=|code=|password|token/)
    assert.match(logs, /\/api\/integrations\/:provider\/callback/)
  } finally { await f.close() }
})

test('presupuestos persistentes, expiración y X-Forwarded-For no confiable', async () => {
  const db = new Database(':memory:')
  try {
    let now = 1000000
    const first = rateLimiter(db, () => now), second = rateLimiter(db, () => now)
    first('test', 'private@example.com', 2, 1000)
    second('test', 'private@example.com', 2, 1000)
    assert.throws(() => first('test', 'private@example.com', 2, 1000), (error) => error instanceof HttpError && error.status === 429 && error.retryAfter === 1)
    assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM request_limits').all()), /private@example/)
    first('test', 'other', 2, 1000)
    now += 1001
    first('test', 'private@example.com', 2, 1000)
    assert.equal(db.prepare('SELECT count FROM request_limits WHERE scope = ? AND count = 1').all('test').length, 2)
  } finally { db.close() }
  const f = await fixture()
  try {
    for (let index = 0; index < 300; index++) assert.equal((await fetch(`${f.base}/api/integrations/google/callback`, { headers: { 'X-Forwarded-For': `192.0.2.${index % 255}` } })).status, 200)
    const limited = await fetch(`${f.base}/api/integrations/google/callback`)
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) >= 1)
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM request_limits WHERE scope = 'api-ip'").get().n, 1)
    assert.equal((await fetch(`${f.base}/api/health/live`)).status, 200)
  } finally { await f.close() }
})

test('configuración inválida falla sin imprimir valores; defaults separados y proxy explícito', () => {
  for (const env of [{ NODE_ENV: 'prod' }, { PORT: '0' }, { PORT: 'NaN' }, { PORT: '65536' }, { DEMO_MODE: 'yes' }, { V2_DEMO_AI_ENABLED: '1' }, { V2_REQUEST_LOGS: 'yes' }, { SMTP_PORT: 'wat' }, { SMTP_SECURE: 'yes' }, { V2_TIME_ZONE: 'Invalid/Zone' }, { V2_AI_ENCRYPTION_KEY: 'SECRET' }, { V2_INTEGRATIONS_ENCRYPTION_KEY: 'SECRET' }, { APP_BASE_URL: 'https://u:SECRET@example.com/' }, { APP_BASE_URL: 'https://example.com/path' }, { V2_TRUSTED_PROXIES: 'true' }, { V2_TRUSTED_PROXIES: '2' }, { V2_TRUSTED_PROXIES: '127.0.0.1/99' }, { V2_ALLOWED_WEB_ORIGINS: '*' }, { V2_AI_ALLOWED_ORIGINS: 'http://169.254.169.254' }, { V2_AI_ALLOWED_ORIGINS: 'https://models.example.com/v1' }]) {
    assert.throws(() => runtimeConfig(env), (error) => !error.message.includes('SECRET'))
  }
  assert.equal(runtimeConfig({}).demoAiEnabled, false)
  assert.equal(runtimeConfig({}).trustedProxies, false)
  assert.notEqual(runtimeConfig({}).dbPath, runtimeConfig({ DEMO_MODE: 'true' }).dbPath)
  assert.deepEqual(runtimeConfig({ V2_TRUSTED_PROXIES: '127.0.0.1,::1/128', V2_ALLOWED_WEB_ORIGINS: 'https://app.example.com' }).trustedProxies, ['127.0.0.1', '::1/128'])
})

test('scrypt asíncrono compatible, tamaño y concurrencia acotados', async () => {
  const password = 'a-strong-test-password', salt = 'historical-salt'
  const expected = scryptSync(password, salt, 64).toString('hex')
  const work = passwordHash(password, salt)
  assert.ok(work instanceof Promise)
  assert.equal(await Promise.race([work.then(() => 'hash'), new Promise((resolve) => setImmediate(() => resolve('event-loop')))]), 'event-loop')
  assert.equal(await work, expected)
  const batch = await Promise.allSettled(Array.from({ length: 5 }, () => passwordHash(password, salt)))
  assert.equal(batch.filter((item) => item.status === 'fulfilled').length, 4)
  assert.equal(batch.find((item) => item.status === 'rejected').reason.status, 429)
  assert.equal(validPassword('a'.repeat(1025)), false)
  assert.equal(validPassword('é'.repeat(513)), false)
  assert.equal(validPassword({}), false)
  assert.equal(validPassword(password), true)
})

test('lector acotado: Content-Length, chunked, cancelación y payload inválido', async () => {
  let canceled = false
  const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(32)) }, cancel() { canceled = true } }))
  await assert.rejects(readJsonBounded(response, 64), { code: 'UPSTREAM_BODY_LIMIT' })
  assert.equal(canceled, true)
  await assert.rejects(readJsonBounded(new Response('{}', { headers: { 'Content-Length': '1000' } }), 10), { code: 'UPSTREAM_BODY_LIMIT' })
  for (const body of ['null', '[]', 'not-json']) await assert.rejects(readJsonBounded(new Response(body), 100))
  assert.deepEqual(await readJsonBounded(new Response('{"ok":true}'), 100), { ok: true })
})
