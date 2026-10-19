import { app } from './app.js'
import { runtimeConfig } from './runtime.js'
const runtime = runtimeConfig()
app.listen(runtime.port, '0.0.0.0', () => console.log(`Northstar v2 ${runtime.demo ? 'DEMO' : 'normal'} en puerto ${runtime.port}`))
