import test from 'node:test'
import assert from 'node:assert/strict'
import { api, setDemoSession, confirmPrivateSession, startDemoSession, getDemoSessionResult, getDemoRoleHint, openPublicDemo, setPrivateSession, hasPrivateMemorySession } from '../src/lib/api.js'

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

test('una renovación antigua que falla no cierra la nueva sesión demo', async () => {
  const previous = globalThis.fetch
  const previousWindow = globalThis.window
  const events = new EventTarget()
  let expired = 0, fail
  events.addEventListener('northstar:session-expired', () => { expired += 1 })
  globalThis.window = events
  setDemoSession({ sessionToken: 'old', user: { role: 'admin' } })
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/demo') return new Promise((resolve, reject) => { fail = reject })
    return options.headers.Authorization === 'Bearer new' ? json({ ok: true }) : json({ error: 'caducada' }, 401)
  }
  try {
    const old = api('/overview')
    await new Promise((resolve) => setImmediate(resolve))
    setDemoSession({ sessionToken: 'new', user: { role: 'viewer' } })
    fail(new Error('network error'))
    await assert.rejects(old, /network error/)
    assert.equal(expired, 0)
    assert.equal((await api('/tasks')).ok, true)
  } finally { globalThis.fetch = previous; globalThis.window = previousWindow; setDemoSession(null) }
})

