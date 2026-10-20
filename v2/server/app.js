import express from 'express'
import nodemailer from 'nodemailer'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, day, dayStart, demoMode } from './database.js'
import { registerAuthRoutes } from './auth.js'
import { prepareBootstrap } from './bootstrap.js'
import { resourceConfig, resourceRoles, parseRow } from './resources.js'
import { runtimeConfig } from './runtime.js'
import { registerAiRoutes } from './ai.js'
import { pagination } from './pagination.js'

const runtime = runtimeConfig()
const root = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

const invitationDuration = 48 * 60 * 60 * 1000
const smtpTransport = !demoMode && process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
}) : null

const bootstrap = prepareBootstrap({ db, demo: demoMode, dbPath: runtime.dbPath })
const { authenticate, sessions, userByEmail, validEmail, hashToken } = registerAuthRoutes(app, db, demoMode, recordActivity, bootstrap)

function authorizeResource(resource, action) {
  return (req, res, next) => {
    if (!resourceRoles[resource]?.[action]?.includes(req.user.role)) {
      return res.status(403).json({ error: `Tu rol (${req.user.role}) no puede ${action === 'create' ? 'crear' : action === 'update' ? 'modificar' : 'eliminar'} ${resource}.` })
    }
    next()
  }
}

function authorizeWrite(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo admin puede administrar automatizaciones.' })
  }
  next()
}

app.get('/api/auth/me', authenticate, (req, res) => {
  const company = db.prepare('SELECT name FROM tenants WHERE id = ?').get(req.tenantId).name
  res.json({ user: req.user, company, ...(demoMode ? { demoMode: true, sessionToken: req.sessionToken } : {}) })
})

app.use('/api', authenticate)
registerAiRoutes(app, { db, day, recordActivity, demoMode, masterKeyPath: runtime.keyPath })

app.get('/api/search', (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100)
  if (!query) return res.json([])
  const matches = []
  for (const [resource, column, label] of [
    ['tasks', 'title', 'Tarea'], ['projects', 'name', 'Proyecto'],
    ['issues', 'title', 'Incidencia'], ['meetings', 'title', 'Reunión'], ['events', 'title', 'Evento'],
  ]) {
    const rows = db.prepare(`SELECT id, ${column} AS title FROM ${resource} WHERE tenant_id = ? AND instr(lower(${column}), lower(?)) > 0 ORDER BY ${column}, id LIMIT 6`).all(req.tenantId, query)
    matches.push(...rows.map((row) => ({ ...row, resource, label })))
    if (matches.length >= 6) break
  }
  res.json(matches.slice(0, 6))
})



function recordActivity(user, action, entity, entityId, summary, reason = '', changes = {}) {
  db.prepare(`INSERT INTO activities
    (id, tenant_id, actor_id, action, entity, entity_id, summary, reason, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), user.tenant_id, user.id, action, entity, entityId, summary, reason, JSON.stringify(changes.before ?? {}), JSON.stringify(changes.after ?? {}), new Date().toISOString())
}

app.get('/api/overview', (req, res) => {
  const tenantId = req.tenantId
  const count = (table, condition = '') => db.prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE tenant_id = ? ${condition}`).get(tenantId).value
  const projects = db.prepare('SELECT * FROM projects WHERE tenant_id = ? ORDER BY due_date, id LIMIT 3').all(tenantId)
  const issues = db.prepare("SELECT * FROM issues WHERE tenant_id = ? AND status != 'Resolved' ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END, id LIMIT 3").all(tenantId)
  const activities = db.prepare('SELECT a.id, a.action, a.entity, a.summary, a.created_at, u.name AS actor FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 8').all(tenantId)
  res.json({
    counts: {
      tasks: count('tasks', "AND status != 'Done'"),
      overdue: db.prepare("SELECT COUNT(*) AS value FROM tasks WHERE tenant_id = ? AND status != 'Done' AND due_date < ?").get(tenantId, day(0)).value,
      projects: count('projects'),
      meetings: db.prepare('SELECT COUNT(*) AS value FROM meetings WHERE tenant_id = ? AND starts_at >= ? AND starts_at < ?').get(tenantId, dayStart(0), dayStart(7)).value,
      issues: count('issues', "AND status != 'Resolved'"),
      critical: count('issues', "AND severity = 'Critical' AND status != 'Resolved'"),
    },
    projects,
    issues,
    activities,
    tasks: db.prepare('SELECT * FROM tasks WHERE tenant_id = ? ORDER BY due_date LIMIT 6').all(tenantId),
    meetings: db.prepare('SELECT * FROM meetings WHERE tenant_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 4').all(tenantId, dayStart(0)).map((row) => parseRow('meetings', row)),
  })
})

