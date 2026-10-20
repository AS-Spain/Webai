import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { loadMasterKey } from './master-key.js'

export function integrationVault(keyPath, configured = process.env.V2_INTEGRATIONS_ENCRYPTION_KEY) {
  function key() {
    return loadMasterKey(keyPath, configured)
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
