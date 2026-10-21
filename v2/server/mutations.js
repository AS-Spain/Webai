import { randomUUID } from 'node:crypto'
import { resourceConfig, resourceRoles, parseRow } from './resources.js'
import { validateResource, validateReferences } from './validation.js'
import { HttpError } from './security.js'

// HTTP forms and confirmed assistant actions use the SAME validation/RBAC/write path.
export function workspaceMutations(db, recordActivity) {
  return (actor, resource, action, body, recordId, source = {}) => db.transaction(() => {
    const user = db.prepare("SELECT id, tenant_id, role, status FROM users WHERE id = ? AND tenant_id = ? AND status = 'active'").get(actor.id, actor.tenant_id)
    if (!user || !Object.hasOwn(resourceConfig, resource) || !resourceRoles[resource][action]?.includes(user.role)) throw new HttpError(403, 'No tienes permiso para este cambio.')
    if (!['create', 'update'].includes(action)) throw new HttpError(400, 'Operación no disponible.')
    const current = action === 'update' ? db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(recordId, user.tenant_id) : null
    if (action === 'update' && !current) throw new HttpError(404, 'Registro no encontrado.')
    const values = validateResource(resource, body, { partial: action === 'update' })
    validateReferences(db, user.tenant_id, resource, values)
    const id = current?.id || randomUUID()
    if (action === 'create') {
      const fields = ['id', 'tenant_id', ...Object.keys(values), 'created_at']
      db.prepare(`INSERT INTO ${resource} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(id, user.tenant_id, ...Object.values(values), new Date().toISOString())
    } else {
      const changes = Object.entries(values)
      db.prepare(`UPDATE ${resource} SET ${changes.map(([field]) => `${field} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`).run(...changes.map(([, value]) => value), id, user.tenant_id)
    }
    const label = values.title || values.name || current?.title || current?.name
    const changedStatus = values.status && values.status !== current?.status ? ` (estado: ${current?.status} → ${values.status})` : ''
    const entity = { issues: 'una incidencia', tasks: 'una tarea', meetings: 'una reunión', events: 'un evento', projects: 'un proyecto' }[resource]
    recordActivity(user, action === 'create' ? 'created' : 'updated', resource, id, action === 'create' ? `Creó ${entity}: ${label}` : `Actualizó ${label}${changedStatus}`, source.assistantProposalId ? `Confirmado desde el asistente · propuesta ${source.assistantProposalId}` : body.reason || '', { ...(current ? { before: current } : {}), after: { ...current, ...values } })
    return parseRow(resource, db.prepare(`SELECT * FROM ${resource} WHERE id = ? AND tenant_id = ?`).get(id, user.tenant_id))
  }).immediate()
}
