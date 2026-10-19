import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { providers, resolveBase } from '../server/ai-providers.js'
import { registerAiRoutes } from '../server/ai.js'

// No paid requests and no real credentials: inspect the exact provider protocol.
async function fixture({ allowedOrigins, legacy = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'northstar-ai-'))
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY);
    INSERT INTO tenants VALUES ('a'), ('b');
    CREATE TABLE projects (id TEXT, tenant_id TEXT, name TEXT, status TEXT, progress INTEGER, due_date TEXT);
    CREATE TABLE tasks (id TEXT, tenant_id TEXT, title TEXT, status TEXT, priority TEXT, due_date TEXT);
    CREATE TABLE issues (id TEXT, tenant_id TEXT, title TEXT, status TEXT, severity TEXT, owner TEXT);
    INSERT INTO projects VALUES ('p', 'a', 'Proyecto A', 'At risk', 25, '2026-12-01');
    INSERT INTO tasks VALUES ('t', 'a', 'Tarea A', 'To do', 'High', '2026-10-01');
    INSERT INTO issues VALUES ('i', 'a', 'Incidencia A', 'Open', 'Critical', 'No compartir mi nombre');
    INSERT INTO tasks VALUES ('secret', 'b', 'SECRETO EMPRESA B', 'To do', 'High', '2026-10-01');`)
  if (legacy) db.exec(`CREATE TABLE ai_settings (
    tenant_id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
    encrypted_key TEXT NOT NULL, allow_context INTEGER NOT NULL DEFAULT 0, verified_at TEXT NOT NULL
  ); INSERT INTO ai_settings VALUES ('a', 'openai', 'gpt-4o-mini', 'old-encrypted-value', 0, '2026-10-20');`)
  const calls = [], audit = []
  let behavior = async (url) => new Response(JSON.stringify(url.endsWith('/models')
    ? { data: [{ id: 'test-chat' }, { id: 'gpt-4o-mini' }] }
    : { choices: [{ message: { content: 'Respuesta generada de prueba' } }] }), { status: 200 })
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    const tenant = req.get('test-tenant') || 'a'
    req.tenantId = tenant
    req.user = { id: `${tenant}-user`, tenant_id: tenant, role: req.get('test-role') || 'admin' }
    next()
  })
  registerAiRoutes(app, {
    db, allowedOrigins, day: () => '2026-10-20', masterKeyPath: path.join(dir, 'master.key'),
    recordActivity: (...args) => audit.push(args),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return behavior(url, options) },
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/ai`
  async function request(route, { method = 'GET', body, tenant = 'a', role = 'admin' } = {}) {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', 'test-tenant': tenant, 'test-role': role }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) }
  }
  const activate = (overrides = {}, tenant = 'a') => request('/config', { method: 'PUT', tenant, body: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'fake-unit-test-key', allowContext: false, ...overrides } })
  return {
    db, dir, calls, audit, request, activate, setBehavior: (handler) => { behavior = handler },
    close: async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }) },
  }
}

test('la IA solo la configura el administrador; las claves nunca aparecen en GET', async () => {
  const f = await fixture()
  try {
    for (const role of ['member', 'manager', 'viewer']) {
      for (const [route, method] of [['/config', 'PUT'], ['/models', 'POST'], ['/config', 'DELETE']]) {
        assert.equal((await f.request(route, { method, role, body: {} })).status, 403)
      }
    }
    assert.equal((await f.request('/config')).body.configured, false)
    assert.equal((await f.activate()).status, 200)
    const status = await f.request('/config', { role: 'viewer' })
    assert.equal(status.body.configured, true)
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.doesNotMatch(JSON.stringify(status.body), /fake-unit-test-key|encrypted_key/)
    assert.doesNotMatch(JSON.stringify(f.audit), /fake-unit-test-key/)
  } finally { await f.close() }
})

test('se verifica el proveedor antes de guardar y el secreto se cifra con clave separada', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.activate()).status, 200)
    assert.equal(f.calls.length, 1)
    const call = f.calls[0]
    assert.equal(call.url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(call.options.headers.Authorization, 'Bearer fake-unit-test-key')
    assert.equal(call.options.redirect, 'error')
    const payload = JSON.parse(call.options.body)
    assert.equal(payload.model, 'gpt-4o-mini')
    assert.equal(payload.max_completion_tokens, 800)
    assert.equal(payload.stream, false)
    assert.doesNotMatch(call.options.body, /Proyecto A|Tarea A|Incidencia A/)
    assert.notEqual(f.db.prepare('SELECT encrypted_key FROM ai_settings').get().encrypted_key, 'fake-unit-test-key')
    assert.equal(readFileSync(path.join(f.dir, 'master.key')).length, 32)
    assert.equal(statSync(path.join(f.dir, 'master.key')).mode & 0o777, 0o600)
    assert.equal((await f.activate({ apiKey: '', model: 'test-chat' })).status, 200)
    assert.equal(f.calls[1].options.headers.Authorization, 'Bearer fake-unit-test-key')
  } finally { await f.close() }
})

