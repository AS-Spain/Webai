import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function integrationVault(keyPath, configured = process.env.V2_INTEGRATIONS_ENCRYPTION_KEY) {
  function key() {
    if (configured) {
      if (!/^[a-f\d]{64}$/i.test(configured)) throw new Error('Clave de cifrado de integraciones no válida.')
      return Buffer.from(configured, 'hex')
    }
    mkdirSync(path.dirname(keyPath), { recursive: true })
    try { writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    chmodSync(keyPath, 0o600)
    const value = readFileSync(keyPath)
    if (value.length !== 32) throw new Error('Clave de cifrado de integraciones no válida.')
    return value
  }
  return {
    seal(value, context) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv)
      cipher.setAAD(Buffer.from(`northstar-integrations:${context}`))
      const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.')
    },
    open(value, context) {
      const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64'))
      const cipher = createDecipheriv('aes-256-gcm', key(), iv)
      cipher.setAAD(Buffer.from(`northstar-integrations:${context}`)); cipher.setAuthTag(tag)
      return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'))
    },
  }
}
