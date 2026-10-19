import Database from 'better-sqlite3'
import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localDateKey } from '../src/lib/dates.js'

// Business dates use a configurable server timezone, independent of the host OS.
process.env.TZ = process.env.V2_TIME_ZONE || process.env.TZ || 'Europe/Madrid'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(root, '../data')
mkdirSync(dataDir, { recursive: true })
export const db = new Database(process.env.V2_DB_PATH || path.join(dataDir, 'webai-v2.sqlite'))
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
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}
const dayStart = (offset) => new Date(`${day(offset)}T00:00:00`).toISOString()
const dateTime = (offset, hour) => new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00`).toISOString()
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
    ['p-atlas', 'Rediseño Atlas', 'Olivia Chen', 'On track', 72, day(18), 84000, '#d46e4f'],
    ['p-launch', 'Lanzamiento de producto', 'Marcus Lee', 'At risk', 48, day(9), 126000, '#71866d'],
    ['p-ops', 'Mejora de operaciones', 'Priya Shah', 'On track', 31, day(32), 46000, '#cfaa67'],
  ]
  projects.forEach(([id, name, owner, status, progress, due, budget, color]) =>
    addProject.run(id, tenantId, name, owner, status, progress, due, budget, color, now.toISOString()),
  )

  const addTask = db.prepare(`INSERT INTO tasks
    (id, tenant_id, project_id, title, assignee, priority, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const tasks = [
    ['t-brief', 'Finalizar el plan de lanzamiento', 'Marcus Lee', 'High', 'In progress', day(1), 'p-launch'],
    ['t-vendor', 'Revisar propuestas de proveedores', 'Priya Shah', 'High', 'To do', day(2), 'p-launch'],
    ['t-research', 'Compartir resultados de investigación', 'Ava Patel', 'Medium', 'In progress', day(0), 'p-atlas'],
    ['t-qa', 'Preparar la lista de control de calidad', 'Jonah Kim', 'Medium', 'To do', day(3), 'p-atlas'],
    ['t-workshop', 'Reservar la sala del taller', 'Priya Shah', 'Low', 'Done', day(-1), 'p-ops'],
    ['t-review', 'Enviar el informe semanal del proyecto', 'Olivia Chen', 'Low', 'To do', day(4), 'p-ops'],
  ]
  tasks.forEach(([id, title, assignee, priority, status, due, projectId]) =>
    addTask.run(id, tenantId, projectId, title, assignee, priority, status, due, now.toISOString()),
  )

  const addMeeting = db.prepare(`INSERT INTO meetings
    (id, tenant_id, title, starts_at, duration, attendees, location, agenda, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const meetings = [
    ['m-standup', 'Seguimiento de producto', dateTime(0, 10), 30, ['Olivia Chen', 'Marcus Lee', 'Ava Patel'], 'Sala de reuniones 2', 'Bloqueos y prioridades del lanzamiento'],
    ['m-launch', 'Revisión del lanzamiento', dateTime(1, 14), 45, ['Marcus Lee', 'Priya Shah', 'Jonah Kim'], 'Google Meet', 'Revisar hitos y riesgos pendientes'],
    ['m-design', 'Revisión de diseño', dateTime(2, 11), 60, ['Ava Patel', 'Olivia Chen'], 'Studio A', 'Rediseño Atlas concepts'],
  ]
  meetings.forEach(([id, title, starts, duration, attendees, location, agenda]) =>
    addMeeting.run(id, tenantId, title, starts, duration, JSON.stringify(attendees), location, agenda, now.toISOString()),
  )

  const addIssue = db.prepare(`INSERT INTO issues
    (id, tenant_id, title, description, category, severity, status, owner, impact, recommendation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const issues = [
    ['i-vendor', 'Falta la confirmación del proveedor', 'La fecha de entrega sigue sin confirmarse tras dos consultas.', 'Supply chain', 'High', 'Investigating', 'Marcus Lee', 12000, 'Confirma hoy el plazo de entrega con el proveedor.'],
    ['i-access', 'Solicitud de acceso de una nueva incorporación bloqueada', 'El acceso a las herramientas de diseño está pendiente de aprobación.', 'IT & security', 'Medium', 'Open', 'Priya Shah', 0, 'Deriva la solicitud al administrador del espacio.'],
    ['i-invoice', 'La factura no coincide con el pedido', 'El importe supera en 1.240 $ el pedido aprobado.', 'Finance', 'Critical', 'Open', 'Olivia Chen', 1240, 'Retén el pago y solicita una revisión detallada.'],
  ]
  issues.forEach(([id, title, description, category, severity, status, owner, impact, recommendation]) =>
    addIssue.run(id, tenantId, title, description, category, severity, status, owner, impact, recommendation, now.toISOString()),
  )

  const addEvent = db.prepare(`INSERT INTO events
    (id, tenant_id, title, starts_at, location, attendees, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  addEvent.run('e-workshop', tenantId, 'Taller de sistemas de diseño', dateTime(6, 9), 'Studio A', 24, 'Planning', now.toISOString())
  addEvent.run('e-townhall', tenantId, 'Reunión general trimestral', dateTime(21, 15), 'Auditorio', 86, 'Confirmed', now.toISOString())

  const addAutomation = db.prepare(`INSERT INTO automations
    (id, tenant_id, name, description, trigger_key, enabled, runs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  addAutomation.run('a-overdue', tenantId, 'Aviso de tareas vencidas', 'Detecta tareas fuera de plazo. La prueba no envía notificaciones externas.', 'overdue_tasks', 1, 12, now.toISOString())
  addAutomation.run('a-critical', tenantId, 'Revisión de incidencias críticas', 'Detecta incidencias críticas para revisión humana.', 'critical_issues', 1, 4, now.toISOString())
  addAutomation.run('a-meeting', tenantId, 'Seguimiento de reuniones', 'Preparación de seguimiento; requiere un proveedor de notas para activarse.', 'meeting_followup', 0, 0, now.toISOString())

  db.prepare(`INSERT INTO activities
    (id, tenant_id, actor_id, action, entity, entity_id, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), tenantId, 'user-olivia', 'created', 'system', null, 'El espacio Northstar está listo para la semana.', now.toISOString())
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

export { day, dayStart, demoMode }
