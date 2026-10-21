import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { conversationStore } from '../server/ai-conversations.js'
import { assistantActions } from '../server/ai-actions.js'
import { resourceConfig } from '../server/resources.js'

const directory = mkdtempSync(join(tmpdir(), 'assistant-workflows-'))
const original = { ...process.env }, realFetch = globalThis.fetch
let app, db, server, base, cookie, memberCookie, viewerCookie, secondAdminCookie
let requestBody, responseFactory
const normalReply = () => ({ choices: [{ message: { content: 'Respuesta simulada de prueba.' }, finish_reason: 'stop' }] })
const toolReply = (name, args, content = 'CAMBIO YA HECHO (afirmación falsa del modelo)') => () => ({ choices: [{ finish_reason: 'tool_calls', message: { content, tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] })
async function request(path, { method = 'GET', body, session = cookie } = {}) {
  const result = await realFetch(`${base}/api${path}`, { method, headers: { ...(session ? { Cookie: session } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: result.status, headers: result.headers, data: result.status === 204 ? null : await result.json() }
}
const ask = (overrides = {}, session = cookie) => request('/ai/ask', { method: 'POST', session, body: { question: 'Consulta de prueba', mode: 'ai', includeContext: true, includeHistory: false, allowTools: false, ...overrides } })
const confirm = (id, session = cookie, extra = {}) => request(`/ai/actions/${id}/confirm`, { method: 'POST', session, body: { confirm: true, ...extra } })
function turnRequest(id = 'admin') { return { tenantId: 'fixture-tenant', user: { id, tenant_id: 'fixture-tenant', role: 'admin' } } }

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', DEMO_MODE: 'false', BOOTSTRAP_TOKEN: 'workflow-bootstrap-token-1234567890', V2_DB_PATH: join(directory, 'app.sqlite'), V2_MASTER_KEY_PATH: join(directory, 'master.key'), V2_CREDENTIAL_KEY_PATH: join(directory, 'credentials.key') })
  delete process.env.DEMO_AI_ENABLED
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return new Response(JSON.stringify(await (responseFactory || normalReply)()), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const module = await import(`../server/app.js?assistant-workflows=${Date.now()}`)
  app = module.app; db = (await import('../server/database.js')).db
  globalThis.fetch = realFetch
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
  const setup = await request('/setup/bootstrap', { method: 'POST', session: '', body: { name: 'Admin', email: 'admin@example.test', password: 'S3cure-test-Password!', company: 'Fixtures', bootstrapToken: process.env.BOOTSTRAP_TOKEN } })
  assert.equal(setup.status, 201, JSON.stringify(setup.data))
  cookie = setup.headers.get('set-cookie').split(';')[0]
  const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@example.test'").get()
  for (const [id, role] of [['member-fixture', 'member'], ['viewer-fixture', 'viewer'], ['admin-fixture-2', 'admin']]) {
    db.prepare('INSERT INTO users (id, tenant_id, name, email, salt, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, admin.tenant_id, role, `${role}-${id}@example.test`, admin.salt, admin.password_hash, role, 'active')
    const login = await request('/auth/login', { method: 'POST', session: '', body: { email: `${role}-${id}@example.test`, password: 'S3cure-test-Password!' } })
    assert.equal(login.status, 200)
    const session = login.headers.get('set-cookie').split(';')[0]
    if (role === 'member') memberCookie = session
    if (role === 'viewer') viewerCookie = session
    if (role === 'admin') secondAdminCookie = session
  }
  const config = await request('/ai/config', { method: 'PUT', body: { provider: 'ollama', model: 'fixture-model', baseUrl: 'http://127.0.0.1:11434/v1', allowContext: true } })
  assert.equal(config.status, 200)
})
after(async () => { globalThis.fetch = realFetch; if (server) await new Promise((resolve) => server.close(resolve)); db?.close(); for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); rmSync(directory, { recursive: true, force: true }) })

test('historial persistente: se recupera desde otro cliente y no se envía sin consentimiento', async () => {
  const result = await ask({ question: 'PRIMER MENSAJE PRIVADO' })
  assert.equal(result.status, 200)
  assert.equal(typeof result.data.id, 'number')
  assert.equal((await request('/ai/conversation')).data.turns.at(-1).question, 'PRIMER MENSAJE PRIVADO')
  await ask({ question: 'SEGUNDO MENSAJE' })
  assert.ok(!JSON.stringify(requestBody.messages).includes('PRIMER MENSAJE PRIVADO'))
  await ask({ question: 'TERCERO', includeHistory: true })
  assert.ok(JSON.stringify(requestBody.messages).includes('PRIMER MENSAJE PRIVADO'))
  const login = await request('/auth/login', { method: 'POST', session: '', body: { email: 'admin@example.test', password: 'S3cure-test-Password!' } })
  const otherClient = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/ai/conversation', { session: otherClient })).data.turns.length, 3)
  assert.deepEqual((await request('/ai/conversation', { session: memberCookie })).data.turns, [])
  const anonymous = await request('/ai/conversation', { session: '' })
  assert.equal(anonymous.status, 401)
})

test('historial acotado, aislamiento de tenant, borrado y bloqueo de respuestas en vuelo antiguas', () => {
  const store = conversationStore(db)
  const req = turnRequest(), another = { ...req, tenantId: 'another-tenant' }
  // Only fixtures, never write to the live workspace DB.
  db.prepare("INSERT INTO tenants (id, name) VALUES ('fixture-tenant', 'Fixture')").run()
  db.prepare("INSERT INTO users (id, tenant_id, name, email, salt, password_hash, role, status) VALUES ('admin', 'fixture-tenant', 'Admin', 'fixture@example.test', 'unused', 'unused', 'admin', 'active')").run()
  for (let i = 0; i < 45; i++) store.append(req, `question-${i}`, { answer: 'a'.repeat(16000), mode: 'ai' }, store.version(req))
  assert.equal(store.list(req).length, 40)
  assert.equal(store.list(req)[0].question, 'question-5')
  assert.deepEqual(store.list(another), [])
  assert.ok(JSON.stringify(store.messages(req)).length <= 12000)
  const version = store.version(req)
  store.clear(req)
  assert.throws(() => store.append(req, 'stale', { answer: 'stale' }, version), { status: 409 })
  assert.deepEqual(store.list(req), [])
})

test('herramientas: propuesta sin escritura, confirmación con auditoría e idempotencia', async () => {
  responseFactory = toolReply('create_tasks', { title: 'Tarea creada por herramienta', assignee: 'Admin', due_date: '2026-12-01' })
  const before = db.prepare('SELECT count(*) AS count FROM tasks').get().count
  const result = await ask({ allowTools: true })
  assert.equal(result.status, 200, JSON.stringify(result.data))
  assert.equal(requestBody.tools.length, 10)
  const proposal = result.data.proposals[0]
  assert.equal(proposal.status, 'pending')
  assert.ok(!result.data.answer.includes('CAMBIO YA HECHO'))
  assert.equal(db.prepare('SELECT count(*) AS count FROM tasks').get().count, before)
  assert.equal((await confirm(proposal.id, memberCookie)).status, 404)
  assert.equal((await request(`/ai/actions/${proposal.id}/confirm`, { method: 'POST', body: {} })).status, 400)
  const done = await confirm(proposal.id, cookie, { values: { title: 'CLIENT TAMPER' } })
  assert.equal(done.status, 200, JSON.stringify(done.data))
  assert.equal(done.data.record.title, 'Tarea creada por herramienta')
  const repeated = await confirm(proposal.id)
  assert.equal(repeated.status, 200)
  assert.equal(repeated.data.replayed, true)
  assert.equal(repeated.data.record.id, done.data.record.id)
  assert.equal(db.prepare('SELECT count(*) AS count FROM tasks').get().count, before + 1)
  assert.equal(db.prepare("SELECT count(*) AS count FROM activities WHERE entity_id = ? AND action = 'created'").get(done.data.record.id).count, 1)
  assert.equal((await request('/ai/conversation')).data.turns.at(-1).proposals[0].status, 'executed')
  responseFactory = normalReply
  await ask({ includeHistory: true })
  assert.ok(JSON.stringify(requestBody.messages).includes('executed'))
})

test('actualización: detectar modificaciones posteriores y no pisarlas; confirmación válida', async () => {
  const task = db.prepare("SELECT * FROM tasks WHERE title = 'Tarea creada por herramienta'").get()
  responseFactory = toolReply('update_tasks', { recordId: task.id, changes: { status: 'Done' } })
  const proposed = await ask({ allowTools: true })
  assert.equal(proposed.status, 200)
  db.prepare("UPDATE tasks SET title = 'Cambio concurrente' WHERE id = ?").run(task.id)
  assert.equal((await confirm(proposed.data.proposals[0].id)).status, 409)
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id).status, 'To do')
  const fresh = await ask({ allowTools: true })
  assert.equal((await confirm(fresh.data.proposals[0].id)).status, 200)
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id).status, 'Done')
})

