import { createHash } from 'node:crypto'

// Only the digest is stored: a database leak does not expose bearer cookies.
const digest = (token) => createHash('sha256').update(token).digest('hex')
export class SessionStore {
  constructor(db) {
    this.db = db
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`)
    this.cleanup()
  }
  cleanup() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  }
  set(token, { userId, tenantId, expiresAt }) {
    this.cleanup()
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)')
      .run(digest(token), userId, tenantId, expiresAt)
  }
  get(token) {
    const row = this.db.prepare('SELECT user_id AS userId, tenant_id AS tenantId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?').get(digest(token))
    if (row && row.expiresAt <= Date.now()) {
      this.delete(token)
      return undefined
    }
    return row
  }
  delete(token) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token))
  }
  deleteForUser(userId) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }
}