app.get('/api/team', (req, res) => {
  res.json(db.prepare(`SELECT id, name, email, role, status, deactivated_at FROM users
    WHERE tenant_id = ? AND (status = 'active' OR ? = 'admin') ORDER BY name`).all(req.tenantId, req.user.role))
})

function changeUserStatus(req, res, status) {
  const current = db.prepare(`SELECT id, tenant_id, name, email, role, status, deactivated_at
    FROM users WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.tenantId)
  if (!current) return res.status(404).json({ error: 'Persona no encontrada en este espacio.' })
  if (current.status === status) return res.status(409).json({ error: `La cuenta ya está ${status === 'active' ? 'activa' : 'desactivada'}.` })
  if (status === 'inactive' && current.id === req.user.id) return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta.' })
  if (status === 'inactive' && current.role === 'admin') {
    const activeAdmins = db.prepare(`SELECT COUNT(*) AS count FROM users
      WHERE tenant_id = ? AND role = 'admin' AND status = 'active'`).get(req.tenantId).count
    if (activeAdmins <= 1) return res.status(409).json({ error: 'No se puede desactivar al último administrador activo.' })
  }

  const changedAt = status === 'inactive' ? new Date().toISOString() : null
  const update = db.transaction(() => {
    db.prepare('UPDATE users SET status = ?, deactivated_at = ? WHERE id = ? AND tenant_id = ?')
      .run(status, changedAt, current.id, req.tenantId)
    recordActivity(req.user, status === 'inactive' ? 'deactivated' : 'reactivated', 'user', current.id,
      `${status === 'inactive' ? 'Desactivó' : 'Reactivó'} la cuenta de ${current.name} (${current.email}).`,
      status === 'inactive' ? 'Acceso revocado; se conservaron los registros históricos.' : 'Acceso restaurado por un administrador.',
      { before: current, after: { ...current, status, deactivated_at: changedAt } })
  })
  update()

  if (status === 'inactive') {
    sessions.deleteForUser(current.id)
  }
  res.json({ ...current, status, deactivated_at: changedAt })
}

app.post('/api/users/:id/deactivate', authorizeWrite, (req, res) => changeUserStatus(req, res, 'inactive'))
app.post('/api/users/:id/reactivate', authorizeWrite, (req, res) => changeUserStatus(req, res, 'active'))

app.get('/api/automations', (req, res) => {
  res.json(db.prepare('SELECT * FROM automations WHERE tenant_id = ? ORDER BY created_at').all(req.tenantId))
})

app.get('/api/invitations', authorizeWrite, (req, res) => {
  const invitations = db.prepare(`SELECT i.id, i.email, i.role, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
      u.name AS created_by_name
    FROM invitations i JOIN users u ON u.id = i.created_by
    WHERE i.tenant_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL
    ORDER BY i.created_at DESC`).all(req.tenantId)
  res.json(invitations)
})

app.post('/api/invitations', authorizeWrite, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const role = String(req.body?.role || '').trim()
  if (!validEmail(email)) return res.status(400).json({ error: 'Introduce un correo válido.' })
  if (!['admin', 'manager', 'member', 'viewer'].includes(role)) return res.status(400).json({ error: 'El rol seleccionado no es válido.' })
  if (userByEmail.get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })

  const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5174')
  let activationUrl
  try {
    const origin = new URL(baseUrl)
    if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('invalid protocol')
    activationUrl = new URL('/', origin)
  } catch {
    return res.status(500).json({ error: 'Configura APP_BASE_URL con el origen público de la aplicación antes de crear invitaciones.' })
  }

  const rawToken = randomBytes(32).toString('base64url')
  activationUrl.searchParams.set('invite', rawToken)
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + invitationDuration).toISOString()
  const id = randomUUID()
  try {
    const createInvitation = db.transaction(() => {
      db.prepare(`UPDATE invitations SET revoked_at = ? WHERE tenant_id = ? AND email = ?
        AND accepted_at IS NULL AND revoked_at IS NULL`)
        .run(createdAt.toISOString(), req.tenantId, email)
      db.prepare(`INSERT INTO invitations
        (id, tenant_id, email, role, token_hash, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.tenantId, email, role, hashToken(rawToken), req.user.id, createdAt.toISOString(), expiresAt)
      recordActivity(req.user, 'created', 'invitation', id, `Invitó a ${email} como ${role}.`)
    })
    createInvitation()
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
    throw error
  }

  let emailSent = false
  if (smtpTransport) {
    try {
      const company = db.prepare('SELECT name FROM tenants WHERE id = ?').get(req.tenantId).name
      await smtpTransport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `Invitación a ${company}`,
        text: `Has sido invitado a ${company} como ${role}. Activa tu cuenta dentro de 48 horas: ${activationUrl}`,
      })
      emailSent = true
    } catch (error) {
      console.error('Invitation email delivery failed:', error.message)
    }
  }
  res.status(201).json({ id, email, role, expiresAt, activationUrl: activationUrl.toString(), emailSent })
})

