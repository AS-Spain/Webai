// Persist the deployment mode so aliases, symlinks or a later environment change
// cannot turn a private database into a publicly accessible demo.
export function guardDatabaseMode(db, demo) {
  const hasTable = (name) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
  const expected = demo ? 'demo' : 'normal'
  const stored = hasTable('deployment_metadata')
    ? db.prepare("SELECT value FROM deployment_metadata WHERE key = 'mode'").get()?.value : null
  if (stored && stored !== expected) throw new Error('Esta base pertenece a otro entorno. Demo y aplicación normal deben usar archivos SQLite independientes.')
  if (hasTable('tenants')) {
    const tenants = db.prepare('SELECT id FROM tenants').all()
    if (demo && tenants.some((tenant) => tenant.id !== 'tenant-northstar')) throw new Error('La demo no puede abrir una base con espacios privados. Usa V2_DEMO_DB_PATH con una base de prueba independiente.')
    if (!demo && tenants.some((tenant) => tenant.id === 'tenant-northstar')) throw new Error('Esta base contiene el espacio de ejemplo. Utilízala solo como demo y crea una base privada independiente.')
  }
  db.exec('CREATE TABLE IF NOT EXISTS deployment_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare("INSERT OR IGNORE INTO deployment_metadata (key, value) VALUES ('mode', ?)").run(expected)
}
