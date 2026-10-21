import Database from 'better-sqlite3'
import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runtimeConfig } from '../server/runtime.js'

// Never overwrite the destination or open/create the source as a new database.
export async function backupDatabase(source, destination) {
  if (!destination || path.resolve(source) === path.resolve(destination)) throw new Error('Elige un archivo de copia nuevo y distinto del original.')
  const db = new Database(source, { readonly: true, fileMustExist: true })
  let created = false
  try {
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    const fd = openSync(destination, 'wx', 0o600); closeSync(fd); created = true
    await db.backup(destination)
    const copy = new Database(destination, { readonly: true, fileMustExist: true })
    try { if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('La comprobación de integridad de la copia falló.') }
    finally { copy.close() }
  } catch (error) {
    if (created) unlinkSync(destination)
    throw error
  } finally { db.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await backupDatabase(runtimeConfig().dbPath, process.argv[2])
    console.log('Copia SQLite creada y verificada. Protege por separado las claves maestras; no están incluidas en esta copia.')
  } catch {
    console.error('No se pudo crear la copia. Comprueba origen, destino nuevo y permisos; no se sobrescribe un archivo existente.')
    process.exitCode = 1
  }
}
