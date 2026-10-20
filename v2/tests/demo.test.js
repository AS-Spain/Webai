import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runtimeConfig } from '../server/runtime.js'

const directory = mkdtempSync(path.join(tmpdir(), 'northstar-demo-'))
const normalFile = path.join(directory, 'private.sqlite')
writeFileSync(normalFile, 'PRIVATE DATABASE MUST NOT BE OPENED BY THE DEMO')
process.env.DEMO_MODE = 'true'
process.env.V2_DB_PATH = normalFile
process.env.V2_DEMO_DB_PATH = path.join(directory, 'demo.sqlite')
process.env.SMTP_HOST = 'must-not-be-used.example.com'
const { app } = await import('../server/app.js')
const { db } = await import('../server/database.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}/api`
async function request(route, { method = 'GET', body, token, cookie, host } = {}) {
  if (host) return new Promise((resolve, reject) => {
    const req = httpRequest(`${base}${route}`, { method, headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
      let data = ''
      res.on('data', (part) => { data += part })
      res.on('end', () => resolve({ status: res.statusCode, cookieHeaders: res.headers['set-cookie'] || [], headers: new Headers({ 'set-cookie': res.headers['set-cookie']?.at(-1) || '' }), body: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
  const response = await fetch(`${base}${route}`, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}), ...(host ? { Host: host } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) }
}

test('demo separada: entrada sin contraseña, cookies bloqueadas y protección de la web normal', async (suite) => {
  try {
    let token
    await suite.test('usa otra base, cookie y puerto e ignora V2_DB_PATH', async () => {
      const demo = runtimeConfig({ DEMO_MODE: 'true', V2_DB_PATH: normalFile })
      const normal = runtimeConfig({})
      assert.equal(db.name, process.env.V2_DEMO_DB_PATH)
      assert.equal(demo.port, 3003)
      assert.equal(normal.port, 3002)
      assert.notEqual(demo.dbPath, normal.dbPath)
      assert.notEqual(demo.cookie, normal.cookie)
      assert.throws(() => runtimeConfig({ DEMO_MODE: 'true', V2_DB_PATH: normalFile, V2_DEMO_DB_PATH: normalFile }))
      assert.match(readFileSync(normalFile, 'utf8'), /MUST NOT BE OPENED/)
      assert.equal((await request('/setup/status')).body.demoMode, true)
      assert.equal((await request('/setup/claim', { method: 'POST', body: {} })).status, 404)
    })
    await suite.test('la demo abre directamente y no crea sesiones ni necesita tokens', async () => {
      const result = await request('/auth/me')
      assert.equal(result.status, 200)
      assert.equal(result.body.user.role, 'admin')
      assert.equal(result.body.demoMode, true)
      assert.equal(result.body.sessionToken, undefined)
      assert.equal(result.headers.get('set-cookie'), null)
      assert.equal((await request('/overview')).status, 200)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
    })
    await suite.test('los perfiles públicos conservan permisos sin cookies ni Authorization', async () => {
      const viewer = await request('/auth/me?demoRole=viewer')
      assert.equal(viewer.body.user.role, 'viewer')
      assert.equal((await request('/overview?demoRole=viewer')).status, 200)
      assert.equal((await request('/tasks?demoRole=viewer', { method: 'POST', body: {} })).status, 403)
      assert.equal((await request('/ai/config?demoRole=member', { method: 'PUT', body: {} })).status, 403)
      for (const query of ['__proto__', 'wrong', 'viewer&demoRole=admin']) assert.equal((await request(`/overview?demoRole=${query}`)).status, 400)
    })
    await suite.test('entra como admin de prueba sin cookies ni contraseña', async () => {
      const result = await request('/auth/demo', { method: 'POST', body: { role: 'admin' } })
      assert.equal(result.status, 200)
      assert.equal(result.body.user.role, 'admin')
      assert.match(result.headers.get('set-cookie'), /^webai_v2_demo_session=/)
      token = result.body.sessionToken
      assert.ok(token.length >= 32)
      const restored = await request('/auth/me', { cookie: `webai_v2_demo_session=${token}` })
      assert.equal(restored.status, 200)
      assert.equal(restored.body.sessionToken, undefined)
      assert.equal(restored.body.demoMode, true)
      assert.equal((await request('/overview', { token })).status, 200)
      assert.equal((await request('/overview', { cookie: `webai_v2_session=${token}` })).status, 200)
    })
    await suite.test('una cookie caducada nunca impide abrir los datos públicos', async () => {
      db.prepare('UPDATE sessions SET expires_at = 0').run()
      const expired = await request('/overview', { token })
      assert.equal(expired.status, 200)
      assert.equal(expired.headers.get('set-cookie'), null)
      const result = await request('/auth/demo', { method: 'POST', body: { role: 'admin' } })
      token = result.body.sessionToken
      assert.equal((await request('/overview', { token })).status, 200)
    })
    await suite.test('el selector de perfil conserva los permisos reales', async () => {
      const result = await request('/auth/demo', { method: 'POST', body: { role: 'viewer' } })
      assert.equal(result.body.user.role, 'viewer')
      assert.equal((await request('/tasks', { token: result.body.sessionToken, method: 'POST', body: {} })).status, 403)
      assert.equal((await request('/auth/demo', { method: 'POST', body: { role: '__proto__' } })).status, 400)
    })
    await suite.test('en la vista previa usa cookies particionadas y no almacena claves en la demo', async () => {
      const result = await request('/auth/demo', { method: 'POST', body: { role: 'admin' }, host: '3003-test.e2b.app' })
      const cookie = result.headers.get('set-cookie')
      assert.match(cookie, /Secure/)
      assert.match(cookie, /SameSite=None/)
      assert.match(cookie, /Partitioned/)
      assert.equal(result.cookieHeaders.length, 2)
      assert.match(result.cookieHeaders[0], /Max-Age=0/)
      assert.doesNotMatch(result.cookieHeaders[0], /Partitioned/)
      assert.match(result.cookieHeaders[1], /Partitioned/)
      assert.doesNotMatch(result.cookieHeaders[1], /Max-Age=0/)
      token = result.body.sessionToken
      assert.equal((await request('/ai/config', { token })).body.demoMode, true)
      assert.ok((await request('/ai/config', { token })).body.providers.every((provider) => provider.local))
      for (const body of [{ provider: 'openai', apiKey: 'never-send-this', model: 'gpt-4o-mini', allowContext: false }, { provider: 'ollama', apiKey: 'private-local-token', model: 'qwen2.5:3b', allowContext: false }]) {
        assert.equal((await request('/ai/config', { token, method: 'PUT', body })).status, 403)
      }
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_settings').get().n, 0)
    })
    await suite.test('los clientes antiguos pueden salir pero la demo continúa siendo pública', async () => {
      assert.equal((await request('/setup/bootstrap', { method: 'POST', body: {} })).status, 403)
      assert.equal((await request('/auth/logout', { token, method: 'POST' })).status, 204)
      assert.equal((await request('/overview', { token })).status, 200)
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