app.delete('/api/invitations/:id', authorizeWrite, (req, res) => {
  const invitation = db.prepare(`SELECT * FROM invitations
    WHERE id = ? AND tenant_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`)
    .get(req.params.id, req.tenantId)
  if (!invitation) return res.status(404).json({ error: 'Invitación activa no encontrada.' })
  db.prepare('UPDATE invitations SET revoked_at = ? WHERE id = ? AND tenant_id = ?')
    .run(new Date().toISOString(), invitation.id, req.tenantId)
  recordActivity(req.user, 'revoked', 'invitation', invitation.id, `Revocó la invitación para ${invitation.email}.`)
  res.status(204).end()
})

app.get('/api/activities', (req, res) => {
  res.json(db.prepare('SELECT a.*, u.name AS actor FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 100').all(req.tenantId))
})

for (const [resource, config] of Object.entries(resourceConfig)) {
  app.get(`/api/${resource}`, (req, res) => {
    const { page, pageSize, offset } = pagination(req.query)
    const status = String(req.query.status || '')
    if (status && !config.enums?.status?.includes(status)) return res.status(400).json({ error: 'Filtro de estado no válido.' })
    const where = `tenant_id = ?${status ? ' AND status = ?' : ''}`
    const parameters = status ? [req.tenantId, status] : [req.tenantId]
    const total = db.prepare(`SELECT COUNT(*) AS total FROM ${resource} WHERE ${where}`).get(...parameters).total
    const sort = resource === 'tasks' || resource === 'projects' ? 'due_date' : 'created_at'
    const rows = db.prepare(`SELECT * FROM ${resource} WHERE ${where} ORDER BY ${sort} ASC, id ASC LIMIT ? OFFSET ?`).all(...parameters, pageSize, offset)
    const summary = resource === 'issues' ? db.prepare(`SELECT
      SUM(CASE WHEN severity = 'Critical' AND status != 'Resolved' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN status = 'Investigating' THEN 1 ELSE 0 END) AS investigating,
      SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved
      FROM issues WHERE tenant_id = ?`).get(req.tenantId) : undefined
    res.json({ items: rows.map((row) => parseRow(resource, row)), page, pageSize, total, totalPages: Math.ceil(total / pageSize), summary })
  })

  app.post(`/api/${resource}`, authorizeResource(resource, 'create'), (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    for (const field of config.required) {
      if (!String(body[field] ?? '').trim()) return res.status(400).json({ error: `${field} es obligatorio.` })
    }
    const values = {}
    for (const field of config.columns) {
      if (body[field] === undefined) continue
      if (config.enums?.[field] && !config.enums[field].includes(body[field])) return res.status(400).json({ error: `Valor no válido para ${field}.` })
      if (config.numberFields?.includes(field)) {
        const number = Number(body[field])
        if (!Number.isFinite(number) || number < 0) return res.status(400).json({ error: `Valor numérico no válido para ${field}.` })
        values[field] = number
      } else if (config.jsonFields?.includes(field)) {
        values[field] = JSON.stringify(Array.isArray(body[field]) ? body[field].map(String) : [])
      } else {
        const value = String(body[field]).trim()
        values[field] = resource === 'tasks' && field === 'project_id' && !value ? null : value
      }
    }
    for (const field of config.required) if (!values[field]) return res.status(400).json({ error: `${field} es obligatorio.` })
    if (resource === 'tasks' && values.project_id && !db.prepare('SELECT id FROM projects WHERE id = ? AND tenant_id = ?').get(values.project_id, req.tenantId)) return res.status(400).json({ error: 'El proyecto seleccionado no existe en esta empresa.' })

    const id = randomUUID()
    const fields = ['id', 'tenant_id', ...Object.keys(values), 'created_at']
    const insertValues = [id, req.tenantId, ...Object.values(values), new Date().toISOString()]
    db.prepare(`INSERT INTO ${resource} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...insertValues)
    recordActivity(req.user, 'created', resource, id, `Creó ${resource === 'issues' ? 'una incidencia' : resource === 'tasks' ? 'una tarea' : resource === 'meetings' ? 'una reunión' : resource === 'events' ? 'un evento' : 'un proyecto'}: ${values.title || values.name}`, '', { after: values })
    res.status(201).json(parseRow(resource, db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(id, req.tenantId)))
  })

  app.patch(`/api/${resource}/:id`, authorizeResource(resource, 'update'), (req, res) => {
    const current = db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.tenantId)
    if (!current) return res.status(404).json({ error: 'Registro no encontrado.' })
    const values = {}
    for (const field of config.columns) {
      if (req.body?.[field] === undefined) continue
      const value = req.body[field]
      if (config.enums?.[field] && !config.enums[field].includes(value)) return res.status(400).json({ error: `Valor no válido para ${field}.` })
      if (config.numberFields?.includes(field)) {
        const number = Number(value)
        if (!Number.isFinite(number) || number < 0) return res.status(400).json({ error: `Valor numérico no válido para ${field}.` })
        values[field] = number
      } else if (config.jsonFields?.includes(field)) {
        values[field] = JSON.stringify(Array.isArray(value) ? value.map(String) : [])
      } else {
        values[field] = String(value).trim()
      }
    }
    if (resource === 'tasks' && 'project_id' in values) {
      values.project_id ||= null
      if (values.project_id && !db.prepare('SELECT id FROM projects WHERE id = ? AND tenant_id = ?').get(values.project_id, req.tenantId)) return res.status(400).json({ error: 'El proyecto seleccionado no existe en esta empresa.' })
    }
    if (!Object.keys(values).length) return res.status(400).json({ error: 'No hay cambios válidos.' })
    const changes = Object.entries(values)
    db.prepare(`UPDATE ${resource} SET ${changes.map(([field]) => `${field} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`).run(...changes.map(([, value]) => value), req.params.id, req.tenantId)
    const label = values.title || values.name || current.title || current.name
    const changedStatus = values.status && values.status !== current.status ? ` (estado: ${current.status} → ${values.status})` : ''
    recordActivity(req.user, 'updated', resource, req.params.id, `Actualizó ${label}${changedStatus}`, String(req.body?.reason || ''), { before: current, after: { ...current, ...values } })
    res.json(parseRow(resource, db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.tenantId)))
  })

  app.delete(`/api/${resource}/:id`, authorizeResource(resource, 'delete'), (req, res) => {
    if (resource === 'issues') return res.status(405).json({ error: 'Las incidencias no se eliminan; cámbialas a Resolved para conservar la evidencia.' })
    if (!['projects', 'tasks', 'meetings', 'events'].includes(resource)) return res.status(405).json({ error: 'Este tipo de registro no se puede eliminar.' })
    const current = db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.tenantId)
    if (!current) return res.status(404).json({ error: 'Registro no encontrado.' })
    const deleteRecord = db.transaction(() => {
      if (resource === 'projects') {
        const linkedTasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND tenant_id = ?').all(req.params.id, req.tenantId)
        for (const task of linkedTasks) {
          db.prepare('UPDATE tasks SET project_id = NULL WHERE id = ? AND tenant_id = ?').run(task.id, req.tenantId)
          recordActivity(req.user, 'updated', 'tasks', task.id, `Desvinculó la tarea "${task.title}" del proyecto "${current.name}"`, 'El proyecto fue eliminado; la tarea se conservó.', { before: task, after: { ...task, project_id: null } })
        }
      }
      db.prepare(`DELETE FROM ${resource} WHERE id = ? AND tenant_id = ?`).run(req.params.id, req.tenantId)
      recordActivity(req.user, 'deleted', resource, req.params.id, `Eliminó ${resource === 'projects' ? 'el proyecto' : 'el registro'}: ${current.title || current.name}`, '', { before: current })
    })
    deleteRecord()
    res.status(204).end()
  })
}