test('cada perfil tiene su renovación y una respuesta antigua no la borra', async () => {
  const previous = globalThis.fetch
  let finishOld, finishNew
  const roles = []
  setDemoSession({ sessionToken: 'old-admin', user: { role: 'admin' } })
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/demo') {
      const role = JSON.parse(options.body).role
      roles.push(role)
      return new Promise((resolve) => { if (role === 'admin') finishOld = resolve; else finishNew = resolve })
    }
    return options.headers.Authorization === 'Bearer renewed-viewer' ? json({ ok: true }) : json({ error: 'caducada' }, 401)
  }
  try {
    const old = api('/overview')
    await new Promise((resolve) => setImmediate(resolve))
    setDemoSession({ sessionToken: 'new-viewer', user: { role: 'viewer' } })
    const current = api('/tasks')
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(roles, ['admin', 'viewer'])
    finishOld(json({ sessionToken: 'old-renewed', user: { role: 'admin' } }))
    await assert.rejects(old, /perfil demo ha cambiado/)
    // Further requests must still share the viewer's pending renewal.
    const parallel = api('/projects')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(roles.length, 2)
    finishNew(json({ sessionToken: 'renewed-viewer', user: { role: 'viewer' } }))
    assert.equal((await current).ok, true)
    assert.equal((await parallel).ok, true)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('los 401 permanentes detienen la renovación automática tras un reintento', async () => {
  const previous = globalThis.fetch
  let renewals = 0
  setDemoSession({ sessionToken: 'old', user: { role: 'admin' } })
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/demo') { renewals += 1; return json({ sessionToken: 'rejected', user: { role: 'admin' } }) }
    return json({ error: 'sesión rechazada' }, 401)
  }
  try {
    await assert.rejects(api('/overview'), /sesión rechazada/)
    await assert.rejects(api('/tasks'), /sesión rechazada/)
    assert.equal(renewals, 1)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('una petición cancelada al navegar no expulsa la sesión demo activa', async () => {
  const previous = globalThis.fetch, previousWindow = globalThis.window
  const events = new EventTarget(), controller = new AbortController()
  let expired = 0
  events.addEventListener('northstar:session-expired', () => { expired += 1 })
  globalThis.window = events
  setDemoSession({ sessionToken: 'active', user: { role: 'admin' } })
  globalThis.fetch = async (url, options) => {
    if (url === '/api/tasks') { controller.abort(); return json({ error: 'cancelled request' }, 401) }
    assert.equal(url, '/api/overview')
    assert.equal(options.headers.Authorization, 'Bearer active')
    return json({ ok: true })
  }
  try {
    await assert.rejects(api('/tasks', { signal: controller.signal }), /cancelled request/)
    assert.equal(expired, 0)
    assert.equal((await api('/overview')).ok, true)
  } finally { globalThis.fetch = previous; globalThis.window = previousWindow; setDemoSession(null) }
})

test('la demo recuerda solo el perfil público y el logout lo elimina', () => {
  const previousWindow = globalThis.window
  const values = new Map()
  globalThis.window = { sessionStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } }
  try {
    setDemoSession({ sessionToken: 'never-store-this-secret', user: { role: 'viewer' } })
    assert.deepEqual([...values.values()], ['viewer'])
    setDemoSession(null)
    assert.equal(values.size, 0)
  } finally { globalThis.window = previousWindow; setDemoSession(null) }
})

test('el login privado verifica la cookie antes de mostrar el espacio', async () => {
  const previous = globalThis.fetch
  setDemoSession({ sessionToken: 'old-demo', user: { role: 'admin' } })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/me')
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.Authorization, undefined)
    return json({ user: { id: 'private-user' }, company: 'Private' })
  }
  try { assert.equal((await confirmPrivateSession('private-user')).user.id, 'private-user') }
  finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('una cookie rechazada no se presenta como un login correcto que luego expulsa', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => json({ error: 'Inicia sesión' }, 401)
  try { await assert.rejects(confirmPrivateSession('private-user'), /cookie de sesión/) }
  finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('una cookie de otra cuenta no confirma el nuevo login', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => json({ user: { id: 'previous-account' } })
  try { await assert.rejects(confirmPrivateSession('new-account'), /cookie de sesión/) }
  finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('restauraciones demo simultáneas comparten una sola entrada', async () => {
  const previous = globalThis.fetch
  let finish, calls = 0
  setDemoSession(null)
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/auth/demo')
    calls += 1
    return new Promise((resolve) => { finish = resolve })
  }
  try {
    const first = startDemoSession('viewer'), second = startDemoSession('viewer')
    assert.equal(first, second)
    finish(json({ sessionToken: 'restored', user: { role: 'viewer' }, company: 'Demo' }))
    await Promise.all([first, second])
    assert.equal(calls, 1)
    assert.equal(getDemoSessionResult().user.role, 'viewer')
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('un logout durante la restauración demo no puede volver a entrar solo', async () => {
  const previous = globalThis.fetch
  let finish
  setDemoSession(null)
  globalThis.fetch = async () => new Promise((resolve) => { finish = resolve })
  try {
    const entry = startDemoSession('viewer')
    setDemoSession(null)
    finish(json({ sessionToken: 'late', user: { role: 'viewer' } }))
    await assert.rejects(entry, /perfil demo ha cambiado/)
    assert.equal(getDemoSessionResult(), null)
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('los perfiles demo no válidos en el navegador nunca se restauran', () => {
  const previousWindow = globalThis.window
  globalThis.window = { sessionStorage: { getItem: () => 'private-superuser' } }
  try { assert.equal(getDemoRoleHint(), null) }
  finally { globalThis.window = previousWindow }
})

test('el bloqueo de almacenamiento no rompe la recuperación por cookie', () => {
  const previousWindow = globalThis.window
  globalThis.window = Object.defineProperty({}, 'sessionStorage', { get() { throw new Error('Storage blocked') } })
  try {
    setDemoSession({ sessionToken: 'memory-only', user: { role: 'viewer' } })
    assert.equal(getDemoRoleHint(), null)
    assert.equal(getDemoSessionResult().user.role, 'viewer')
    setDemoSession(null)
  } finally { globalThis.window = previousWindow; setDemoSession(null) }
})

test('la demo pública abre sin POST de login y conserva el perfil en todas las URLs', async () => {
  const previous = globalThis.fetch
  setDemoSession(null)
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    assert.equal(options.headers.Authorization, undefined)
    if (url.includes('/auth/me')) return json({ demoMode: true, user: { role: 'viewer' }, company: 'Demo' })
    return json({ counts: {} })
  }
  try {
    const first = openPublicDemo('viewer'), second = openPublicDemo('viewer')
    assert.equal(first, second)
    await first
    await api('/overview')
    await api('/tasks?page=2')
    assert.deepEqual(calls, ['/api/auth/me?demoRole=viewer', '/api/overview?demoRole=viewer', '/api/tasks?page=2&demoRole=viewer'])
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('un fallo de API demo no pide login ni inicia un bucle de renovación', async () => {
  const previous = globalThis.fetch
  setDemoSession({ demoMode: true, user: { role: 'viewer' } })
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return json({ error: 'Inicia sesión para acceder a tu espacio de trabajo.' }, 401) }
  try {
    await assert.rejects(api('/overview'), /demo pública/)
    assert.equal(calls, 1)
    assert.equal(getDemoSessionResult().user.role, 'viewer')
  } finally { globalThis.fetch = previous; setDemoSession(null) }
})

test('la sesión privada temporal usa solo memoria y el encabezado propio', async () => {
  const previous = globalThis.fetch, previousWindow = globalThis.window
  const values = new Map()
  const storage = { setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  globalThis.window = { sessionStorage: storage, localStorage: storage }
  setDemoSession(null)
  setPrivateSession({ sessionTransport: 'memory', sessionToken: 'private-memory-secret' })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/me')
    assert.equal(options.headers['X-Webai-Session'], 'private-memory-secret')
    assert.equal(options.headers.Authorization, undefined)
    return json({ user: { id: 'private-user', role: 'member' } })
  }
  try {
    assert.equal(hasPrivateMemorySession(), true)
    assert.equal((await confirmPrivateSession('private-user')).user.id, 'private-user')
    assert.equal(values.size, 0)
    setPrivateSession(null)
    assert.equal(hasPrivateMemorySession(), false)
  } finally { globalThis.fetch = previous; globalThis.window = previousWindow; setPrivateSession(null) }
})
