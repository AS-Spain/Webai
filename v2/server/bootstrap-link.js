import { constants, closeSync, fstatSync, ftruncateSync, openSync, writeFileSync } from 'node:fs'

export function privateBootstrapLink(env, token) {
  const fallback = env.E2B_SANDBOX_ID
    ? `https://${env.PORT || 3002}-${env.E2B_SANDBOX_ID}.e2b.app/`
    : `http://localhost:${env.PORT || 3002}/`
  const url = new URL(env.APP_BASE_URL || fallback)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('APP_BASE_URL debe ser una URL HTTP(S) sin credenciales.')
  url.search = ''
  url.hash = new URLSearchParams({ setup: token }).toString()
  return url.href
}

export function writePrivateBootstrapLink(file, url) {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('El enlace privado de instalación debe guardarse en un archivo propio con permisos 0600.')
    ftruncateSync(fd, 0)
    writeFileSync(fd, `${url}\n`)
  } finally { closeSync(fd) }
}
