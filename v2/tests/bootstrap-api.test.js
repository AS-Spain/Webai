import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const directory = mkdtempSync(path.join(tmpdir(), 'northstar-auto-bootstrap-api-'))
process.env.V2_DB_PATH = path.join(directory, 'private.sqlite')
process.env.DEMO_MODE = 'false'
delete process.env.BOOTSTRAP_TOKEN
const { app } = await import('../server/app.js')
const { db } = await import('../server/database.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}/api`

test('token de consola: nunca se entrega por HTTP y solo permite un alta', async () => {
  try {
    const file = `${process.env.V2_DB_PATH}.bootstrap-token.local`
    const token = readFileSync(file, 'utf8').trim()
    const status = await (await fetch(`${base}/setup/status`)).json()
    assert.equal(status.needsSetup, true)
    assert.equal(status.bootstrapEnabled, true)
    assert.equal(JSON.stringify(status).includes(token), false)
    const claim = () => fetch(`${base}/setup/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(status.autoTokenEnabled, false)
    for (const flag of [undefined, 'true', 'false']) {
      if (flag === undefined) delete process.env.V2_SETUP_AUTO_TOKEN
      else process.env.V2_SETUP_AUTO_TOKEN = flag
      const response = await claim()
      assert.equal(response.status, 404)
      assert.equal(JSON.stringify(await response.json()).includes(token), false)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    delete process.env.V2_SETUP_AUTO_TOKEN
    const submit = (bootstrapToken) => fetch(`${base}/setup/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: 'Private Company', name: 'First Admin', email: 'admin@example.com', password: 'long-private-password', bootstrapToken }) })
    assert.equal((await submit('incorrect')).status, 403)
    assert.equal(existsSync(file), true)
    const created = await submit(token)
    assert.equal(created.status, 201)
    const data = await created.json()
    assert.equal(data.user.role, 'admin')
    assert.equal(JSON.stringify(data).includes(token), false)
    assert.equal(existsSync(file), false)
    assert.equal(existsSync(file.replace('.bootstrap-token.local', '.bootstrap-link.local')), false)
    assert.equal(process.env.BOOTSTRAP_TOKEN, '')
    assert.equal((await submit(token)).status, 403)
    const after = await (await fetch(`${base}/setup/status`)).json()
    assert.equal(after.needsSetup, false)
    assert.equal(after.bootstrapEnabled, false)
    assert.equal((await claim()).status, 404)
    assert.equal(db.prepare("SELECT value FROM deployment_metadata WHERE key='bootstrap_browser'").get(), undefined)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
