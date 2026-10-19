import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { prepareBootstrap } from '../server/bootstrap.js'

function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'northstar-bootstrap-'))
  const db = new Database(':memory:')
  db.exec('CREATE TABLE users (id TEXT)')
  const dbPath = path.join(directory, 'private.sqlite')
  const file = `${dbPath}.bootstrap-token.local`
  const env = {}, messages = []
  const options = { db, dbPath, demo: false, env, log: (message) => messages.push(message) }
  try { run({ db, file, env, options, messages }) } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
}

test('primer inicio: genera token aleatorio privado, estable al reiniciar y consumible', () => fixture(({ file, env, options, messages }) => {
  const bootstrap = prepareBootstrap(options)
  const first = env.BOOTSTRAP_TOKEN
  const linkFile = file.replace('.bootstrap-token.local', '.bootstrap-link.local')
  assert.equal(statSync(linkFile).mode & 0o777, 0o600)
  const link = new URL(readFileSync(linkFile, 'utf8').trim())
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('setup'), first)
  assert.equal(link.search, '')
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(readFileSync(file, 'utf8').trim(), first)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(messages.some((message) => message.includes(first)), false)
  const restartedEnv = {}
  prepareBootstrap({ ...options, env: restartedEnv })
  assert.equal(restartedEnv.BOOTSTRAP_TOKEN, first)
  bootstrap.consume()
  assert.equal(env.BOOTSTRAP_TOKEN, '')
  assert.equal(existsSync(file), false)
  assert.equal(existsSync(linkFile), false)
}))

test('respeta un token manual y rechaza una configuración explícita débil', () => fixture(({ file, env, options }) => {
  env.BOOTSTRAP_TOKEN = 'manual-secret-'.repeat(4)
  const bootstrap = prepareBootstrap(options)
  assert.equal(env.BOOTSTRAP_TOKEN, 'manual-secret-'.repeat(4))
  assert.equal(existsSync(file), false)
  bootstrap.consume()
  assert.equal(env.BOOTSTRAP_TOKEN, '')
  env.BOOTSTRAP_TOKEN = 'short'
  assert.throws(() => prepareBootstrap(options), /al menos 32/)
  assert.equal(existsSync(file), false)
}))

test('una base con administrador no genera ni conserva tokens de alta', () => fixture(({ db, file, env, options, messages }) => {
  prepareBootstrap(options)
  db.exec("INSERT INTO users VALUES ('admin')")
  env.BOOTSTRAP_TOKEN = 'operator-token-'.repeat(4)
  messages.length = 0
  prepareBootstrap(options)
  assert.equal(env.BOOTSTRAP_TOKEN, '')
  assert.equal(existsSync(file), false)
  assert.deepEqual(messages, [])
}))

test('la demo no genera ni imprime un token privado', () => fixture(({ file, env, options, messages }) => {
  prepareBootstrap({ ...options, demo: true })
  assert.equal(env.BOOTSTRAP_TOKEN, undefined)
  assert.equal(existsSync(file), false)
  assert.deepEqual(messages, [])
}))

test('no carga archivos inseguros, dañados ni enlaces simbólicos', () => fixture(({ file, env, options }) => {
  writeFileSync(file, 'a'.repeat(64), { mode: 0o600 })
  chmodSync(file, 0o644)
  assert.throws(() => prepareBootstrap(options), /permisos 0600/)
  assert.equal(env.BOOTSTRAP_TOKEN, undefined)
  chmodSync(file, 0o600)
  writeFileSync(file, 'broken')
  assert.throws(() => prepareBootstrap(options), /no es válido/)
  rmSync(file)
  const target = `${file}.target`
  writeFileSync(target, 'b'.repeat(64), { mode: 0o600 })
  symlinkSync(target, file)
  assert.throws(() => prepareBootstrap(options))
  assert.equal(env.BOOTSTRAP_TOKEN, undefined)
  assert.equal(readFileSync(target, 'utf8'), 'b'.repeat(64))
}))
