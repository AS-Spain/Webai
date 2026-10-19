import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'

const directory = mkdtempSync(path.join(tmpdir(), 'northstar-api-'))
process.env.V2_DB_PATH = path.join(directory, 'test.sqlite')
process.env.DEMO_MODE = 'false'
process.env.BOOTSTRAP_TOKEN = 'operator-token-'.repeat(4)
process.env.APP_BASE_URL = 'https://test.example.com'
delete process.env.SMTP_HOST
const { app } = await import('../server/app.js')
const { db } = await import('../server/database.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}/api`

async function request(route, { cookie, body, token, method = 'GET' } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers }
}
function addUser(id, tenantId, role) {
  const salt = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, tenantId, id, `${id}@example.com`, role, salt, scryptSync('a-strong-password', salt, 64).toString('hex'))
}
const login = async (id) => (await request('/auth/login', { method: 'POST', body: { email: `${id}@example.com`, password: 'a-strong-password' } })).cookie

test('API v2: autenticación, permisos, empresas e invitaciones', async (suite) => {
  let admin, member, viewer, manager, other
  let tenantId, project, task
  try {
    await suite.test('el bootstrap requiere token y solo se usa una vez', async () => {
      assert.equal((await request('/tasks')).status, 401)
      assert.equal((await request('/ai/config')).status, 401)
      assert.equal((await request('/ai/ask', { method: 'POST', body: { question: 'hola', mode: 'rules' } })).status, 401)
      assert.equal((await request('/setup/status')).body.needsSetup, true)
      const body = { company: 'Empresa A', name: 'Admin', email: 'admin@example.com', password: 'a-strong-password', bootstrapToken: process.env.BOOTSTRAP_TOKEN }
      assert.equal((await request('/setup/bootstrap', { method: 'POST', body: { ...body, bootstrapToken: 'incorrect' } })).status, 403)
      const created = await request('/setup/bootstrap', { method: 'POST', body })
      assert.equal(created.status, 201)
      admin = created.cookie
      assert.equal(created.body.sessionToken, undefined)
      assert.equal((await request('/auth/me', { token: admin.split('=')[1] })).status, 401)
      assert.match(admin, /^webai_v2_private_session=/)
      assert.match(created.headers.get('set-cookie'), /HttpOnly/)
      assert.match(created.headers.get('set-cookie'), /SameSite=Strict/)
      assert.equal((await request('/auth/demo', { method: 'POST' })).status, 404)
      assert.equal((await request('/setup/bootstrap', { method: 'POST', body })).status, 403)
      assert.equal((await request('/auth/me', { cookie: admin })).body.user.role, 'admin')
      tenantId = db.prepare('SELECT id FROM tenants').get().id
      for (const role of ['member', 'viewer', 'manager']) addUser(role, tenantId, role)
      db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run('other-tenant', 'Empresa B')
      addUser('other', 'other-tenant', 'admin')
      member = await login('member'); viewer = await login('viewer'); manager = await login('manager'); other = await login('other')
    })
    await suite.test('las credenciales inválidas no permiten entrar', async () => {
      assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'incorrect' } })).status, 401)
      assert.equal((await request('/auth/me', { cookie: 'webai_session=original-cookie' })).status, 401)
    })
    await suite.test('roles de escritura, borrado y administración', async () => {
      const projectBody = { name: 'Proyecto A', owner: 'manager', due_date: '2026-11-01' }
      assert.equal((await request('/projects', { method: 'POST', cookie: member, body: projectBody })).status, 403)
      const created = await request('/projects', { method: 'POST', cookie: manager, body: projectBody })
      assert.equal(created.status, 201); project = created.body
      const taskBody = { title: 'Tarea A', assignee: 'member', due_date: '2026-11-01', project_id: project.id }
      assert.equal((await request('/tasks', { method: 'POST', cookie: viewer, body: taskBody })).status, 403)
      const createdTask = await request('/tasks', { method: 'POST', cookie: member, body: taskBody })
      assert.equal(createdTask.status, 201); task = createdTask.body
      assert.equal((await request(`/tasks/${task.id}`, { method: 'DELETE', cookie: member })).status, 403)
      assert.equal((await request('/invitations', { cookie: manager })).status, 403)
      assert.equal((await request('/ai/config', { method: 'PUT', cookie: member, body: {} })).status, 403)
      assert.equal((await request('/ai/config', { method: 'DELETE', cookie: viewer })).status, 403)
      assert.equal((await request('/tasks', { cookie: viewer })).status, 200)
    })
    await suite.test('ninguna empresa puede leer ni modificar filas ajenas', async () => {
      for (const resource of ['projects', 'tasks', 'issues', 'meetings', 'events']) {
        const result = await request(`/${resource}`, { cookie: other })
        assert.equal(result.body.total, 0)
      }
      assert.equal((await request(`/tasks/${task.id}`, { method: 'PATCH', cookie: other, body: { title: 'Ataque' } })).status, 404)
      assert.equal((await request(`/projects/${project.id}`, { method: 'DELETE', cookie: other })).status, 404)
      const foreignProject = (await request('/projects', { method: 'POST', cookie: other, body: { name: 'Secreto', owner: 'other', due_date: '2026-11-01' } })).body
      assert.equal((await request(`/tasks/${task.id}`, { method: 'PATCH', cookie: member, body: { project_id: foreignProject.id } })).status, 400)
      assert.equal((await request('/tasks', { method: 'POST', cookie: member, body: { title: 'Cruce', assignee: 'member', due_date: '2026-11-01', project_id: foreignProject.id } })).status, 400)
      assert.equal((await request('/overview', { cookie: other })).body.counts.tasks, 0)
    })
    await suite.test('listas paginadas con orden estable y tamaño máximo', async () => {
      for (let index = 0; index < 22; index++) {
        const result = await request('/tasks', { method: 'POST', cookie: member, body: { title: `Tarea ${index}`, assignee: 'member', due_date: '2026-11-01' } })
        assert.equal(result.status, 201)
      }
      const first = (await request('/tasks', { cookie: admin })).body
      const second = (await request('/tasks?page=2', { cookie: admin })).body
      assert.equal(first.items.length, 20)
      assert.equal(second.items.length, 3)
      assert.equal(first.total, 23)
      assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 23)
      assert.equal((await request('/tasks?pageSize=99999', { cookie: admin })).body.pageSize, 100)
    })
    await suite.test('los filtros se aplican en el servidor antes de paginar', async () => {
      assert.equal((await request(`/tasks/${task.id}`, { method: 'PATCH', cookie: member, body: { status: 'Done' } })).status, 200)
      const done = (await request('/tasks?status=Done&pageSize=1', { cookie: admin })).body
      assert.equal(done.total, 1)
      assert.equal(done.items[0].id, task.id)
      assert.equal((await request('/tasks?status=invalid', { cookie: admin })).status, 400)
    })
    await suite.test('la búsqueda global encuentra datos sin cargar listas y respeta la empresa', async () => {
      const own = (await request('/search?q=Tarea', { cookie: admin })).body
      assert.ok(own.length > 0 && own.length <= 6)
      assert.equal((await request('/search?q=Tarea', { cookie: other })).body.length, 0)
      assert.equal((await request('/search?q=%25', { cookie: admin })).body.length, 0)
      assert.equal((await request('/search?q=Tarea')).status, 401)
    })
    const invite = async (email) => {
      const result = await request('/invitations', { method: 'POST', cookie: admin, body: { email, role: 'member' } })
      assert.equal(result.status, 201)
      return { ...result.body, token: new URL(result.body.activationUrl).searchParams.get('invite') }
    }
    await suite.test('las invitaciones se aceptan una sola vez y solo guardan el hash', async () => {
      const invitation = await invite('new@example.com')
      assert.equal(invitation.emailSent, false)
      assert.notEqual(db.prepare('SELECT token_hash FROM invitations WHERE id = ?').get(invitation.id).token_hash, invitation.token)
      assert.equal((await request(`/invitations/validate?token=${invitation.token}`)).status, 200)
      const body = { token: invitation.token, name: 'Nueva persona', password: 'a-strong-password' }
      assert.equal((await request('/invitations/accept', { method: 'POST', body })).status, 201)
      assert.equal((await request('/invitations/accept', { method: 'POST', body })).status, 410)
    })
    await suite.test('invitaciones revocadas y caducadas no se pueden aceptar', async () => {
      for (const state of ['revoked', 'expired']) {
        const invitation = await invite(`${state}@example.com`)
        if (state === 'revoked') assert.equal((await request(`/invitations/${invitation.id}`, { method: 'DELETE', cookie: admin })).status, 204)
        else db.prepare('UPDATE invitations SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', invitation.id)
        assert.equal((await request(`/invitations/validate?token=${invitation.token}`)).status, 410)
        assert.equal((await request('/invitations/accept', { method: 'POST', body: { token: invitation.token, name: 'Persona', password: 'a-strong-password' } })).status, 410)
      }
    })
    await suite.test('borrar un proyecto conserva tareas y auditoría', async () => {
      assert.equal((await request(`/projects/${project.id}`, { method: 'DELETE', cookie: manager })).status, 204)
      assert.equal(db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(task.id).project_id, null)
      assert.ok(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity = 'projects' AND action = 'deleted'").get().count > 0)
    })
    await suite.test('desactivar una persona revoca sus sesiones persistidas', async () => {
      assert.equal((await request('/users/member/deactivate', { method: 'POST', cookie: admin })).status, 200)
      assert.equal((await request('/auth/me', { cookie: member })).status, 401)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = 'member'").get().count, 0)
    })
    await suite.test('cerrar sesión invalida la cookie en el servidor', async () => {
      assert.equal((await request('/auth/logout', { method: 'POST', cookie: viewer })).status, 204)
      assert.equal((await request('/auth/me', { cookie: viewer })).status, 401)
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
