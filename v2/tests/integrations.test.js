import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { registerIntegrationRoutes } from '../server/integrations.js'
import { integrationVault } from '../server/integration-vault.js'

const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
async function fixture({ demoMode = false, publicBaseUrl = 'https://app.example.com' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'webai-oauth-')), db = new Database(':memory:'), calls = [], audit = []
  const keyPath = path.join(dir, 'integrations-master.key')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY); INSERT INTO tenants VALUES ('a'), ('b');
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, role TEXT, status TEXT);
    INSERT INTO users VALUES ('a-admin','a','admin','active'), ('b-admin','b','admin','active'), ('a-member','a','member','active');`)
  let handler = async (url) => url.includes('/token') || url.includes('oauth.v2.access')
    ? json({ access_token: 'fake-access-secret', refresh_token: 'fake-refresh-secret', expires_in: 3600 })
    : url.endsWith('/revoke') ? json({}) : json({ ok: true, items: [], value: [], channels: [] })
  let authCalls = 0
  const authenticate = (req, res, next) => {
    authCalls++
    if (req.get('test-anonymous')) return res.status(401).json({ error: 'Inicia sesión' })
    const tenant = req.get('test-tenant') || 'a', role = req.get('test-role') || 'admin'
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(`${tenant}-${role}`)
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Inicia sesión' })
    req.user = user; req.tenantId = tenant; next()
  }
  const app = express(); app.use(express.json())
  registerIntegrationRoutes(app, { db, authenticate, demoMode, keyPath, publicBaseUrl, recordActivity: (...args) => audit.push(args), fetchImpl: async (url, options) => { calls.push({ url, options }); return handler(url, options) } })
  app.use('/api', authenticate, (req, res) => res.status(404).end())
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  async function request(route = '', { method = 'GET', body, tenant = 'a', role = 'admin', anonymous = false } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/integrations${route}`, { method, headers: { 'Content-Type': 'application/json', 'test-tenant': tenant, 'test-role': role, ...(anonymous ? { 'test-anonymous': 'true' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const raw = await response.text()
    let data; try { data = JSON.parse(raw) } catch { data = null }
    return { status: response.status, headers: response.headers, body: data, raw }
  }
  const configure = (provider = 'google', options = {}) => request(`/${provider}/config`, { method: 'PUT', body: { clientId: 'test-client-id', clientSecret: 'fake-client-secret', microsoftTenant: 'organizations' }, ...options })
  const authorize = (provider = 'google', options = {}) => request(`/${provider}/authorize`, { method: 'POST', body: {}, ...options })
  const finish = (provider, url, options = {}) => request(`/${provider}/callback?state=${new URL(url).searchParams.get('state')}&code=test-code`, { anonymous: true, ...options })
  const connect = async (provider = 'google', options = {}) => {
    assert.equal((await configure(provider, options)).status, 200)
    const started = await authorize(provider, options)
    assert.equal(started.status, 200)
    const done = await finish(provider, started.body.url)
    assert.equal(done.status, 200, done.raw)
    return started
  }
  const operation = (provider, body, options = {}) => request(`/${provider}/operation`, { method: 'POST', body, ...options })
  return { db, calls, audit, dir, keyPath, request, configure, authorize, finish, connect, operation, authCalls: () => authCalls, setHandler: (value) => { handler = value }, close: async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('OAuth exige sesión, limita a admin y separa las empresas', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.request('', { anonymous: true })).status, 401)
    assert.equal((await f.configure('google', { role: 'member' })).status, 403)
    assert.equal((await f.authorize('google', { role: 'member' })).status, 403)
    assert.equal((await f.operation('google', { action: 'calendars' }, { role: 'member' })).status, 403)
    await f.configure()
    assert.equal((await f.authorize('google', { tenant: 'b' })).status, 409)
    assert.equal((await f.request('', { tenant: 'b' })).body.providers.some((p) => p.configured), false)
    assert.equal((await f.request('/__proto__/config', { method: 'PUT', body: {} })).status, 404)
    assert.equal(f.calls.length, 0)
  } finally { await f.close() }
})

test('la demo rechaza secretos, conexión, operaciones, borrados y callback sin crear clave', async () => {
  const f = await fixture({ demoMode: true })
  try {
    assert.equal((await f.request()).body.demoMode, true)
    for (const [route, method] of [['/google/config', 'PUT'], ['/google/authorize', 'POST'], ['/google/operation', 'POST'], ['/google/connection', 'DELETE'], ['/google/config', 'DELETE']]) assert.equal((await f.request(route, { method, body: {} })).status, 403)
    assert.equal((await f.request('/google/callback?state=wrong&code=wrong')).status, 403)
    assert.equal(existsSync(f.keyPath), false)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM integration_settings').get().n, 0)
    assert.equal(f.calls.length, 0)
  } finally { await f.close() }
})

