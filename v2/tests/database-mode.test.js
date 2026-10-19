import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { guardDatabaseMode } from '../server/database-mode.js'

test('el modo persistido impide convertir una base privada en demo, incluso antes del alta', () => {
  const db = new Database(':memory:')
  try {
    guardDatabaseMode(db, false)
    assert.throws(() => guardDatabaseMode(db, true), /otro entorno/)
    assert.equal(db.prepare("SELECT value FROM deployment_metadata WHERE key='mode'").get().value, 'normal')
  } finally { db.close() }
})
test('una base privada antigua sin marcador no puede abrirse como demo', () => {
  const db = new Database(':memory:')
  try {
    db.exec("CREATE TABLE tenants (id TEXT); INSERT INTO tenants VALUES ('private-workspace')")
    assert.throws(() => guardDatabaseMode(db, true), /espacios privados/)
    assert.equal(db.prepare('SELECT id FROM tenants').get().id, 'private-workspace')
    guardDatabaseMode(db, false)
  } finally { db.close() }
})
test('una base antigua con usuarios demo solo puede abrirse como demo', () => {
  const db = new Database(':memory:')
  try {
    db.exec("CREATE TABLE tenants (id TEXT); INSERT INTO tenants VALUES ('tenant-northstar')")
    assert.throws(() => guardDatabaseMode(db, false), /espacio de ejemplo/)
    guardDatabaseMode(db, true)
    assert.throws(() => guardDatabaseMode(db, false), /otro entorno/)
  } finally { db.close() }
})