test('catálogos y chat funcionan con los tres protocolos compatibles', async () => {
  const f = await fixture()
  try {
    for (const provider of ['openai', 'groq', 'openrouter']) {
      const models = await f.request('/models', { method: 'POST', body: { provider, apiKey: 'test-only-key' } })
      assert.equal(models.status, 200)
      assert.deepEqual(models.body.models, ['gpt-4o-mini', 'test-chat'])
      assert.equal((await f.activate({ provider, apiKey: 'test-only-key' })).status, 200)
      const reply = await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'Hola', includeContext: false } })
      assert.equal(reply.status, 200)
      assert.equal(reply.body.mode, 'ai')
      const payload = JSON.parse(f.calls.at(-1).options.body)
      assert.equal(provider === 'openai' ? payload.max_completion_tokens : payload.max_tokens, 800)
    }
    assert.ok(f.calls.some((call) => call.url.startsWith('https://api.groq.com/openai/v1/')))
    assert.ok(f.calls.some((call) => call.url.startsWith('https://openrouter.ai/api/v1/')))
    assert.equal((await f.activate({ provider: 'https://127.0.0.1' })).status, 400)
    assert.equal((await f.activate({ model: '../malicious model' })).status, 400)
  } finally { await f.close() }
})

test('el contexto requiere autorización de administrador y elección explícita del usuario', async () => {
  const f = await fixture()
  try {
    await f.activate()
    assert.equal((await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'Prioridades', includeContext: true } })).status, 403)
    let result = await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'Hola', includeContext: false } })
    assert.equal(result.status, 200)
    assert.equal(result.body.sharedContext, false)
    assert.doesNotMatch(f.calls.at(-1).options.body, /Proyecto A|Tarea A|Incidencia A/)
    await f.activate({ allowContext: true, apiKey: '' })
    result = await f.request('/ask', { method: 'POST', role: 'viewer', body: { mode: 'ai', question: 'Prioridades', includeContext: true, tenant_id: 'b', context: { tasks: ['fake'] } } })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.contextCounts, { projects: 1, tasks: 1, issues: 1 })
    assert.match(f.calls.at(-1).options.body, /Proyecto A|Tarea A/)
    assert.doesNotMatch(f.calls.at(-1).options.body, /SECRETO EMPRESA B|No compartir mi nombre|fake-unit-test-key|tenant_id/)
    assert.equal((await f.request('/config', { tenant: 'b' })).body.configured, false)
    assert.equal((await f.request('/ask', { method: 'POST', tenant: 'b', body: { mode: 'ai', question: 'hola', includeContext: false } })).status, 409)
  } finally { await f.close() }
})

test('el contexto saliente tiene muestras y longitudes acotadas', async () => {
  const f = await fixture()
  try {
    for (let i = 0; i < 50; i++) f.db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?)').run(`t${i}`, 'a', 'x'.repeat(10_000), 'To do', 'High', '2026-09-01')
    await f.activate({ allowContext: true })
    const result = await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'prioridades', includeContext: true } })
    assert.equal(result.body.contextCounts.tasks, 25)
    assert.ok(f.calls.at(-1).options.body.length < 15_000)
  } finally { await f.close() }
})

test('errores de autenticación, cuota, red y respuestas inválidas no filtran secretos ni simulan IA', async () => {
  const f = await fixture()
  try {
    for (const [upstreamStatus, expected] of [[401, 422], [403, 422], [429, 429], [500, 502], [400, 502]]) {
      f.setBehavior(async () => new Response('fake-unit-test-key in vendor error', { status: upstreamStatus }))
      const result = await f.activate()
      assert.equal(result.status, expected)
      assert.doesNotMatch(JSON.stringify(result.body), /fake-unit-test-key/)
      assert.equal((await f.request('/config')).body.configured, false)
    }
    f.setBehavior(async () => { throw new Error('fake-unit-test-key network error') })
    assert.equal((await f.activate()).status, 502)
    f.setBehavior(async () => { throw new DOMException('fake-unit-test-key', 'TimeoutError') })
    assert.equal((await f.activate()).status, 504)
    f.setBehavior(async () => new Response(JSON.stringify({ choices: [] })))
    assert.equal((await f.activate()).status, 502)
    f.setBehavior(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })))
    await f.activate()
    f.setBehavior(async () => new Response('failed', { status: 500 }))
    const failure = await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'hola', includeContext: false } })
    assert.equal(failure.status, 502)
    assert.equal(failure.body.answer, undefined)
    assert.equal(failure.body.mode, undefined)
  } finally { await f.close() }
})

