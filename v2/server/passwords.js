import { scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { HttpError } from './security.js'
const derive = promisify(scrypt)
let active = 0
export const validPassword = (value) => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 1024
export async function passwordHash(password, salt) {
  if (active >= 4) throw new HttpError(429, 'El servicio de autenticación está ocupado. Inténtalo de nuevo.')
  active++
  try { return (await derive(password, salt, 64)).toString('hex') }
  finally { active-- }
}
