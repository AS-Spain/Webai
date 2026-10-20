import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runtimeConfig } from './runtime.js'

// Vite must not announce a usable URL before its API has finished opening and
// seeding SQLite. Otherwise the very first page load can look like a login failure.
export async function waitForApi({ port, demo, timeout = 30000, interval = 100, fetchImpl = fetch }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/setup/status`, { signal: AbortSignal.timeout(Math.min(750, Math.max(1, deadline - Date.now()))) })
      const status = response.ok && await response.json()
      if (status && typeof status.needsSetup === 'boolean' && status.demoMode === demo) return
    } catch { /* The API may still be opening the database. */ }
    await delay(interval)
  }
  throw new Error('La API no está lista en el modo esperado. Revisa el puerto y el arranque del servidor.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = runtimeConfig()
  await waitForApi({ port: runtime.port, demo: runtime.demo })
}
