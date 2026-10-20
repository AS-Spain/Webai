import test from 'node:test'
import assert from 'node:assert/strict'
import { cookiePolicy } from '../server/cookies.js'

const req = (headers, secure = false) => ({ secure, get: (name) => headers[name] })
test('la cookie HTTPS no depende de que el proxy preserve Host', () => {
  for (const headers of [
    { host: '127.0.0.1:3002', 'x-forwarded-proto': 'https' },
    { host: '127.0.0.1:3002', 'x-forwarded-host': '3002-test.e2b.app' },
    { host: '3002-test.e2b.app' },
    { host: 'localhost', 'x-forwarded-proto': 'https, http' },
  ]) {
    const result = cookiePolicy(req(headers), { embeddedPreview: true })
    assert.equal(result.partitioned, true)
    assert.match(result.attributes, /Secure; SameSite=None; Partitioned/)
  }
  assert.equal(cookiePolicy(req({ host: 'localhost' }, true), { embeddedPreview: true }).partitioned, true)
  assert.equal(cookiePolicy(req({ host: 'localhost' })).partitioned, false)
})
test('un protocolo reenviado inseguro no elimina Secure en producción', () => {
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try { assert.match(cookiePolicy(req({ host: 'localhost', 'x-forwarded-proto': 'http' })).attributes, /Secure/) }
  finally { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before }
})

test('HTTPS fuera de vistas incrustadas mantiene la cookie privada Strict y Secure', () => {
  const result = cookiePolicy(req({ host: 'private.example.com', 'x-forwarded-proto': 'https' }), { embeddedPreview: false })
  assert.equal(result.partitioned, false)
  assert.equal(result.attributes, '; SameSite=Strict; Secure')
})
