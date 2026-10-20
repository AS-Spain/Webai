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
