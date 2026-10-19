import test from 'node:test'
import assert from 'node:assert/strict'
import { api, setDemoSession } from '../src/lib/api.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
test('la demo renueva una sola sesión y repite las peticiones sin depender de cookies', async () => {
  const previous = globalThis.fetch
  let renewals = 0
  setDemoSession({ sessionToken: 'expired', user: { role: 'viewer' } })
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/demo') {
      renewals += 1
      assert.equal(JSON.parse(options.body).role, 'viewer')
      return json({ sessionToken: 'renewed', user: { role: 'viewer' } })
    }
    return options.headers.Authorization === 'Bearer renewed' ? json({ ok: true }) : json({ error: 'caducada' }, 401)
  }
  try {
    const results = await Promise.all([api('/overview'), api('/tasks')])
    assert.ok(results.every((result) => result.ok))
    assert.equal(renewals, 1)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('la aplicación normal no renueva una sesión como usuario de demo', async () => {
  const previous = globalThis.fetch
  let calls = 0
  setDemoSession(null)
  globalThis.fetch = async (url, options) => {
    calls += 1
    assert.equal(url, '/api/tasks')
    assert.equal(options.headers.Authorization, undefined)
    return json({ error: 'Inicia sesión' }, 401)
  }
  try {
    await assert.rejects(() => api('/tasks'), (error) => error.status === 401)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = previous }
})

test('una renovación tardía no resucita una sesión después del logout', async () => {
  const previous = globalThis.fetch
  let finish
  setDemoSession({ sessionToken: 'expired', user: { role: 'admin' } })
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/demo') return new Promise((resolve) => { finish = resolve })
    return json({ error: 'caducada' }, 401)
  }
  try {
    const result = api('/tasks')
    // Let the mocked response start the renewal, without timer-based polling.
    await new Promise((resolve) => setImmediate(resolve))
    setDemoSession(null)
    finish(json({ sessionToken: 'late', user: { role: 'admin' } }))
    await assert.rejects(() => result, /perfil demo ha cambiado/)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})


test('la caducidad privada notifica al contenedor para volver al login', async () => {
  const previous = globalThis.fetch
  const previousWindow = globalThis.window
  const events = new EventTarget()
  let notice
  events.addEventListener('northstar:session-expired', (event) => { notice = event.detail })
  globalThis.window = events
  globalThis.fetch = async () => json({ error: 'Sesión caducada' }, 401)
  try {
    await assert.rejects(() => api('/overview'), /Sesión caducada/)
    assert.equal(notice, 'Sesión caducada')
  } finally { globalThis.fetch = previous; globalThis.window = previousWindow }
})


test('un 401 antiguo que llega después de renovar no vuelve a rotar la sesión', async () => {
  const previous = globalThis.fetch
  let renewals = 0
  let release
  setDemoSession({ sessionToken: 'expired', user: { role: 'admin' } })
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/demo') {
      renewals += 1
      return json({ sessionToken: 'new', user: { role: 'admin' } })
    }
    if (options.headers.Authorization === 'Bearer new') return json({ ok: true })
    if (url === '/api/tasks') return new Promise((resolve) => { release = resolve })
    return json({ error: 'caducada' }, 401)
  }
  try {
    const late = api('/tasks')
    assert.equal((await api('/overview')).ok, true)
    release(json({ error: 'caducada' }, 401))
    assert.equal((await late).ok, true)
    assert.equal(renewals, 1)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})