test('caducidad, cancelación y borrado del historial invalidan propuestas', async () => {
  responseFactory = toolReply('create_tasks', { title: 'Nunca crear', assignee: 'Admin', due_date: '2026-12-01' })
  const first = (await ask({ allowTools: true })).data.proposals[0]
  db.prepare('UPDATE ai_actions SET expires_at = ? WHERE id = ?').run(Date.now() - 1, first.id)
  assert.equal((await confirm(first.id)).status, 409)
  const second = (await ask({ allowTools: true })).data.proposals[0]
  assert.equal((await request(`/ai/actions/${second.id}/cancel`, { method: 'POST', body: {} })).status, 200)
  assert.equal((await confirm(second.id)).status, 409)
  const third = (await ask({ allowTools: true })).data.proposals[0]
  assert.equal((await request('/ai/conversation', { method: 'DELETE' })).status, 204)
  assert.equal((await confirm(third.id)).status, 404)
  assert.deepEqual((await request('/ai/conversation')).data.turns, [])
  assert.equal(db.prepare("SELECT count(*) AS count FROM tasks WHERE title = 'Nunca crear'").get().count, 0)
})

test('RBAC fresco al confirmar: no usar el rol del momento de la propuesta', async () => {
  responseFactory = toolReply('create_tasks', { title: 'Permiso revocado', assignee: 'Admin', due_date: '2026-12-01' })
  const result = await ask({ allowTools: true }, memberCookie)
  assert.equal(result.status, 200)
  assert.equal(requestBody.tools.length, 6)
  db.prepare("UPDATE users SET role = 'viewer' WHERE id = 'member-fixture'").run()
  assert.equal((await confirm(result.data.proposals[0].id, memberCookie)).status, 403)
  db.prepare("UPDATE users SET role = 'member' WHERE id = 'member-fixture'").run()
  assert.equal((await confirm(result.data.proposals[0].id, memberCookie)).status, 200)
  assert.equal((await ask({ allowTools: true }, viewerCookie)).status, 403)
})

