import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8').replaceAll('import.meta.hot', 'globalThis.__webaiTestHot')
let version = 0
const loadVersion = () => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// version ${version++}`).toString('base64')}`)
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('HMR conserva la sesión sin dispose y mantiene coherentes los callbacks antiguos', async () => {
  const previousFetch = globalThis.fetch
  globalThis.__webaiTestHot = { data: {} }
  try {
    const first = await loadVersion()
    first.setDemoSession({ sessionToken: 'before-hmr', user: { role: 'viewer' } })
    // Vite may invalidate a dependency without disposing that dependency itself.
    const next = await loadVersion()
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer before-hmr')
      return json({ ok: true })
    }
    assert.equal((await next.api('/tasks')).ok, true)
    next.setDemoSession({ sessionToken: 'after-hmr', user: { role: 'admin' } })
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer after-hmr')
      return json({ ok: true })
    }
    assert.equal((await first.api('/overview')).ok, true)
    next.setDemoSession(null)
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, undefined)
      assert.equal(options.credentials, 'same-origin')
      return json({ ok: true })
    }
    assert.equal((await first.api('/overview')).ok, true)
  } finally { globalThis.fetch = previousFetch; delete globalThis.__webaiTestHot }
})

test('una renovación pendiente también se comparte entre versiones HMR', async () => {
  const previousFetch = globalThis.fetch
  globalThis.__webaiTestHot = { data: {} }
  let finish, renewals = 0
  try {
    const first = await loadVersion()
    first.setDemoSession({ sessionToken: 'expired', user: { role: 'viewer' } })
    globalThis.fetch = async (url, options) => {
      if (url === '/api/auth/demo') {
        renewals += 1
        return new Promise((resolve) => { finish = resolve })
      }
      return options.headers.Authorization === 'Bearer renewed' ? json({ ok: true }) : json({ error: 'caducada' }, 401)
    }
    const a = first.api('/overview')
    await new Promise((resolve) => setImmediate(resolve))
    const next = await loadVersion()
    const b = next.api('/tasks')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(renewals, 1)
    finish(json({ sessionToken: 'renewed', user: { role: 'viewer' } }))
    assert.ok((await Promise.all([a, b])).every((result) => result.ok))
    next.setDemoSession(null)
  } finally { globalThis.fetch = previousFetch; delete globalThis.__webaiTestHot }
})