app.patch('/api/automations/:id', authorizeWrite, (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'El estado enabled debe ser booleano.' })
  const result = db.prepare('UPDATE automations SET enabled = ? WHERE id = ? AND tenant_id = ?').run(Number(req.body.enabled), req.params.id, req.tenantId)
  if (!result.changes) return res.status(404).json({ error: 'Automatización no encontrada.' })
  recordActivity(req.user, req.body.enabled ? 'enabled' : 'disabled', 'automation', req.params.id, `${req.body.enabled ? 'Activó' : 'Pausó'} una automatización`)
  res.json(db.prepare('SELECT * FROM automations WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId))
})

app.post('/api/automations/:id/run', authorizeWrite, (req, res) => {
  const automation = db.prepare('SELECT * FROM automations WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!automation) return res.status(404).json({ error: 'Automatización no encontrada.' })
  if (!automation.enabled) return res.status(409).json({ error: 'Activa la automatización antes de probarla.' })
  let affected = 0
  let summary = 'Ejecución de prueba completada.'
  if (automation.trigger_key === 'overdue_tasks') {
    const overdue = db.prepare("SELECT title FROM tasks WHERE tenant_id = ? AND status != 'Done' AND due_date < ?").all(req.tenantId, day(0))
    affected = overdue.length
    summary = `${affected} tarea${affected === 1 ? '' : 's'} vencida${affected === 1 ? '' : 's'} detectada${affected === 1 ? '' : 's'}. No se enviaron notificaciones externas.`
  } else if (automation.trigger_key === 'critical_issues') {
    affected = db.prepare("SELECT COUNT(*) AS value FROM issues WHERE tenant_id = ? AND severity = 'Critical' AND status != 'Resolved'").get(req.tenantId).value
    summary = `${affected} incidencia${affected === 1 ? '' : 's'} crítica${affected === 1 ? '' : 's'} abierta${affected === 1 ? '' : 's'} encontrada${affected === 1 ? '' : 's'}. No se enviaron notificaciones externas.`
  } else {
    summary = 'La automatización está registrada; conecte un proveedor de notas para habilitar el disparador.'
  }
  db.prepare('UPDATE automations SET runs = runs + 1 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId)
  recordActivity(req.user, 'tested', 'automation', req.params.id, `Probó ${automation.name}: ${summary}`)
  res.json({ affected, summary })
})

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }))

const distDir = path.resolve(root, '../dist')
app.use(express.static(distDir))
app.get('*path', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'), (error) => error && res.status(404).end())
})

export { app }