test('rechaza herramientas no permitidas, referencias externas, argumentos inválidos y consentimiento ausente', async () => {
  responseFactory = toolReply('delete_tasks', { recordId: 'anything' })
  assert.equal((await ask({ allowTools: true })).status, 502)
  responseFactory = toolReply('create_projects', { name: 'Proyecto', owner: 'Admin', due_date: '2026-12-01' })
  assert.equal((await ask({ allowTools: true }, memberCookie)).status, 403)
  assert.equal((await ask({ allowTools: true, includeContext: false })).status, 403)
  responseFactory = toolReply('create_tasks', { title: 'No', assignee: 'Usuario ajeno', due_date: '2026-12-01' })
  assert.equal((await ask({ allowTools: true })).status, 400)
  responseFactory = toolReply('create_tasks', { title: 'No', assignee: 'Admin', due_date: 'no-fecha', tenant_id: 'fixture-tenant' })
  assert.equal((await ask({ allowTools: true })).status, 400)
  responseFactory = toolReply('update_tasks', { recordId: 'foreign-task', changes: { status: 'Done' } })
  db.prepare("INSERT INTO tasks (id, tenant_id, title, assignee, due_date, created_at) VALUES ('foreign-task', 'fixture-tenant', 'Foreign', 'Admin', '2026-12-01', ?)").run(new Date().toISOString())
  assert.equal((await ask({ allowTools: true })).status, 404)
  responseFactory = toolReply('create_tasks', { title: 'No', assignee: 'Admin', due_date: '2026-12-01' })
  assert.equal((await ask({ allowTools: false })).status, 422)
})

test('schemas de herramientas cubren todos los recursos y no anuncian borrado, SQL ni cuentas', () => {
  const actions = assistantActions(db, () => {})
  const names = actions.tools({ user: { role: 'admin' } }).map((item) => item.function.name)
  for (const resource of Object.keys(resourceConfig)) for (const action of ['create', 'update']) assert.ok(names.includes(`${action}_${resource}`))
  assert.equal(names.length, 10)
  assert.equal(actions.tools({ user: { role: 'viewer' } }).length, 0)
})


