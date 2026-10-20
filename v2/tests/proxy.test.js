import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createServer } from 'vite'
import config from '../vite.config.js'
import { fileURLToPath } from 'node:url'

test('el proxy real de Vite conserva el dominio público de ambos modos', async () => {
  const proxy = config.server.proxy['/api']
  assert.equal(typeof proxy, 'object', 'El formato string activa changeOrigin y pierde el dominio de la vista previa')
  const backend = http.createServer((req, res) => res.end(JSON.stringify({ host: req.headers.host }))).listen(0, '127.0.0.1')
  await new Promise((resolve) => backend.once('listening', resolve))
  let vite
  try {
    vite = await createServer({ ...config, configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'silent', server: { ...config.server, host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { ...proxy, target: `http://127.0.0.1:${backend.address().port}` } } } })
    await vite.listen()
    for (const host of ['5174-private.e2b.app', '5175-demo.e2b.app', 'localhost:5174']) {
      const body = await new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port: vite.httpServer.address().port, path: '/api/test', headers: { Host: host } }, (res) => {
          let text = ''
          res.on('data', (part) => { text += part })
          res.on('end', () => resolve(JSON.parse(text)))
        })
        req.on('error', reject)
      })
      assert.equal(body.host, host)
    }
  } finally { await vite?.close(); await new Promise((resolve) => backend.close(resolve)) }
})
