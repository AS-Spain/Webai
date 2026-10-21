import { createHash, randomUUID } from 'node:crypto'
import { resourceConfig, resourceRoles } from './resources.js'
import { validateResource, validateReferences } from './validation.js'
import { HttpError } from './security.js'

const fingerprint = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex')
const names = { tasks: 'tarea', projects: 'proyecto', issues: 'incidencia', meetings: 'reunión', events: 'evento' }
export function assistantActions(db, mutate) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_actions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT, values_json TEXT NOT NULL, before_hash TEXT,
    before_json TEXT, status TEXT NOT NULL, result_json TEXT, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS ai_actions_owner ON ai_actions(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS ai_actions_expiry ON ai_actions(expires_at);`)
  const row = (req, id) => db.prepare('SELECT * FROM ai_actions WHERE id = ? AND tenant_id = ? AND user_id = ?').get(id, req.tenantId, req.user.id)
  const allowed = (req, resource, action) => {
    const user = db.prepare("SELECT role FROM users WHERE id = ? AND tenant_id = ? AND status = 'active'").get(req.user.id, req.tenantId)
    if (!user || !Object.hasOwn(resourceRoles, resource) || !resourceRoles[resource][action]?.includes(user.role)) throw new HttpError(403, 'Tu rol no permite este cambio.')
  }
  const publicAction = (value) => ({ id: value.id, resource: value.resource, action: value.action, recordId: value.record_id,
    label: `${value.action === 'create' ? 'Crear' : 'Modificar'} ${names[value.resource]}`, values: JSON.parse(value.values_json),
    before: JSON.parse(value.before_json || '{}'), status: value.status === 'pending' && value.expires_at <= Date.now() ? 'expired' : value.status, expiresAt: value.expires_at })
  const tools = (req) => Object.entries(resourceConfig).flatMap(([resource, config]) => ['create', 'update'].filter((action) => resourceRoles[resource][action].includes(req.user.role)).map((action) => {
    const properties = Object.fromEntries(config.columns.map((field) => [field, config.enums?.[field] ? { type: 'string', enum: config.enums[field] } : config.jsonFields?.includes(field) ? { type: 'array', items: { type: 'string' }, maxItems: 100 } : { type: config.numberFields?.includes(field) ? 'number' : 'string' }]))
    const values = { type: 'object', properties, additionalProperties: false, ...(action === 'create' ? { required: config.required } : { minProperties: 1 }) }
    return { type: 'function', function: { name: `${action}_${resource}`, description: `${action === 'create' ? 'Proponer crear' : 'Proponer modificar'} ${names[resource]}. Nunca ejecuta: requiere confirmación humana. Usa fechas ISO, IDs y responsables exactos, nunca inventados.`, parameters: action === 'create' ? values : { type: 'object', properties: { recordId: { type: 'string' }, changes: values }, required: ['recordId', 'changes'], additionalProperties: false } } }
  }))
  return {
    tools,
    propose(req, call) {
      if (!mutate) throw new HttpError(503, 'Las herramientas no están disponibles.')
      const match = /^(create|update)_(tasks|projects|issues|meetings|events)$/.exec(call?.function?.name || '')
      if (!match || call.type !== 'function' || typeof call.function.arguments !== 'string' || call.function.arguments.length > 12000) throw new HttpError(502, 'El modelo propuso una herramienta no válida.')
      const [, action, resource] = match
      allowed(req, resource, action)
      let args
      try { args = JSON.parse(call.function.arguments) } catch { throw new HttpError(502, 'El modelo devolvió parámetros no válidos para la herramienta.') }
      if (action === 'update' && (!args || typeof args.recordId !== 'string' || args.recordId.length > 200 || Object.keys(args).some((key) => !['recordId', 'changes'].includes(key)))) throw new HttpError(502, 'El modelo no identificó correctamente el registro.')
      const values = validateResource(resource, action === 'create' ? args : args.changes, { partial: action === 'update' })
      validateReferences(db, req.tenantId, resource, values)
      const before = action === 'update' ? db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(args.recordId, req.tenantId) : null
      if (action === 'update' && !before) throw new HttpError(404, 'El registro propuesto no existe en tu empresa.')
      // Convert DB JSON fields back to the public mutation contract.
      for (const field of configJson(resource)) if (values[field]) values[field] = JSON.parse(values[field])
      const id = randomUUID()
      db.prepare("DELETE FROM ai_actions WHERE expires_at < ? AND NOT EXISTS (SELECT 1 FROM ai_conversations c, json_each(c.response_json, '$.proposals') p WHERE c.tenant_id = ai_actions.tenant_id AND c.user_id = ai_actions.user_id AND json_extract(p.value, '$.id') = ai_actions.id)").run(Date.now())
      db.prepare("INSERT INTO ai_actions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)").run(id, req.tenantId, req.user.id, resource, action, before?.id || null, JSON.stringify(values), before ? fingerprint(before) : null, JSON.stringify(Object.fromEntries(Object.keys(values).map((key) => [key, before?.[key] ?? null]))), Date.now() + 600000)
      return publicAction(row(req, id))
    },
    get(req, id) { const value = row(req, id); if (!value) throw new HttpError(404, 'Propuesta no encontrada.'); return publicAction(value) },
    cancel(req, id) {
      const value = row(req, id)
      if (!value) throw new HttpError(404, 'Propuesta no encontrada.')
      if (value.status !== 'pending') throw new HttpError(409, 'La propuesta ya no está pendiente.')
      db.prepare("UPDATE ai_actions SET status = 'canceled' WHERE id = ? AND status = 'pending'").run(id)
      return this.get(req, id)
    },
    clear(req) { db.prepare('DELETE FROM ai_actions WHERE tenant_id = ? AND user_id = ?').run(req.tenantId, req.user.id) },
    confirm(req, id) {
      return db.transaction(() => {
        const value = row(req, id)
        if (!value) throw new HttpError(404, 'Propuesta no encontrada.')
        allowed(req, value.resource, value.action)
        if (value.status === 'executed') return { action: publicAction(value), record: JSON.parse(value.result_json), replayed: true }
        if (value.status !== 'pending' || value.expires_at <= Date.now()) throw new HttpError(409, 'La propuesta ha caducado o fue cancelada. Pide una nueva.')
        if (value.action === 'update') {
          const current = db.prepare(`SELECT * FROM ${value.resource} WHERE id = ? AND tenant_id = ?`).get(value.record_id, req.tenantId)
          if (!current || fingerprint(current) !== value.before_hash) throw new HttpError(409, 'El registro cambió después de la propuesta. Revisa los datos y pide otra.')
        }
        const record = mutate(req.user, value.resource, value.action, JSON.parse(value.values_json), value.record_id, { assistantProposalId: value.id })
        db.prepare("UPDATE ai_actions SET status = 'executed', result_json = ? WHERE id = ?").run(JSON.stringify(record), id)
        return { action: this.get(req, id), record, replayed: false }
      }).immediate()
    },
  }
}
const configJson = (resource) => resourceConfig[resource].jsonFields || []
