import { randomUUID } from 'node:crypto'
import { HttpError } from './security.js'

export function conversationStore(db, { demoMode = false } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ai_conversations_owner ON ai_conversations(tenant_id, user_id, id);
    CREATE TABLE IF NOT EXISTS ai_conversation_versions (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version TEXT NOT NULL, PRIMARY KEY(tenant_id, user_id));`)
  const owner = (req) => [req.tenantId, req.user.id]
  const version = (req) => db.prepare('SELECT version FROM ai_conversation_versions WHERE tenant_id = ? AND user_id = ?').get(...owner(req))?.version || 'initial'
  const list = (req) => demoMode ? [] : db.prepare('SELECT * FROM ai_conversations WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 40').all(...owner(req)).reverse().map((row) => ({ id: row.id, question: row.question, ...JSON.parse(row.response_json), createdAt: row.created_at }))
  const current = (req, expected) => { if (version(req) !== expected) throw new HttpError(409, 'El historial se ha borrado durante la consulta. La respuesta antigua no se ha guardado.') }
  return {
    list, version, current,
    append(req, question, result, expected) {
      if (demoMode) return { ...result, id: randomUUID(), createdAt: new Date().toISOString() }
      return db.transaction(() => {
        current(req, expected)
        if (!db.prepare("SELECT id FROM users WHERE id = ? AND tenant_id = ? AND status = 'active'").get(req.user.id, req.tenantId)) throw new HttpError(403, 'Tu acceso ya no está activo.')
        const at = new Date().toISOString()
        const row = db.prepare('INSERT INTO ai_conversations (tenant_id, user_id, question, response_json, created_at) VALUES (?, ?, ?, ?, ?)').run(...owner(req), question, JSON.stringify(result), at)
        db.prepare('DELETE FROM ai_conversations WHERE tenant_id = ? AND user_id = ? AND id NOT IN (SELECT id FROM ai_conversations WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 40)').run(...owner(req), ...owner(req))
        return { ...result, id: Number(row.lastInsertRowid), createdAt: at }
      }).immediate()
    },
    clear(req) {
      if (demoMode) return
      db.transaction(() => {
        db.prepare('DELETE FROM ai_conversations WHERE tenant_id = ? AND user_id = ?').run(...owner(req))
        db.prepare('INSERT INTO ai_conversation_versions VALUES (?, ?, ?) ON CONFLICT(tenant_id, user_id) DO UPDATE SET version = excluded.version').run(...owner(req), randomUUID())
      }).immediate()
    },
    messages(req, proposalStatus = () => null) {
      // Historical context is sent ONLY on explicit includeHistory consent.
      const rows = list(req).slice(-8)
      const messages = []
      let length = 0
      for (const row of rows.reverse()) {
        const pair = [{ role: 'user', content: row.question }, { role: 'assistant', content: row.answer + ((row.proposals || []).length ? '\nEstado actual de las propuestas según el servidor: ' + row.proposals.map((p) => `${p.label}: ${proposalStatus(p.id) || 'no disponible'}`).join('; ') : '') }]
        if (length + JSON.stringify(pair).length > 12000) break
        messages.unshift(...pair); length += JSON.stringify(pair).length
      }
      return messages
    },
  }
}