test('reglas locales sin proveedor, aislamiento, borrado de clave y validación de entrada', async () => {
  const f = await fixture()
  try {
    let result = await f.request('/ask', { method: 'POST', body: { mode: 'rules', question: 'tareas hoy' } })
    assert.equal(result.status, 200)
    assert.equal(result.body.mode, 'rules')
    assert.match(result.body.answer, /Tarea A/)
    assert.equal(f.calls.length, 0)
    result = await f.request('/ask', { method: 'POST', tenant: 'b', body: { mode: 'rules', question: 'proyectos' } })
    assert.doesNotMatch(result.body.answer, /Proyecto A/)
    for (const body of [{ mode: 'ai', question: 'x'.repeat(2001) }, { mode: 'madeup', question: 'hola' }, { mode: 'rules', question: '' }]) {
      assert.equal((await f.request('/ask', { method: 'POST', body })).status, 400)
    }
    await f.activate()
    assert.equal((await f.request('/config', { method: 'DELETE', tenant: 'b' })).status, 204)
    assert.equal((await f.request('/config')).body.configured, true)
    assert.equal((await f.request('/config', { method: 'DELETE' })).status, 204)
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ai_settings').get().n, 0)
    assert.equal((await f.request('/config')).body.configured, false)
  } finally { await f.close() }
})

test('los límites de uso están persistidos y no bloquean las reglas locales', async () => {
  const f = await fixture()
  try {
    await f.activate()
    for (let i = 0; i < 19; i++) assert.equal((await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'hola', includeContext: false } })).status, 200)
    assert.equal((await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'hola', includeContext: false } })).status, 429)
    assert.equal((await f.request('/ask', { method: 'POST', body: { mode: 'rules', question: 'hola' } })).status, 200)
    assert.equal(f.calls.length, 20)
  } finally { await f.close() }
})


test('el cifrado se asocia a la empresa y una configuración fallida no sobrescribe la anterior', async () => {
  const f = await fixture()
  try {
    await f.activate()
    const before = f.db.prepare('SELECT * FROM ai_settings WHERE tenant_id = ?').get('a')
    f.setBehavior(async () => new Response('bad credentials', { status: 401 }))
    assert.equal((await f.activate({ provider: 'groq', apiKey: 'another-fake-key' })).status, 422)
    assert.deepEqual(f.db.prepare('SELECT * FROM ai_settings WHERE tenant_id = ?').get('a'), before)
    f.db.prepare('INSERT INTO ai_settings (tenant_id, provider, model, encrypted_key, allow_context, verified_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('b', before.provider, before.model, before.encrypted_key, before.allow_context, before.verified_at)
    const result = await f.request('/ask', { tenant: 'b', method: 'POST', body: { mode: 'ai', question: 'hola', includeContext: false } })
    assert.equal(result.status, 503)
    assert.doesNotMatch(JSON.stringify(result.body), /fake-unit-test-key/)
    assert.equal(f.calls.length, 2)
  } finally { await f.close() }
})

test('una respuesta que repita la clave se oculta antes de llegar al navegador', async () => {
  const f = await fixture()
  try {
    await f.activate()
    f.setBehavior(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'No mostrar fake-unit-test-key' } }] })))
    const result = await f.request('/ask', { method: 'POST', body: { mode: 'ai', question: 'hola', includeContext: false } })
    assert.equal(result.status, 200)
    assert.doesNotMatch(result.body.answer, /fake-unit-test-key/)
    assert.match(result.body.answer, /secreto oculto/)
  } finally { await f.close() }
})


