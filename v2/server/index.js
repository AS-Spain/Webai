import { app } from './app.js'
import { db } from './database.js'
import { runtimeConfig } from './runtime.js'
const runtime = runtimeConfig()
const server = app.listen(runtime.port, '0.0.0.0', () => console.log(`Northstar v2 ${runtime.demo ? 'DEMO' : 'normal'} en puerto ${runtime.port}`))
server.headersTimeout = 10_000
server.requestTimeout = 15_000
server.keepAliveTimeout = 5_000
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  app.locals.shuttingDown = true
  const deadline = setTimeout(() => {
    server.closeAllConnections()
    if (db.open) db.close()
    process.exit(1)
  }, 30_000).unref()
  server.close(() => {
    clearTimeout(deadline)
    if (db.open) db.close()
    console.log(JSON.stringify({ event: 'server_stopped' }))
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
