import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { loadMasterKey } from '../server/master-key.js'
import { backupDatabase } from '../scripts/backup.mjs'

test('claves: persistencia, permisos, contenido y enlaces simbólicos rechazados', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'webai-keys-'))
  try {
    const file = path.join(dir, 'master.key'), key = loadMasterKey(file)
    assert.equal(key.length, 32)
    assert.deepEqual(loadMasterKey(file), key)
    assert.equal(statSync(file).mode & 0o077, 0)
    chmodSync(file, 0o644)
    assert.throws(() => loadMasterKey(file), /archivo privado/)
    assert.equal(statSync(file).mode & 0o777, 0o644, 'No cambiar permisos de archivos preexistentes silenciosamente')
    chmodSync(file, 0o600)
    writeFileSync(file, 'invalid')
    assert.throws(() => loadMasterKey(file), /archivo privado/)
    const target = path.join(dir, 'untouched'), link = path.join(dir, 'linked.key')
    writeFileSync(target, 'untouched')
    symlinkSync(target, link)
    assert.throws(() => loadMasterKey(link))
    assert.equal(readFileSync(target, 'utf8'), 'untouched')
    assert.deepEqual(loadMasterKey(file, 'ab'.repeat(32)), Buffer.from('ab'.repeat(32), 'hex'))
    assert.throws(() => loadMasterKey(file, 'SECRET'), (error) => !error.message.includes('SECRET'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('copia y restauración aislada desde WAL, integridad y no sobrescritura', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'webai-backup-'))
  const source = path.join(dir, 'source.sqlite'), destination = path.join(dir, 'copy.sqlite')
  const db = new Database(source)
  try {
    db.pragma('journal_mode = WAL')
    db.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); INSERT INTO records VALUES ('1', 'synthetic')")
    assert.ok(existsSync(`${source}-wal`))
    await backupDatabase(source, destination)
    assert.equal(statSync(destination).mode & 0o077, 0)
    const restored = new Database(destination, { readonly: true, fileMustExist: true })
    try {
      assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok')
      assert.deepEqual(restored.prepare('SELECT * FROM records').all(), db.prepare('SELECT * FROM records').all())
    } finally { restored.close() }
    const before = readFileSync(destination)
    await assert.rejects(backupDatabase(source, destination))
    assert.deepEqual(readFileSync(destination), before)
    await assert.rejects(backupDatabase(source, source))
    const missing = path.join(dir, 'missing.sqlite')
    await assert.rejects(backupDatabase(missing, path.join(dir, 'no-copy.sqlite')))
    assert.equal(existsSync(missing), false)
    assert.equal(existsSync(path.join(dir, 'no-copy.sqlite')), false)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
