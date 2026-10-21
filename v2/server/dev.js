import concurrently from 'concurrently'

process.env.DEMO_MODE = process.argv.includes('--demo') ? 'true' : 'false'
const { result } = concurrently([
  { command: 'node server/index.js', name: 'API', raw: true },
  { command: 'node server/wait-for-api.js && vite --host 0.0.0.0', name: 'Web' },
], { killOthers: ['failure', 'success'] })
try { await result } catch { process.exitCode = 1 }
