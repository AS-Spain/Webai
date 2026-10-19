import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { SessionStore } from '../server/sessions.js'

function database(file = ':memory:') {
  const db = new Database(file)
  db.exec(`CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);
    INSERT OR IGNORE INTO tenants VALUES ('tenant');
    INSERT OR IGNORE INTO users VALUES ('user');`)
  return db
}
const session = () => ({ userId: 'user', tenantId: 'tenant', expiresAt: Date.now() + 60_000 })

test('las sesiones sobreviven al cierre y reapertura de SQLite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'northstar-session-'))
  try {
    let db = database(path.join(dir, 'test.sqlite'))
    const value = session()
    new SessionStore(db).set('secret-cookie', value)
    const stored = db.prepare('SELECT token_hash FROM sessions').get().token_hash
    assert.notEqual(stored, 'secret-cookie')
    assert.equal(stored.length, 64)
    db.close()
    db = database(path.join(dir, 'test.sqlite'))
    assert.deepEqual(new SessionStore(db).get('secret-cookie'), value)
    db.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('dos almacenes comparten sesiones y revocaciones', () => {
  const db = database()
  try {
    const first = new SessionStore(db)
    const second = new SessionStore(db)
    first.set('token', session())
    assert.equal(second.get('token').userId, 'user')
    second.delete('token')
    assert.equal(first.get('token'), undefined)
  } finally { db.close() }
})

test('caducidad y desactivación revocan las sesiones', () => {
  const db = database()
  try {
    const store = new SessionStore(db)
    store.set('expired', { ...session(), expiresAt: Date.now() - 1 })
    assert.equal(store.get('expired'), undefined)
    store.set('first', session())
    store.set('second', session())
    store.deleteForUser('user')
    assert.equal(store.get('first'), undefined)
    assert.equal(store.get('second'), undefined)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0)
  } finally { db.close() }
})