test('credenciales AES-GCM, archivo 0600 y GET sin secretos ni tokens', async () => {
  const f = await fixture()
  try {
    await f.connect()
    assert.equal(statSync(f.keyPath).mode & 0o777, 0o600)
    assert.equal(readFileSync(f.keyPath).length, 32)
    const stored = JSON.stringify(f.db.prepare('SELECT * FROM integration_settings').get())
    assert.doesNotMatch(stored, /fake-client-secret|fake-access-secret|fake-refresh-secret/)
    const result = await f.request(), member = await f.request('', { role: 'member' })
    assert.equal(result.body.providers[0].connected, true)
    assert.equal(member.body.providers[0].clientId, undefined)
    assert.doesNotMatch(result.raw + member.raw + JSON.stringify(f.audit), /fake-client-secret|fake-access-secret|fake-refresh-secret/)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    assert.equal((await f.configure('google', { body: { clientId: 'test-client-id', clientSecret: '' } })).status, 200)
    assert.equal((await f.request()).body.providers[0].connected, false)
  } finally { await f.close() }
})

test('el cifrado liga secretos a empresa, proveedor y tipo', () => {
  const vault = integrationVault('/unused', 'ab'.repeat(32))
  const secret = vault.seal({ secret: 'sensitive' }, 'a:google:tokens')
  assert.deepEqual(vault.open(secret, 'a:google:tokens'), { secret: 'sensitive' })
  for (const context of ['b:google:tokens', 'a:slack:tokens', 'a:google:config']) assert.throws(() => vault.open(secret, context))
  assert.throws(() => integrationVault('/unused', 'invalid').seal({}, 'x'))
})

test('OAuth con PKCE S256, callback sin cookie y estado de un solo uso', async () => {
  const f = await fixture()
  try {
    await f.configure()
    const start = await f.authorize(), url = new URL(start.body.url), state = url.searchParams.get('state')
    assert.equal(url.origin, 'https://accounts.google.com')
    assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example.com/api/integrations/google/callback')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.doesNotMatch(start.raw, /fake-client-secret|code_verifier/)
    const stored = f.db.prepare('SELECT * FROM integration_oauth_states').get()
    assert.notEqual(stored.state_hash, state)
    const before = f.authCalls()
    assert.equal((await f.finish('google', start.body.url)).status, 200)
    assert.equal(f.authCalls(), before, 'el callback no puede depender de la cookie de la vista previa')
    const exchange = f.calls[0], params = new URLSearchParams(exchange.options.body)
    assert.equal(params.get('grant_type'), 'authorization_code')
    assert.equal(params.get('client_secret'), 'fake-client-secret')
    assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'))
    assert.equal(exchange.options.redirect, 'error')
    assert.equal((await f.finish('google', start.body.url)).status, 400)
  } finally { await f.close() }
})

test('estado inválido, proveedor diferente, caducidad y consentimiento denegado no conectan', async () => {
  const f = await fixture()
  try {
    await f.configure()
    assert.equal((await f.request('/google/callback?state=wrong&code=bad')).status, 400)
    let start = await f.authorize()
    assert.equal((await f.finish('slack', start.body.url)).status, 400)
    f.db.prepare('UPDATE integration_oauth_states SET expires_at = 0').run()
    assert.equal((await f.finish('google', start.body.url)).status, 400)
    start = await f.authorize()
    const result = await f.request(`/google/callback?state=${new URL(start.body.url).searchParams.get('state')}&error=access_denied&error_description=SECRET`)
    assert.equal(result.status, 400)
    assert.doesNotMatch(result.raw, /SECRET/)
    assert.match(result.headers.get('content-security-policy'), /default-src 'none'/)
    assert.equal(f.calls.length, 0)
    assert.equal((await f.request()).body.providers[0].connected, false)
  } finally { await f.close() }
})

