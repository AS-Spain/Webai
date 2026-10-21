import { randomBytes } from 'node:crypto'
import { constants, closeSync, fstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Operator-only initial setup: the secret is printed on the server console,
// never delivered by a public API or a private-link redirect.
export function prepareBootstrap({ db, demo, dbPath, env = process.env, log = console.info }) {
  const file = `${path.resolve(dbPath)}.bootstrap-token.local`
  const linkFile = `${path.resolve(dbPath)}.bootstrap-link.local`
  const consume = () => {
    env.BOOTSTRAP_TOKEN = ''
    for (const secretFile of [file, linkFile]) {
      try { unlinkSync(secretFile) } catch (error) { if (error.code !== 'ENOENT') console.warn('No se pudo eliminar la credencial inicial utilizada:', secretFile) }
    }
  }
  const ready = (token) => {
    env.BOOTSTRAP_TOKEN = token
    log(`[Token] ---> ${token}`)
    return { consume }
  }
  if (demo) return { consume() {} }
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) {
    // A crash after committing the admin may have left an obsolete secret.
    consume()
    return { consume }
  }
  if (env.BOOTSTRAP_TOKEN) {
    if (env.BOOTSTRAP_TOKEN.trim().length < 32) throw new Error('BOOTSTRAP_TOKEN debe tener al menos 32 caracteres. Elimina la variable para generar uno seguro automáticamente.')
    return ready(env.BOOTSTRAP_TOKEN)
  }

  let descriptor
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    writeFileSync(descriptor, `${randomBytes(32).toString('hex')}\n`)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  } finally { if (descriptor !== undefined) closeSync(descriptor) }

  descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  let token
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('El archivo del token inicial debe pertenecer al usuario del servidor y tener permisos 0600.')
    token = readFileSync(descriptor, 'utf8').trim()
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('El archivo del token inicial no es válido. Retíralo y reinicia para generar uno nuevo.')
  } finally { closeSync(descriptor) }
  return ready(token)
}
