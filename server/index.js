import Database from 'better-sqlite3'
import express from 'express'
import nodemailer from 'nodemailer'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(root, '../data')
mkdirSync(dataDir, { recursive: true })

const db = new Database(process.env.DB_PATH || path.join(dataDir, 'webai.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    deactivated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'On track',
    progress INTEGER NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL,
    budget REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#d46e4f',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    project_id TEXT REFERENCES projects(id),
    title TEXT NOT NULL,
    assignee TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'To do',
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    attendees TEXT NOT NULL DEFAULT '[]',
    location TEXT NOT NULL DEFAULT 'Online',
    agenda TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Operations',
    severity TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'Open',
    owner TEXT NOT NULL,
    impact REAL NOT NULL DEFAULT 0,
    recommendation TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'TBD',
    attendees INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Planning',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    runs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
`)

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name))
if (!userColumns.has('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
if (!userColumns.has('deactivated_at')) db.exec('ALTER TABLE users ADD COLUMN deactivated_at TEXT')

const now = new Date()
const demoMode = process.env.DEMO_MODE === 'true'
const day = (offset) => {
  const date = new Date(now)
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}
const dateTime = (offset, hour) => `${day(offset)}T${String(hour).padStart(2, '0')}:00`
const insertSeed = db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count) return

  const tenantId = 'tenant-northstar'
  db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, 'Northstar Studio')
  const salt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync('Northstar2026!', salt, 64).toString('hex')
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('user-olivia', tenantId, 'Olivia Chen', 'olivia@northstar.io', 'manager', salt, passwordHash)

  const addProject = db.prepare(`INSERT INTO projects
    (id, tenant_id, name, owner, status, progress, due_date, budget, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const projects = [
    ['p-atlas', 'Atlas redesign', 'Olivia Chen', 'On track', 72, day(18), 84000, '#d46e4f'],
    ['p-launch', 'Spring product launch', 'Marcus Lee', 'At risk', 48, day(9), 126000, '#71866d'],
    ['p-ops', 'Operations refresh', 'Priya Shah', 'On track', 31, day(32), 46000, '#cfaa67'],
  ]
  projects.forEach(([id, name, owner, status, progress, due, budget, color]) =>
    addProject.run(id, tenantId, name, owner, status, progress, due, budget, color, now.toISOString()),
  )

  const addTask = db.prepare(`INSERT INTO tasks
    (id, tenant_id, project_id, title, assignee, priority, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const tasks = [
    ['t-brief', 'Finalize launch brief', 'Marcus Lee', 'High', 'In progress', day(1), 'p-launch'],
    ['t-vendor', 'Review vendor proposals', 'Priya Shah', 'High', 'To do', day(2), 'p-launch'],
    ['t-research', 'Share research findings', 'Ava Patel', 'Medium', 'In progress', day(0), 'p-atlas'],
    ['t-qa', 'QA handoff checklist', 'Jonah Kim', 'Medium', 'To do', day(3), 'p-atlas'],
    ['t-workshop', 'Book workshop room', 'Priya Shah', 'Low', 'Done', day(-1), 'p-ops'],
    ['t-review', 'Send weekly project update', 'Olivia Chen', 'Low', 'To do', day(4), 'p-ops'],
  ]
  tasks.forEach(([id, title, assignee, priority, status, due, projectId]) =>
    addTask.run(id, tenantId, projectId, title, assignee, priority, status, due, now.toISOString()),
  )

  const addMeeting = db.prepare(`INSERT INTO meetings
    (id, tenant_id, title, starts_at, duration, attendees, location, agenda, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const meetings = [
    ['m-standup', 'Product standup', dateTime(0, 10), 30, ['Olivia Chen', 'Marcus Lee', 'Ava Patel'], 'Huddle room 2', 'Launch blockers and priorities'],
    ['m-launch', 'Launch readiness review', dateTime(1, 14), 45, ['Marcus Lee', 'Priya Shah', 'Jonah Kim'], 'Google Meet', 'Review milestones and open risks'],
    ['m-design', 'Design critique', dateTime(2, 11), 60, ['Ava Patel', 'Olivia Chen'], 'Studio A', 'Atlas redesign concepts'],
  ]
  meetings.forEach(([id, title, starts, duration, attendees, location, agenda]) =>
    addMeeting.run(id, tenantId, title, starts, duration, JSON.stringify(attendees), location, agenda, now.toISOString()),
  )

  const addIssue = db.prepare(`INSERT INTO issues
    (id, tenant_id, title, description, category, severity, status, owner, impact, recommendation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const issues = [
    ['i-vendor', 'Launch supplier confirmation is overdue', 'Final delivery date is not confirmed after two follow-ups.', 'Supply chain', 'High', 'Investigating', 'Marcus Lee', 12000, 'Confirm the delivery window with the supplier today.'],
    ['i-access', 'New starter access request blocked', 'Design tools access is awaiting approval.', 'IT & security', 'Medium', 'Open', 'Priya Shah', 0, 'Route the request to the workspace administrator.'],
    ['i-invoice', 'Invoice total differs from purchase order', 'The submitted total is $1,240 above the approved order.', 'Finance', 'Critical', 'Open', 'Olivia Chen', 1240, 'Hold payment and request an itemized revision.'],
  ]
  issues.forEach(([id, title, description, category, severity, status, owner, impact, recommendation]) =>
    addIssue.run(id, tenantId, title, description, category, severity, status, owner, impact, recommendation, now.toISOString()),
  )

  const addEvent = db.prepare(`INSERT INTO events
    (id, tenant_id, title, starts_at, location, attendees, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  addEvent.run('e-workshop', tenantId, 'Design systems workshop', dateTime(6, 9), 'Studio A', 24, 'Planning', now.toISOString())
  addEvent.run('e-townhall', tenantId, 'Quarterly town hall', dateTime(21, 15), 'Auditorium', 86, 'Confirmed', now.toISOString())

  const addAutomation = db.prepare(`INSERT INTO automations
    (id, tenant_id, name, description, trigger_key, enabled, runs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  addAutomation.run('a-overdue', tenantId, 'Overdue task nudge', 'Notify the owner and manager when a task passes its due date.', 'overdue_tasks', 1, 12, now.toISOString())
  addAutomation.run('a-critical', tenantId, 'Critical incident routing', 'Create an escalation when a critical issue is reported.', 'critical_issues', 1, 4, now.toISOString())
  addAutomation.run('a-meeting', tenantId, 'Meeting follow-through', 'Prepare follow-up tasks from meeting notes for review.', 'meeting_followup', 0, 0, now.toISOString())

  db.prepare(`INSERT INTO activities
    (id, tenant_id, actor_id, action, entity, entity_id, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), tenantId, 'user-olivia', 'created', 'system', null, 'Northstar workspace is ready for the week.', now.toISOString())
})
if (demoMode) insertSeed()

const demoUsers = [
  ['Ava Patel', 'ava@northstar.io', 'admin'],
  ['Marcus Lee', 'marcus@northstar.io', 'member'],
  ['Priya Shah', 'priya@northstar.io', 'member'],
  ['Jonah Kim', 'jonah@northstar.io', 'viewer'],
]
const tenantId = db.prepare('SELECT id FROM tenants ORDER BY id LIMIT 1').get()?.id
if (demoMode && tenantId) {
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users
    (id, tenant_id, name, email, role, salt, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  for (const [name, email, role] of demoUsers) {
    const salt = randomBytes(16).toString('hex')
    const passwordHash = scryptSync('Northstar2026!', salt, 64).toString('hex')
    insertUser.run(randomUUID(), tenantId, name, email, role, salt, passwordHash)
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

const sessions = new Map()
const loginAttempts = new Map()
const sessionCookie = 'webai_session'
const sessionDuration = 8 * 60 * 60 * 1000
const userByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
const invitationDuration = 48 * 60 * 60 * 1000
const smtpTransport = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
}) : null

const setSessionCookie = (res, sessionId) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${sessionCookie}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDuration / 1000}${secure}`)
}

function establishSession(res, user) {
  const sessionId = randomBytes(32).toString('hex')
  sessions.set(sessionId, { userId: user.id, tenantId: user.tenant_id, expiresAt: Date.now() + sessionDuration })
  setSessionCookie(res, sessionId)
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function validBootstrapToken(token) {
  const expected = process.env.BOOTSTRAP_TOKEN || ''
  const providedBuffer = Buffer.from(String(token || ''))
  const expectedBuffer = Buffer.from(expected)
  return expectedBuffer.length >= 32 && providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

app.get('/api/setup/status', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  res.json({ needsSetup: users === 0, bootstrapEnabled: Boolean(process.env.BOOTSTRAP_TOKEN), demoMode })
})

app.post('/api/setup/bootstrap', (req, res) => {
  if (!validBootstrapToken(req.body?.bootstrapToken)) return res.status(403).json({ error: 'Token de configuración no válido. Contacta con quien administra el despliegue.' })
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) return res.status(409).json({ error: 'El administrador inicial ya fue creado.' })

  const company = String(req.body?.company || '').trim()
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (company.length < 2 || company.length > 100) return res.status(400).json({ error: 'El nombre de la empresa debe tener entre 2 y 100 caracteres.' })
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' })
  if (!validEmail(email)) return res.status(400).json({ error: 'Introduce un correo válido.' })
  if (password.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres.' })

  const createWorkspace = db.transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) throw new Error('BOOTSTRAP_ALREADY_USED')
    const tenantId = randomUUID()
    const userId = randomUUID()
    const salt = randomBytes(16).toString('hex')
    const passwordHash = scryptSync(password, salt, 64).toString('hex')
    db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, company)
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash)
      VALUES (?, ?, ?, ?, 'admin', ?, ?)`)
      .run(userId, tenantId, name, email, salt, passwordHash)
    const user = { id: userId, tenant_id: tenantId, name, email, role: 'admin' }
    recordActivity(user, 'created', 'workspace', tenantId, `Creó el espacio de trabajo ${company} y el administrador inicial.`)
    return user
  })

  try {
    const user = createWorkspace()
    process.env.BOOTSTRAP_TOKEN = ''
    const publicUser = establishSession(res, user)
    return res.status(201).json({ user: publicUser, company })
  } catch (error) {
    if (error.message === 'BOOTSTRAP_ALREADY_USED') return res.status(409).json({ error: 'El administrador inicial ya fue creado.' })
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
    throw error
  }
})

