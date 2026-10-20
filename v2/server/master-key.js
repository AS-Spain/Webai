import { randomBytes } from 'node:crypto'
import { closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Shared filesystem policy, NOT a shared key: AI and OAuth retain separate files.
export function loadMasterKey(file, configured) {
  if (configured) {
    if (typeof configured !== 'string' || !/^[a-f\d]{64}$/i.test(configured)) throw new Error('La clave maestra configurada no es válida.')
    return Buffer.from(configured, 'hex')
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  let descriptor
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    writeFileSync(descriptor, randomBytes(32)); fsyncSync(descriptor)
  } catch (error) { if (error.code !== 'EEXIST') throw error }
  finally { if (descriptor !== undefined) closeSync(descriptor) }
  descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid()) || stat.size !== 32) throw new Error('La clave maestra debe ser un archivo privado de 32 bytes, propiedad del usuario del servidor.')
    return readFileSync(descriptor)
  } finally { closeSync(descriptor) }
}