test('desactivación o pérdida del rol durante OAuth impide guardar tokens', async () => {
  const f = await fixture()
  try {
    await f.configure()
    let start = await f.authorize()
    f.db.prepare("UPDATE users SET status = 'disabled' WHERE id = 'a-admin'").run()
    assert.equal((await f.finish('google', start.body.url)).status, 400)
    f.db.prepare("UPDATE users SET status = 'active' WHERE id = 'a-admin'").run()
    start = await f.authorize()
    f.setHandler(async () => { f.db.prepare("UPDATE users SET role = 'member' WHERE id = 'a-admin'").run(); return json({ access_token: 'private' }) })
    assert.equal((await f.finish('google', start.body.url)).status, 403)
    assert.equal(f.db.prepare('SELECT tokens_cipher FROM integration_settings').get().tokens_cipher, null)
  } finally { await f.close() }
})

test('una autorización nueva o credenciales cambiadas invalidan callbacks antiguos', async () => {
  const f = await fixture()
  try {
    await f.configure()
    const first = await f.authorize(), second = await f.authorize()
    assert.equal((await f.finish('google', first.body.url)).status, 400)
    await f.configure()
    assert.equal((await f.finish('google', second.body.url)).status, 400)
    assert.equal(f.calls.length, 0)
  } finally { await f.close() }
})

test('URLs de retorno y tenant Microsoft no permiten redirecciones arbitrarias', async () => {
  for (const publicBaseUrl of ['', 'http://public.example.com', 'https://app.example.com/other', 'https://name:password@app.example.com', 'https://app.example.com/?redirect=evil']) {
    const f = await fixture({ publicBaseUrl })
    try { await f.configure(); assert.equal((await f.authorize()).status, 503); assert.equal(f.calls.length, 0) } finally { await f.close() }
  }
  const f = await fixture()
  try {
    assert.equal((await f.configure('teams', { body: { clientId: 'id', clientSecret: 'secret', microsoftTenant: '../evil' } })).status, 400)
    assert.equal((await f.configure('teams', { body: { clientId: 'id', clientSecret: 'secret', microsoftTenant: ['organizations'] } })).status, 400)
  } finally { await f.close() }
})

test('Microsoft y Slack utilizan los protocolos y permisos correspondientes', async () => {
  const f = await fixture()
  try {
    for (const id of ['outlook', 'teams', 'slack']) {
      const start = await f.connect(id), url = new URL(start.body.url)
      assert.equal(url.origin, id === 'slack' ? 'https://slack.com' : 'https://login.microsoftonline.com')
      assert.equal(url.searchParams.has('code_challenge'), id !== 'slack')
      const params = new URLSearchParams(f.calls.at(-1).options.body)
      assert.equal(params.has('code_verifier'), id !== 'slack')
      if (id !== 'slack') assert.match(params.get('scope'), /offline_access/)
    }
  } finally { await f.close() }
})

