import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, preview, build } from 'vite'
import { privateFilePolicy } from '../server/private-files.js'

// Reproduce the critical leak using synthetic files, never the live data folder.
test('Vite real: datos, claves, token, public y /@fs quedan bloqueados; UI sigue funcionando', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'webai-vite-privacy-'))
  const { deny, plugin } = privateFilePolicy({ V2_DB_PATH: path.join(root, 'unusual-private-store'), V2_DEMO_DB_PATH: path.join(root, 'demo-store') })
  const secret = 'SYNTHETIC-ONLY-NOT-A-REAL-SECRET'
  const files = ['data/probe.sqlite.bootstrap-token.local', 'data/probe.sqlite', 'data/probe.sqlite-wal', 'data/probe.key', 'server/app.js', '.env.local', '.npmrc', 'operator.log', 'backups/archive', 'unusual-private-store', 'unusual-private-store-wal', 'public/probe.key', 'public/probe.sqlite', 'public/probe.sqlite.bootstrap-token.local']
  for (const file of files) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), secret) }
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Safe fixture</title>')
  mkdirSync(path.join(root, 'dist'), { recursive: true })
  writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>Safe built fixture</title>')
  for (const file of ['probe.key', 'probe.sqlite', 'probe.sqlite.bootstrap-token.local']) writeFileSync(path.join(root, 'dist', file), secret)
  symlinkSync(path.join(root, 'data/probe.key'), path.join(root, 'alias.txt'))
  const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [plugin], server: { host: '127.0.0.1', port: 0, fs: { deny } } })
  try {
    await server.listen()
    const port = server.httpServer.address().port
    for (const file of files) for (const route of [`/${file.startsWith('public/') ? file.slice(7) : file}`, `/@fs${root}/${file}`]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`)
      assert.equal(response.status, 403, route)
      assert.doesNotMatch(await response.text(), /SYNTHETIC-ONLY/)
    }
    for (const route of ['/alias.txt', '/data%2fprobe.sqlite', '/data%5cprobe.key', '/@fs' + root + '/data/probe.key?raw']) assert.equal((await fetch(`http://127.0.0.1:${port}${route}`)).status, 403)
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
    const built = await preview({ root, configFile: false, logLevel: 'silent', plugins: [plugin], preview: { host: '127.0.0.1', port: 0 } })
    try {
      for (const route of ['/probe.key', '/probe.sqlite', '/probe.sqlite.bootstrap-token.local']) assert.equal((await fetch(`http://127.0.0.1:${built.httpServer.address().port}${route}`)).status, 403)
      assert.equal((await fetch(`http://127.0.0.1:${built.httpServer.address().port}/`)).status, 200)
    } finally { await new Promise((resolve) => built.httpServer.close(resolve)) }
    await assert.rejects(build({ root, configFile: false, logLevel: 'silent', plugins: [plugin] }), /archivos privados|symlinks|enlaces simbólicos/)
  } finally { await server.close(); rmSync(root, { recursive: true, force: true }) }
})
