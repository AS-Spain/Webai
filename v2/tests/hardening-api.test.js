import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const directory = mkdtempSync(path.join(tmpdir(), 'webai-hardening-'))
process.env.V2_DB_PATH = path.join(directory, 'private.sqlite')
process.env.DEMO_MODE = 'false'
process.env.BOOTSTRAP_TOKEN = 'only-fixture-operator-token-'.repeat(3)
process.env.APP_BASE_URL = 'https://fixture.example.com'
delete process.env.SMTP_HOST
const token = process.env.BOOTSTRAP_TOKEN
const realFetch = globalThis.fetch
process.env.V2_AI_ENCRYPTION_KEY = 'cd'.repeat(32) // Test-only: no key files written to live data directory.
let vendorBehavior = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }))
globalThis.fetch = (...args) => vendorBehavior(...args)
const { app } = await import('../server/app.js')
globalThis.fetch = realFetch
const { db } = await import('../server/database.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
async function request(route, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${base}/api${route}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const password = 'a-strong-test-password'
let cookie
const login = () => request('/auth/login', { method: 'POST', body: { email: 'auditor@example.com', password }, cookie })

test('endurecimiento sobre la aplicación real con SQLite temporal', async (suite) => {
  try {
    await suite.test('bootstrap concurrente solo crea un administrador y archivo privado', async () => {
      const body = { company: 'Audit', name: 'Auditor', email: 'auditor@example.com', password, bootstrapToken: token }
      const results = await Promise.all([request('/setup/bootstrap', { method: 'POST', body }), request('/setup/bootstrap', { method: 'POST', body })])
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
      cookie = results.find((r) => r.status === 201).cookie
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tenants').get().n, 1)
      assert.equal(statSync(process.env.V2_DB_PATH).mode & 0o077, 0)
    })
    await suite.test('CSRF con cookie válida no cierra sesión ni modifica datos', async () => {
      assert.equal((await request('/auth/logout', { method: 'POST', cookie, headers: { Origin: 'https://attacker.example' } })).status, 403)
      assert.equal((await request('/auth/me', { cookie })).status, 200)
      const body = { title: 'CSRF', assignee: 'Auditor', due_date: '2026-12-01' }
      assert.equal((await request('/tasks', { method: 'POST', cookie, body, headers: { Origin: 'https://attacker.example' } })).status, 403)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0)
      assert.equal((await request('/auth/logout', { method: 'POST', cookie, headers: { 'Content-Type': 'text/plain' } })).status, 415)
      assert.equal((await request('/auth/me', { cookie })).status, 200)
    })
    await suite.test('validación CRUD: tipos, longitudes, fechas, referencias y PATCH obligatorio', async () => {
      const examples = {
        projects: { name: 'Project', owner: 'Auditor', due_date: '2026-12-01' },
        tasks: { title: 'Task', assignee: 'Auditor', due_date: '2026-12-01' },
        meetings: { title: 'Meeting', starts_at: '2026-12-01T12:00:00Z', attendees: ['Auditor'] },
        events: { title: 'Event', starts_at: '2026-12-01T12:00:00Z' },
        issues: { title: 'Issue', owner: 'Auditor' },
      }
      const invalid = {
        projects: [{ progress: 101 }, { progress: 1.5 }, { budget: true }, { due_date: '2026-02-30' }, { color: 'url(https://attacker)' }, { owner: 'Foreign user' }],
        tasks: [{ title: {} }, { title: 'a'.repeat(201) }, { due_date: 'not-a-date' }, { project_id: 'foreign' }, { assignee: 'Foreign user' }],
        meetings: [{ starts_at: '2026-02-30T12:00:00Z' }, { starts_at: '2026-12-01T12:00' }, { duration: 0 }, { duration: 1.5 }, { duration: 1441 }, { attendees: {} }, { attendees: ['Foreign user'] }, { agenda: 'a'.repeat(8001) }],
        events: [{ attendees: -1 }, { attendees: 1.5 }, { attendees: null }],
        issues: [{ impact: Infinity }, { impact: true }, { description: {} }, { owner: 'Foreign user' }],
      }
      for (const [resource, body] of Object.entries(examples)) {
        const created = await request(`/${resource}`, { method: 'POST', body, cookie })
        assert.equal(created.status, 201, resource)
        for (const extra of [...invalid[resource], { tenant_id: 'foreign' }, { [body.name ? 'name' : 'title']: '' }]) {
          assert.equal((await request(`/${resource}`, { method: 'POST', body: { ...body, ...extra }, cookie })).status, 400, JSON.stringify(extra))
          assert.equal((await request(`/${resource}/${created.body.id}`, { method: 'PATCH', body: extra, cookie })).status, 400, JSON.stringify(extra))
        }
        const untouched = db.prepare(`SELECT * FROM ${resource} WHERE id = ?`).get(created.body.id)
        assert.equal(untouched.title || untouched.name, body.title || body.name)
      }
    })
    await suite.test('fallo de auditoría revierte crear, editar y borrar; nunca persiste un éxito parcial', async () => {
      const task = db.prepare('SELECT * FROM tasks LIMIT 1').get()
      db.exec("CREATE TEMP TRIGGER reject_activity BEFORE INSERT ON activities BEGIN SELECT RAISE(ABORT, 'SYNTHETIC-SECRET-DB-ERROR'); END")
      try {
        const create = await request('/tasks', { method: 'POST', cookie, body: { title: 'Must rollback', assignee: 'Auditor', due_date: '2026-12-01' } })
        assert.equal(create.status, 500)
        assert.doesNotMatch(JSON.stringify(create.body), /SYNTHETIC-SECRET|sqlite|RAISE/)
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title = 'Must rollback'").get().n, 0)
        assert.equal((await request(`/tasks/${task.id}`, { method: 'PATCH', cookie, body: { title: 'Must rollback' } })).status, 500)
        assert.equal(db.prepare('SELECT title FROM tasks WHERE id = ?').get(task.id).title, task.title)
        assert.equal((await request(`/tasks/${task.id}`, { method: 'DELETE', cookie })).status, 500)
        assert.ok(db.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id))
      } finally { db.exec('DROP TRIGGER reject_activity') }
    })
    await suite.test('el texto no se interpreta como SQL ni HTML en la API', async () => {
      const title = '<img src=x onerror=alert(1)>; DROP TABLE users;--'
      const result = await request('/tasks', { method: 'POST', cookie, body: { title, assignee: 'Auditor', due_date: '2026-12-01' } })
      assert.equal(result.status, 201)
      assert.equal(result.body.title, title)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
    })
    await suite.test('login rota la sesión previa y una sesión caducada no accede', async () => {
      const previous = cookie, result = await login()
      assert.equal(result.status, 200)
      cookie = result.cookie
      assert.notEqual(cookie, previous)
      assert.equal((await request('/auth/me', { cookie: previous })).status, 401)
      db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1)
      assert.equal((await request('/auth/me', { cookie })).status, 401)
      cookie = (await login()).cookie
    })
    await suite.test('aceptación concurrente y rechazo de invitación revocada', async () => {
      const create = async (email) => {
        const result = await request('/invitations', { method: 'POST', cookie, body: { email, role: 'member' } })
        assert.equal(result.status, 201)
        return new URL(result.body.activationUrl).searchParams.get('invite')
      }
      const inviteToken = await create('invite@example.com')
      const body = { token: inviteToken, name: 'Invited', password }
      const results = await Promise.all([request('/invitations/accept', { method: 'POST', body }), request('/invitations/accept', { method: 'POST', body })])
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 410])
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'invite@example.com'").get().n, 1)
      // Transactional recheck also covers expiration/revocation after initial lookup.
      const revoked = await create('revoked@example.com')
      db.prepare('UPDATE invitations SET revoked_at = ? WHERE email = ?').run(new Date().toISOString(), 'revoked@example.com')
      assert.equal((await request('/invitations/accept', { method: 'POST', body: { token: revoked, name: 'Revoked', password } })).status, 410)
    })
    await suite.test('disparador no implementado no responde éxito ni incrementa ejecuciones', async () => {
      const tenant = db.prepare('SELECT id FROM tenants').get().id
      db.prepare("INSERT INTO automations (id, tenant_id, name, description, trigger_key, enabled, created_at) VALUES ('unsupported', ?, 'Notes', '', 'meeting_notes', 1, ?)").run(tenant, new Date().toISOString())
      assert.equal((await request('/automations/unsupported/run', { method: 'POST', cookie })).status, 409)
      assert.equal(db.prepare("SELECT runs FROM automations WHERE id = 'unsupported'").get().runs, 0)
    })
    await suite.test('RBAC CRUD completo y aislamiento entre empresas en todos los recursos', async () => {
      const examples = {
        projects: { name: 'Matrix project', owner: 'Matrix admin', due_date: '2026-12-01' },
        tasks: { title: 'Matrix task', assignee: 'Matrix member', due_date: '2026-12-01' },
        meetings: { title: 'Matrix meeting', starts_at: '2026-12-01T12:00:00Z', attendees: [] },
        events: { title: 'Matrix event', starts_at: '2026-12-01T12:00:00Z' },
        issues: { title: 'Matrix issue', owner: 'Matrix admin' },
      }
      db.prepare('INSERT INTO tenants VALUES (?, ?)').run('matrix', 'Matrix')
      db.prepare('INSERT INTO tenants VALUES (?, ?)').run('foreign', 'Foreign')
      const credentials = db.prepare("SELECT salt, password_hash FROM users WHERE email = 'auditor@example.com'").get()
      const cookies = {}
      for (const role of ['admin', 'manager', 'member', 'viewer', 'foreign']) {
        db.prepare('INSERT INTO users(id, tenant_id, name, email, role, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`matrix-${role}`, role === 'foreign' ? 'foreign' : 'matrix', `Matrix ${role}`, `matrix-${role}@example.com`, role === 'foreign' ? 'admin' : role, credentials.salt, credentials.password_hash)
        const result = await request('/auth/login', { method: 'POST', body: { email: `matrix-${role}@example.com`, password } })
        assert.equal(result.status, 200)
        cookies[role] = result.cookie
      }
      for (const [resource, body] of Object.entries(examples)) for (const role of ['admin', 'manager', 'member', 'viewer']) {
        const original = await request(`/${resource}`, { method: 'POST', cookie: cookies.admin, body })
        assert.equal(original.status, 201)
        const allowed = ['admin', 'manager'].includes(role) || (role === 'member' && ['tasks', 'meetings', 'issues'].includes(resource))
        assert.equal((await request(`/${resource}`, { method: 'POST', cookie: cookies[role], body })).status, allowed ? 201 : 403, `${resource}/${role}/create`)
        assert.equal((await request(`/${resource}/${original.body.id}`, { method: 'PATCH', cookie: cookies[role], body: { [resource === 'projects' ? 'name' : 'title']: 'Changed' } })).status, allowed ? 200 : 403, `${resource}/${role}/update`)
        assert.equal((await request(`/${resource}/${original.body.id}`, { method: 'PATCH', cookie: cookies.foreign, body: { [resource === 'projects' ? 'name' : 'title']: 'Foreign' } })).status, 404)
        assert.equal((await request(`/${resource}/${original.body.id}`, { method: 'DELETE', cookie: cookies.foreign })).status, resource === 'issues' ? 405 : 404)
        const canDelete = ['admin', 'manager'].includes(role)
        assert.equal((await request(`/${resource}/${original.body.id}`, { method: 'DELETE', cookie: cookies[role] })).status, canDelete ? resource === 'issues' ? 405 : 204 : 403, `${resource}/${role}/delete`)
      }
      for (const resource of Object.keys(examples)) assert.equal((await request(`/${resource}`, { cookie: cookies.foreign })).body.total, 0)
    })
    await suite.test('cerrar sesión durante una prueba IA impide guardar, aunque responda el proveedor simulado', async () => {
      const body = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'fake-hardening-key', allowContext: false }
      assert.equal((await request('/ai/config', { method: 'PUT', cookie, body })).status, 200)
      let started, release
      const seen = new Promise((resolve) => { started = resolve }), gate = new Promise((resolve) => { release = resolve })
      vendorBehavior = async () => { started(); await gate; return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] })) }
      const pending = request('/ai/config', { method: 'PUT', cookie, body: { ...body, model: 'stale-model' } })
      await seen
      assert.equal((await request('/auth/logout', { method: 'POST', cookie })).status, 204)
      release()
      assert.equal((await pending).status, 403)
      cookie = (await login()).cookie
      assert.equal((await request('/ai/config', { cookie })).body.model, 'gpt-4o-mini')
    })
    await suite.test('límites de cuenta persistentes, hash corrupto y contraseñas acotadas', async () => {
      assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'auditor@example.com', password: 'a'.repeat(1025) } })).status, 401)
      assert.equal((await request('/auth/login', { method: 'POST', body: { email: {}, password } })).status, 401)
      const before = db.prepare("SELECT password_hash FROM users WHERE email = 'auditor@example.com'").get().password_hash
      db.prepare("UPDATE users SET password_hash = 'invalid' WHERE email = 'auditor@example.com'").run()
      assert.equal((await login()).status, 401)
      db.prepare("UPDATE users SET password_hash = ? WHERE email = 'auditor@example.com'").run(before)
      const row = db.prepare("SELECT count FROM request_limits WHERE scope = 'login-account'").get()
      for (let i = row.count; i < 20; i++) assert.equal((await login()).status, 200)
      const blocked = await login()
      assert.equal(blocked.status, 429)
      assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    })
    await suite.test('health no expone configuración y readiness falla si SQLite no funciona', async () => {
      assert.deepEqual((await request('/health/live')).body, { status: 'ok' })
      assert.deepEqual((await request('/health/ready')).body, { status: 'ready' })
      db.close()
      const unavailable = await request('/health/ready')
      assert.equal(unavailable.status, 503)
      assert.deepEqual(unavailable.body, { status: 'unavailable' })
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (db.open) db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