test('servidores locales usan el protocolo OpenAI real sin clave y todos comparten la conexión del admin', async () => {
  const mock = express()
  mock.use(express.json())
  const requests = []
  mock.get('/v1/models', (req, res) => {
    requests.push({ headers: req.headers, path: req.path })
    res.json({ data: [{ id: 'qwen2.5:3b' }] })
  })
  mock.post('/v1/chat/completions', (req, res) => {
    requests.push({ headers: req.headers, path: req.path, body: req.body })
    res.json({ choices: [{ message: { content: 'Respuesta HTTP de servidor local de prueba, sin inferencia real.' } }] })
  })
  const server = mock.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const f = await fixture({ allowedOrigins: origin })
  try {
    f.setBehavior((url, options) => fetch(url, options))
    const baseUrl = `${origin}/v1`
    const models = await f.request('/models', { method: 'POST', body: { provider: 'ollama', baseUrl } })
    assert.equal(models.status, 200)
    assert.deepEqual(models.body.models, ['qwen2.5:3b'])
    const configured = await f.activate({ provider: 'ollama', baseUrl, model: 'qwen2.5:3b', apiKey: '' })
    assert.equal(configured.status, 200)
    assert.equal(configured.body.local, true)
    assert.equal(configured.body.baseUrl, baseUrl)
    assert.equal(f.db.prepare('SELECT encrypted_key FROM ai_settings').get().encrypted_key, '')
    assert.equal(existsSync(path.join(f.dir, 'master.key')), false)
    assert.equal((await f.request('/config', { role: 'member' })).body.model, 'qwen2.5:3b')
    const reply = await f.request('/ask', { method: 'POST', role: 'viewer', body: { mode: 'ai', question: 'hola', includeContext: false, model: 'unauthorized-other-model' } })
    assert.equal(reply.status, 200)
    assert.equal(reply.body.local, true)
    assert.match(reply.body.answer, /Respuesta HTTP/)
    assert.ok(requests.every((request) => !request.headers.authorization))
    assert.equal(requests.at(-1).body.model, 'qwen2.5:3b')
    assert.equal(requests.at(-1).body.max_tokens, 800)
    assert.equal(requests.at(-1).body.stream, false)
  } finally { await f.close(); await new Promise((resolve) => server.close(resolve)) }
})

test('Ollama, LM Studio y otros servidores compatibles tienen clave opcional y endpoints /v1', async () => {
  const f = await fixture()
  try {
    for (const provider of providers.filter((item) => item.local)) {
      assert.equal((await f.activate({ provider: provider.id, apiKey: '', model: provider.model })).status, 200)
      assert.equal(f.calls.at(-1).url, `${provider.base}/chat/completions`)
      assert.equal(f.calls.at(-1).options.headers.Authorization, undefined)
    }
    const metadata = (await f.request('/config')).body.providers
    assert.equal(metadata.find((provider) => provider.id === 'ollama').keyRequired, false)
    assert.equal(metadata.find((provider) => provider.id === 'openai').keyRequired, true)
  } finally { await f.close() }
})

test('solo se aceptan destinos locales conocidos o autorizados explícitamente por el operador', async () => {
  const provider = providers.find((item) => item.id === 'compatible')
  assert.equal(resolveBase(provider, 'http://localhost:1234/v1/'), 'http://localhost:1234/v1')
  assert.equal(resolveBase(provider, 'http://ollama:11434/v1', 'http://ollama:11434'), 'http://ollama:11434/v1')
  for (const url of ['http://169.254.169.254/v1', 'http://localhost:3002/v1', 'http://example.com/v1', 'http://user:password@localhost:1234/v1', 'http://localhost:1234/v1?query=secret', 'file:///v1', 'http://localhost:1234/admin']) {
    assert.throws(() => resolveBase(provider, url, ''))
  }
})

test('la migración conserva la configuración compartida de nube ya existente', async () => {
  const f = await fixture({ legacy: true })
  try {
    const result = await f.request('/config')
    assert.equal(result.status, 200)
    assert.equal(result.body.provider, 'openai')
    assert.equal(result.body.model, 'gpt-4o-mini')
    assert.equal(result.body.baseUrl, 'https://api.openai.com/v1')
    assert.equal(f.db.prepare('SELECT encrypted_key FROM ai_settings').get().encrypted_key, 'old-encrypted-value')
    assert.doesNotMatch(JSON.stringify(result.body), /old-encrypted-value/)
  } finally { await f.close() }
})

test('si no se ha instalado el servidor local, el error no simula una conexión activa', async () => {
  const f = await fixture()
  try {
    f.setBehavior(async () => { throw new Error('ECONNREFUSED') })
    const result = await f.activate({ provider: 'ollama', model: 'qwen2.5:3b', apiKey: '' })
    assert.equal(result.status, 502)
    assert.match(result.body.error, /Arranca Ollama o LM Studio/)
    assert.equal((await f.request('/config')).body.configured, false)
  } finally { await f.close() }
})
