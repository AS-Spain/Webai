import { resourceConfig } from './resources.js'
import { HttpError } from './security.js'
const bad = (field) => { throw new HttpError(400, `Valor no válido para ${field}.`) }
const hasControls = (value, multiline = false) => [...value].some((char) => {
  const code = char.charCodeAt(0)
  return code === 127 || (code < 32 && (!multiline || ![9, 10, 13].includes(code)))
})
const dateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
export function validateResource(resource, body, { partial = false } = {}) {
  const config = resourceConfig[resource], values = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('solicitud')
  const permitted = new Set([...config.columns, ...(partial ? ['reason'] : [])])
  if (Object.keys(body).some((key) => !permitted.has(key))) bad('campo desconocido')
  for (const field of config.columns) {
    if (body[field] === undefined) continue
    const value = body[field]
    if (field === 'project_id' && value === null) { values[field] = null; continue }
    if (config.enums?.[field] && !config.enums[field].includes(value)) bad(field)
    if (config.numberFields?.includes(field)) {
      if (!['number', 'string'].includes(typeof value) || value === '' || (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value))) bad(field)
      const number = Number(value)
      const max = field === 'progress' ? 100 : field === 'duration' ? 1440 : field === 'attendees' ? 100000 : 1e12
      if (!Number.isFinite(number) || number < (field === 'duration' ? 1 : 0) || number > max || (['progress', 'duration', 'attendees'].includes(field) && !Number.isInteger(number))) bad(field)
      values[field] = number
    } else if (config.jsonFields?.includes(field)) {
      if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 200 || hasControls(item))) bad(field)
      values[field] = JSON.stringify([...new Set(value.map((item) => item.trim()))])
    } else {
      const max = ['description', 'agenda', 'recommendation'].includes(field) ? 8000 : 200
      if (typeof value !== 'string' || value.length > max || hasControls(value, true)) bad(field)
      const clean = value.trim()
      if (config.required.includes(field) && !clean) bad(field)
      if (field === 'due_date' && !dateKey(clean)) bad(field)
      if (field === 'starts_at') {
        if (!/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(clean) || !dateKey(clean.slice(0, 10)) || !Number.isFinite(Date.parse(clean))) bad(field)
        values[field] = new Date(clean).toISOString()
      } else {
        if (field === 'color' && !/^#[a-f\d]{6}$/i.test(clean)) bad(field)
        values[field] = field === 'project_id' && !clean ? null : clean
      }
    }
  }
  if (!partial && config.required.some((field) => !values[field])) bad('campo obligatorio')
  if (partial && !Object.keys(values).length) bad('cambios')
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 2000)) bad('reason')
  return values
}

// Keep the legacy name-based schema without accepting foreign/nonexistent users.
// Historical references remain readable if somebody is subsequently deactivated.
export function validateReferences(db, tenantId, resource, values) {
  for (const field of ['owner', 'assignee']) if (field in values) {
    if (!db.prepare("SELECT id FROM users WHERE tenant_id = ? AND status = 'active' AND name = ?").get(tenantId, values[field])) bad(field)
  }
  if (resource === 'meetings' && values.attendees) for (const name of JSON.parse(values.attendees)) {
    if (!db.prepare("SELECT id FROM users WHERE tenant_id = ? AND status = 'active' AND name = ?").get(tenantId, name)) bad('attendees')
  }
  if (resource === 'tasks' && values.project_id && !db.prepare('SELECT id FROM projects WHERE id = ? AND tenant_id = ?').get(values.project_id, tenantId)) bad('project_id')
}
