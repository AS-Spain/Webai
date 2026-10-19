import test from 'node:test'
import assert from 'node:assert/strict'
import { privateBootstrapLink } from '../server/bootstrap-link.js'
import { readBootstrapFragment, scrubBootstrapFragment } from '../src/lib/bootstrap-link.js'
const token = 'a'.repeat(64)

test('el enlace privado coloca el token solo en el fragmento y elimina queries anteriores', () => {
  const url = new URL(privateBootstrapLink({ APP_BASE_URL: 'https://private.example.com/?invite=old#old' }, token))
  assert.equal(url.search, '')
  assert.equal(url.hash, `#setup=${token}`)
  assert.equal(readBootstrapFragment(url), token)
  assert.equal(new URL(url.origin + url.pathname + url.search).href.includes(token), false)
})
test('usa la vista previa de Arena o la dirección local sin mezclar la demo', () => {
  assert.equal(new URL(privateBootstrapLink({ E2B_SANDBOX_ID: 'sandbox-test', PORT: '3002' }, token)).origin, 'https://3002-sandbox-test.e2b.app')
  assert.equal(new URL(privateBootstrapLink({}, token)).origin, 'http://localhost:3002')
})
test('no permite protocolos activos ni credenciales incrustadas en el enlace', () => {
  for (const APP_BASE_URL of ['javascript:alert(1)', 'file:///tmp/setup', 'https://user:pass@example.com']) assert.throws(() => privateBootstrapLink({ APP_BASE_URL }, token))
})
test('borra la credencial de la dirección y de la entrada actual del historial', () => {
  const url = new URL(`https://private.example.com/?invite=test#setup=${token}&other=keep`)
  const calls = []
  const history = { state: { keep: true }, replaceState: (...args) => calls.push(args) }
  scrubBootstrapFragment(url, history)
  assert.deepEqual(calls, [[history.state, '', '/?invite=test#other=keep']])
  assert.equal(JSON.stringify(calls).includes(token), false)
})
test('solo lee el fragmento: una query o token inválido no precargan el campo', () => {
  for (const url of [`https://example.com/?setup=${token}`, 'https://example.com/#setup=short', `https://example.com/#setup=${'a'.repeat(513)}`, `https://example.com/#setup=${token}%0A`]) assert.equal(readBootstrapFragment(new URL(url)), '')
  const calls = []
  scrubBootstrapFragment(new URL('https://example.com/#help'), { replaceState: (...args) => calls.push(args) })
  assert.deepEqual(calls, [])
})
