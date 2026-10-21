import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForApi } from '../server/wait-for-api.js'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('el arranque web espera a la API, sin confundir el inicio lento con un login', async () => {
  let calls = 0
  await waitForApi({ port: 3003, demo: true, interval: 0, fetchImpl: async (url) => {
    assert.equal(url, 'http://127.0.0.1:3003/api/setup/status')
    if (++calls < 3) throw new Error('ECONNREFUSED')
    return json({ needsSetup: false, demoMode: true })
  } })
  assert.equal(calls, 3)
})

test('una API normal no habilita por error la URL de una demo', async () => {
  await assert.rejects(waitForApi({ port: 3003, demo: true, timeout: 20, interval: 1, fetchImpl: async () => json({ needsSetup: true, demoMode: false }) }), /modo esperado/)
})

test('una respuesta HTTP errónea no se considera una API preparada', async () => {
  let calls = 0
  await waitForApi({ port: 3002, demo: false, interval: 0, fetchImpl: async () => ++calls === 1 ? json({ error: 'arrancando' }, 503) : json({ needsSetup: true, demoMode: false }) })
  assert.equal(calls, 2)
})

test('SIGTERM cierra HTTP/SQLite sin perder el alta privada y conserva las sesiones', async () => {
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const { createServer } = await import('node:http')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = (await import('node:path')).default
  const { fileURLToPath } = await import('node:url')
  const Database = (await import('better-sqlite3')).default
  const dir = mkdtempSync(path.join(tmpdir(), 'webai-shutdown-')), file = path.join(dir, 'private.sqlite')
  const reservation = createServer().listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const token = 'only-shutdown-test-token-'.repeat(3)
  const child = spawn(process.execPath, ['server/normal.js'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, NODE_ENV: 'test', PORT: String(port), V2_DB_PATH: file, BOOTSTRAP_TOKEN: token, SMTP_HOST: '', V2_REQUEST_LOGS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
  const exit = once(child, 'close')
  let output = ''
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('El servidor de prueba no arrancó')), 15000)
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('El servidor de prueba salió antes de arrancar')) })
      child.stdout.on('data', (data) => { output += data; if (output.includes(`en puerto ${port}`)) { clearTimeout(timeout); resolve() } })
      child.stderr.resume()
    })
    const response = await fetch(`http://127.0.0.1:${port}/api/setup/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: 'Shutdown fixture', name: 'Operator fixture', email: 'shutdown@example.com', password: 'only-test-password', bootstrapToken: token }) })
    assert.equal(response.status, 201)
    await response.json()
    child.kill('SIGTERM')
    const [code, signal] = await exit
    assert.equal(code, 0); assert.equal(signal, null)
    assert.match(output, /server_stopped/)
    const restored = new Database(file, { readonly: true, fileMustExist: true })
    try {
      assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1)
    } finally { restored.close() }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit }
    rmSync(dir, { recursive: true, force: true })
  }
})