app.get('/api/invitations/validate', (req, res) => {
  const token = String(req.query.token || '')
  if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'El enlace de invitación no es válido.' })
  const invitation = db.prepare(`SELECT i.email, i.role, i.expires_at, t.name AS company
    FROM invitations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`)
    .get(hashToken(token), new Date().toISOString())
  if (!invitation) return res.status(410).json({ error: 'La invitación ha caducado, fue revocada o ya se utilizó.' })
  res.json({ email: invitation.email, role: invitation.role, company: invitation.company, expiresAt: invitation.expires_at })
})

app.post('/api/invitations/accept', (req, res) => {
  const token = String(req.body?.token || '')
  const name = String(req.body?.name || '').trim()
  const password = String(req.body?.password || '')
  if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'El enlace de invitación no es válido.' })
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' })
  if (password.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres.' })
  const tokenHash = hashToken(token)

  try {
    const accept = db.transaction(() => {
      const invitation = db.prepare(`SELECT * FROM invitations
        WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
        .get(tokenHash, new Date().toISOString())
      if (!invitation) throw new Error('INVITATION_NOT_ACTIVE')
      if (userByEmail.get(invitation.email)) throw new Error('INVITATION_EMAIL_EXISTS')
      const id = randomUUID()
      const salt = randomBytes(16).toString('hex')
      const passwordHash = scryptSync(password, salt, 64).toString('hex')
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, invitation.tenant_id, name, invitation.email, invitation.role, salt, passwordHash)
      db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL').run(new Date().toISOString(), invitation.id)
      const user = { id, tenant_id: invitation.tenant_id, name, email: invitation.email, role: invitation.role }
      recordActivity(user, 'accepted', 'invitation', invitation.id, `Aceptó la invitación como ${invitation.role}.`)
      return { user, company: db.prepare('SELECT name FROM tenants WHERE id = ?').get(invitation.tenant_id).name }
    })()
    const publicUser = establishSession(res, accept.user)
    return res.status(201).json({ user: publicUser, company: accept.company })
  } catch (error) {
    if (error.message === 'INVITATION_NOT_ACTIVE') return res.status(410).json({ error: 'La invitación ha caducado, fue revocada o ya se utilizó.' })
    if (error.message === 'INVITATION_EMAIL_EXISTS' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
    throw error
  }
})

app.post('/api/auth/login', (req, res) => {
  const address = req.ip || 'unknown'
  const attempts = loginAttempts.get(address) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 }
  if (attempts.resetAt < Date.now()) {
    attempts.count = 0
    attempts.resetAt = Date.now() + 15 * 60 * 1000
  }
  if (attempts.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const user = userByEmail.get(email)
  const candidate = scryptSync(password, user?.salt || 'invalid-user-salt', 64)
  const valid = user && user.status === 'active' && timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))
  if (!valid) {
    attempts.count += 1
    loginAttempts.set(address, attempts)
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
  }

  loginAttempts.delete(address)
  const publicUser = establishSession(res, user)
  return res.json({ user: publicUser, company: db.prepare('SELECT name FROM tenants WHERE id = ?').get(user.tenant_id).name })
})

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers.cookie?.match(/(?:^|;\s*)webai_session=([^;]+)/)?.[1]
  if (sessionId) sessions.delete(sessionId)
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
  res.status(204).end()
})

function authenticate(req, res, next) {
  const sessionId = req.headers.cookie?.match(/(?:^|;\s*)webai_session=([^;]+)/)?.[1]
  const session = sessionId && sessions.get(sessionId)
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) sessions.delete(sessionId)
    return res.status(401).json({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' })
  }
  const user = db.prepare('SELECT id, tenant_id, name, email, role, status FROM users WHERE id = ?').get(session.userId)
  if (!user || user.tenant_id !== session.tenantId) return res.status(401).json({ error: 'Sesión no válida.' })
  if (user.status !== 'active') {
    sessions.delete(sessionId)
    return res.status(401).json({ error: 'Tu cuenta está desactivada. Contacta con un administrador.' })
  }
  req.user = user
  req.tenantId = session.tenantId
  next()
}

const resourceRoles = {
  projects: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] },
  tasks: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
  meetings: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
  events: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] },
  issues: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
}

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
  res.json({ user: req.user, company })
})

app.use('/api', authenticate)

const resourceConfig = {
  projects: {
    columns: ['name', 'owner', 'status', 'progress', 'due_date', 'budget', 'color'],
    required: ['name', 'owner', 'due_date'],
    enums: { status: ['On track', 'At risk', 'Behind', 'Complete'] },
    numberFields: ['progress', 'budget'],
  },
  tasks: {
    columns: ['project_id', 'title', 'assignee', 'priority', 'status', 'due_date'],
    required: ['title', 'assignee', 'due_date'],
    enums: { priority: ['Low', 'Medium', 'High'], status: ['To do', 'In progress', 'Done'] },
  },
  meetings: {
    columns: ['title', 'starts_at', 'duration', 'attendees', 'location', 'agenda'],
    required: ['title', 'starts_at'],
    numberFields: ['duration'],
    jsonFields: ['attendees'],
  },
  issues: {
    columns: ['title', 'description', 'category', 'severity', 'status', 'owner', 'impact', 'recommendation'],
    required: ['title', 'owner'],
    enums: { severity: ['Low', 'Medium', 'High', 'Critical'], status: ['Open', 'Investigating', 'Resolved'] },
    numberFields: ['impact'],
  },
  events: {
    columns: ['title', 'starts_at', 'location', 'attendees', 'status'],
    required: ['title', 'starts_at'],
    enums: { status: ['Planning', 'Confirmed', 'Complete'] },
    numberFields: ['attendees'],
  },
}

const parseRow = (resource, row) => {
  if (!row) return row
  if (resource === 'meetings') {
    try { return { ...row, attendees: JSON.parse(row.attendees) } } catch { return { ...row, attendees: [] } }
  }
  return row
}

function recordActivity(user, action, entity, entityId, summary, reason = '', changes = {}) {
  db.prepare(`INSERT INTO activities
    (id, tenant_id, actor_id, action, entity, entity_id, summary, reason, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), user.tenant_id, user.id, action, entity, entityId, summary, reason, JSON.stringify(changes.before ?? {}), JSON.stringify(changes.after ?? {}), new Date().toISOString())
}

app.get('/api/overview', (req, res) => {
  const tenantId = req.tenantId
  const count = (table, condition = '') => db.prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE tenant_id = ? ${condition}`).get(tenantId).value
  const tasks = db.prepare('SELECT status, due_date FROM tasks WHERE tenant_id = ?').all(tenantId)
  const projects = db.prepare('SELECT * FROM projects WHERE tenant_id = ? ORDER BY due_date').all(tenantId)
  const issues = db.prepare("SELECT severity, status, impact FROM issues WHERE tenant_id = ? AND status != 'Resolved'").all(tenantId)
  const activities = db.prepare('SELECT a.id, a.action, a.entity, a.summary, a.created_at, u.name AS actor FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 8').all(tenantId)
  res.json({
    counts: {
      tasks: tasks.filter((task) => task.status !== 'Done').length,
      overdue: tasks.filter((task) => task.status !== 'Done' && task.due_date < day(0)).length,
      projects: count('projects'),
      meetings: count('meetings', `AND starts_at >= '${day(0)}' AND starts_at < '${day(7)}'`),
      issues: issues.length,
      critical: issues.filter((issue) => issue.severity === 'Critical').length,
    },
    projects,
    issues,
    activities,
    tasks: db.prepare('SELECT * FROM tasks WHERE tenant_id = ? ORDER BY due_date LIMIT 6').all(tenantId),
    meetings: db.prepare('SELECT * FROM meetings WHERE tenant_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 4').all(tenantId, now.toISOString().slice(0, 10)).map((row) => parseRow('meetings', row)),
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
    for (const [sessionId, session] of sessions) {
      if (session.userId === current.id) sessions.delete(sessionId)
    }
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

  const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')
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
    const rows = db.prepare(`SELECT * FROM ${resource} WHERE tenant_id = ? ORDER BY ${resource === 'tasks' || resource === 'projects' ? 'due_date' : 'created_at'} DESC`).all(req.tenantId)
    res.json(rows.map((row) => parseRow(resource, row)))
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

const port = Number(process.env.PORT || 3001)
app.listen(port, () => console.log(`Webai API listening on http://localhost:${port}`))