test('todos los recursos: crear/editar con contrato común, arrays JSON, fechas y auditoría atómica', async () => {
  const bodies = {
    projects: { name: 'Proyecto de prueba', owner: 'Admin', due_date: '2026-12-01', progress: 10 },
    meetings: { title: 'Reunión de prueba', starts_at: '2026-12-01T10:00:00+01:00', attendees: ['Admin'], duration: 45 },
    issues: { title: 'Incidencia de prueba', owner: 'Admin', severity: 'High' },
    events: { title: 'Evento de prueba', starts_at: '2026-12-01T11:00:00Z', attendees: 8 },
  }
  for (const [resource, body] of Object.entries(bodies)) {
    responseFactory = toolReply(`create_${resource}`, body)
    const proposal = await ask({ allowTools: true }, secondAdminCookie)
    assert.equal(proposal.status, 200, JSON.stringify(proposal.data))
    const done = await confirm(proposal.data.proposals[0].id, secondAdminCookie)
    assert.equal(done.status, 200, JSON.stringify(done.data))
    if (resource === 'meetings') assert.deepEqual(done.data.record.attendees, ['Admin'])
    const changes = resource === 'projects' ? { progress: 35 } : resource === 'meetings' ? { attendees: ['member'] } : resource === 'issues' ? { status: 'Resolved' } : { status: 'Confirmed' }
    responseFactory = toolReply(`update_${resource}`, { recordId: done.data.record.id, changes })
    const next = await ask({ allowTools: true }, secondAdminCookie)
    assert.equal(next.status, 200, JSON.stringify(next.data))
    if (resource === 'projects') {
      db.exec("CREATE TEMP TRIGGER deny_assistant_audit BEFORE INSERT ON activities BEGIN SELECT RAISE(ABORT, 'TEST-PRIVATE-FAILURE'); END")
      try {
        const failed = await confirm(next.data.proposals[0].id, secondAdminCookie)
        assert.equal(failed.status, 503)
        assert.doesNotMatch(JSON.stringify(failed.data), /TEST-PRIVATE|SQLITE|RAISE/)
        assert.equal(db.prepare('SELECT progress FROM projects WHERE id = ?').get(done.data.record.id).progress, 10)
        assert.equal(db.prepare('SELECT status FROM ai_actions WHERE id = ?').get(next.data.proposals[0].id).status, 'pending')
      } finally { db.exec('DROP TRIGGER deny_assistant_audit') }
    }
    const updated = await confirm(next.data.proposals[0].id, secondAdminCookie)
    assert.equal(updated.status, 200)
    for (const [field, expected] of Object.entries(changes)) assert.deepEqual(updated.data.record[field], expected)
  }
})

test('borrado mientras la IA responde no resucita historial ni propuestas antiguas', async () => {
  let started, release
  const ready = new Promise((resolve) => { started = resolve })
  const waiting = new Promise((resolve) => { release = resolve })
  responseFactory = async () => { started(); await waiting; return toolReply('create_tasks', { title: 'Respuesta antigua', assignee: 'Admin', due_date: '2026-12-01' })() }
  const pending = ask({ allowTools: true }, secondAdminCookie)
  await ready
  try { assert.equal((await request('/ai/conversation', { method: 'DELETE', session: secondAdminCookie })).status, 204) } finally { release() }
  assert.equal((await pending).status, 409)
  assert.deepEqual((await request('/ai/conversation', { session: secondAdminCookie })).data.turns, [])
  assert.equal(db.prepare("SELECT count(*) AS count FROM ai_actions WHERE values_json LIKE '%Respuesta antigua%'").get().count, 0)
})

test('sesión revocada en vuelo no guarda respuesta ni habilita propuestas; micrófono solo same-origin', async () => {
  const login = await request('/auth/login', { method: 'POST', session: '', body: { email: 'admin-admin-fixture-2@example.test', password: 'S3cure-test-Password!' } })
  const isolated = login.headers.get('set-cookie').split(';')[0]
  let started, release
  const ready = new Promise((resolve) => { started = resolve })
  const waiting = new Promise((resolve) => { release = resolve })
  responseFactory = async () => { started(); await waiting; return normalReply() }
  const pending = ask({}, isolated)
  await ready
  try { assert.equal((await request('/auth/logout', { method: 'POST', body: {}, session: isolated })).status, 204) } finally { release() }
  const reply = await pending
  assert.equal(reply.status, 401)
  assert.match(reply.headers.get('permissions-policy'), /microphone=\(self\)/)
  assert.match(reply.headers.get('permissions-policy'), /camera=\(\)/)
})