test('calendarios y eventos Google: intervalos validados y destinos codificados', async () => {
  const f = await fixture()
  try {
    await f.connect()
    f.setHandler(async (url) => url.includes('calendarList') ? json({ items: [{ id: 'primary', summary: 'Trabajo' }], nextPageToken: 'another' }) : json({ id: 'event-1', items: [] }))
    const list = await f.operation('google', { action: 'calendars' })
    assert.deepEqual(list.body, { items: [{ id: 'primary', name: 'Trabajo' }], more: true })
    const body = { action: 'createEvent', calendarId: 'work@example.com', title: 'Reunión', start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T11:00:00+02:00' }
    assert.equal((await f.operation('google', body)).body.created, true)
    const call = f.calls.at(-1), sent = JSON.parse(call.options.body)
    assert.match(call.url, /work%40example.com\/events$/)
    assert.equal(sent.start.dateTime, '2026-10-21T08:00:00.000Z')
    assert.equal(sent.attendees, undefined)
    const count = f.calls.length
    for (const invalid of [{ start: 'not-a-date' }, { end: body.start }, { calendarId: '../../me' }, { end: '2027-01-01T00:00:00Z' }]) assert.equal((await f.operation('google', { ...body, ...invalid })).status, 400)
    assert.equal(f.calls.length, count)
  } finally { await f.close() }
})

test('Outlook crea eventos y acepta correo explícito, sin exponer el token', async () => {
  const f = await fixture()
  try {
    await f.connect('outlook')
    f.setHandler(async (url) => url.endsWith('/sendMail') ? new Response(null, { status: 202 }) : json({ id: 'new-event' }))
    assert.equal((await f.operation('outlook', { action: 'createEvent', calendarId: 'AAMk=', title: 'Evento', start: '2026-10-21T10:00:00Z', end: '2026-10-21T11:00:00Z' })).body.created, true)
    assert.equal((await f.operation('outlook', { action: 'sendMail', recipient: 'person@example.com', subject: 'Aviso', message: 'Texto' })).body.accepted, true)
    const call = f.calls.at(-1)
    assert.equal(call.url, 'https://graph.microsoft.com/v1.0/me/sendMail')
    assert.equal(JSON.parse(call.options.body).message.body.contentType, 'Text')
    assert.equal(call.options.headers.Authorization, 'Bearer fake-access-secret')
    assert.equal((await f.operation('outlook', { action: 'sendMail', recipient: '<bad>', subject: 'Aviso', message: 'Texto' })).status, 400)
  } finally { await f.close() }
})

test('Slack y Teams listan destinos y envían mensajes solo de texto', async () => {
  const f = await fixture()
  try {
    await f.connect('slack'); await f.connect('teams')
    f.setHandler(async (url) => url.includes('conversations.list') ? json({ ok: true, channels: [{ id: 'C12345678', name: 'general' }] }) : url.includes('chat.postMessage') ? json({ ok: true, ts: '123.4' }) : json({ value: [{ id: 'team-1', displayName: 'Equipo' }], id: 'message-1' }))
    assert.equal((await f.operation('slack', { action: 'channels' })).body.items[0].id, 'C12345678')
    assert.equal((await f.operation('slack', { action: 'sendMessage', channelId: 'C12345678', message: '<script>not html</script>' })).body.sent, true)
    assert.equal(JSON.parse(f.calls.at(-1).options.body).mrkdwn, false)
    assert.equal((await f.operation('teams', { action: 'teams' })).body.items[0].name, 'Equipo')
    assert.equal((await f.operation('teams', { action: 'channels', teamId: 'team-1' })).status, 200)
    assert.equal((await f.operation('teams', { action: 'sendMessage', teamId: 'team-1', channelId: '19:channel@thread.tacv2', message: 'Hola' })).body.sent, true)
    assert.equal(JSON.parse(f.calls.at(-1).options.body).body.contentType, 'text')
    assert.match(f.calls.at(-1).url, /19%3Achannel%40thread.tacv2\/messages$/)
    assert.equal((await f.operation('teams', { action: 'sendMessage', teamId: '..', channelId: 'x', message: 'Hola' })).status, 400)
  } finally { await f.close() }
})

test('Teams genera enlaces de reunión solo en dominios conocidos', async () => {
  const f = await fixture()
  try {
    await f.connect('teams')
    const body = { action: 'createMeeting', title: 'Trabajo', start: '2026-10-21T10:00:00Z', end: '2026-10-21T11:00:00Z' }
    f.setHandler(async () => json({ id: 'meeting', joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/example' }))
    assert.match((await f.operation('teams', body)).body.joinUrl, /^https:\/\/teams.microsoft.com/)
    f.setHandler(async () => json({ id: 'meeting', joinWebUrl: 'https://evil.example.com/steal' }))
    assert.equal((await f.operation('teams', body)).status, 502)
  } finally { await f.close() }
})

test('renovación automática única ante operaciones concurrentes', async () => {
  const f = await fixture()
  try {
    f.setHandler(async () => json({ access_token: 'old-token', refresh_token: 'refresh', expires_in: 1 }))
    await f.connect()
    let refreshes = 0
    f.setHandler(async (url, options) => {
      if (url.endsWith('/token')) { refreshes++; await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(new URLSearchParams(options.body).get('grant_type'), 'refresh_token'); return json({ access_token: 'new-token', expires_in: 3600 }) }
      assert.equal(options.headers.Authorization, 'Bearer new-token'); return json({ items: [] })
    })
    const results = await Promise.all([f.operation('google', { action: 'calendars' }), f.operation('google', { action: 'calendars' })])
    assert.ok(results.every((result) => result.status === 200)); assert.equal(refreshes, 1)
  } finally { await f.close() }
})

test('una renovación pendiente no resucita una conexión desconectada', async () => {
  const f = await fixture()
  try {
    f.setHandler(async () => json({ access_token: 'old-token', refresh_token: 'refresh', expires_in: 1 }))
    await f.connect()
    let release, started
    const waiting = new Promise((resolve) => { started = resolve })
    f.setHandler(async (url) => {
      if (url.endsWith('/token')) { started(); return new Promise((resolve) => { release = () => resolve(json({ access_token: 'late-token', expires_in: 3600 })) }) }
      return json({})
    })
    const pending = f.operation('google', { action: 'calendars' }); await waiting
    assert.equal((await f.request('/google/connection', { method: 'DELETE' })).status, 200)
    release(); assert.equal((await pending).status, 409)
    assert.equal((await f.request()).body.providers[0].connected, false)
  } finally { await f.close() }
})

test('errores externos nunca filtran secretos ni expulsan de la sesión local', async () => {
  const f = await fixture()
  try {
    await f.connect()
    f.setHandler(async () => json({ error: 'fake-access-secret fake-client-secret' }, 403))
    const response = await f.operation('google', { action: 'calendars' })
    assert.equal(response.status, 422); assert.doesNotMatch(response.raw, /fake-access-secret|fake-client-secret/)
    f.setHandler(async () => { throw new Error('private stack fake-access-secret') })
    assert.equal((await f.operation('google', { action: 'calendars' })).status, 502)
    const disconnected = await f.request('/google/connection', { method: 'DELETE' })
    assert.equal(disconnected.body.disconnected, true); assert.equal(disconnected.body.revoked, false)
    assert.equal((await f.request('/google/config', { method: 'DELETE' })).status, 204)
    assert.equal((await f.request()).body.providers[0].configured, false)
  } finally { await f.close() }
})

test('401 externo renueva una vez y nunca convierte el error en logout local', async () => {
  const f = await fixture()
  try {
    await f.connect()
    let refreshes = 0, apiCalls = 0
    f.setHandler(async (url, options) => {
      if (url.endsWith('/token')) { refreshes++; return json({ access_token: 'renewed', expires_in: 3600 }) }
      apiCalls++
      return options.headers.Authorization === 'Bearer renewed' ? json({ items: [] }) : json({}, 401)
    })
    assert.equal((await f.operation('google', { action: 'calendars' })).status, 200)
    assert.equal(refreshes, 1); assert.equal(apiCalls, 2)
    f.setHandler(async (url) => url.endsWith('/token') ? json({ access_token: 'rejected-too', expires_in: 3600 }) : json({}, 401))
    assert.equal((await f.operation('google', { action: 'calendars' })).status, 422)
  } finally { await f.close() }
})

test('refresh revocado desconecta localmente sin filtrar errores del proveedor', async () => {
  const f = await fixture()
  try {
    f.setHandler(async () => json({ access_token: 'old-token', refresh_token: 'refresh', expires_in: 1 }))
    await f.connect()
    f.setHandler(async () => json({ error: 'invalid_grant', error_description: 'fake-refresh-secret' }, 400))
    const result = await f.operation('google', { action: 'calendars' })
    assert.equal(result.status, 422)
    assert.doesNotMatch(result.raw, /fake-refresh-secret/)
    assert.equal((await f.request()).body.providers[0].connected, false)
  } finally { await f.close() }
})

test('desconectar mientras se intercambia un código impide guardar tokens tardíos', async () => {
  const f = await fixture()
  try {
    await f.configure(); const start = await f.authorize()
    let release, started
    const waiting = new Promise((resolve) => { started = resolve })
    f.setHandler(async () => { started(); return new Promise((resolve) => { release = () => resolve(json({ access_token: 'late' })) }) })
    const pending = f.finish('google', start.body.url); await waiting
    assert.equal((await f.request('/google/connection', { method: 'DELETE' })).status, 200)
    release(); assert.equal((await pending).status, 409)
    assert.equal((await f.request()).body.providers[0].connected, false)
    assert.equal(f.audit.some((entry) => entry[1] === 'connected'), false)
  } finally { await f.close() }
})

test('limita operaciones sin iniciar llamadas externas ni acumular estados', async () => {
  const f = await fixture()
  try {
    await f.configure()
    for (let i = 0; i < 29; i++) assert.equal((await f.authorize()).status, 200)
    assert.equal((await f.authorize()).status, 429)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM integration_oauth_states').get().n, 1)
    assert.equal(f.calls.length, 0)
  } finally { await f.close() }
})

test('no simula envíos o creaciones correctas cuando falta la confirmación del proveedor', async () => {
  const f = await fixture()
  try {
    await f.connect('google'); await f.connect('slack')
    f.setHandler(async () => json({ ok: true }))
    assert.equal((await f.operation('google', { action: 'createEvent', title: 'Evento', start: '2026-10-21T10:00:00Z', end: '2026-10-21T11:00:00Z' })).status, 502)
    assert.equal((await f.operation('slack', { action: 'sendMessage', channelId: 'C12345678', message: 'Hola' })).status, 502)
  } finally { await f.close() }
})
