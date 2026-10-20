import path from 'node:path'
import { parseAllowedOrigins } from './ai-providers.js'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function runtimeConfig(env = process.env) {
  const boolean = (name, fallback = false) => {
    if (env[name] === undefined || env[name] === '') return fallback
    if (!['true', 'false'].includes(env[name])) throw new Error(`${name} debe ser true o false.`)
    return env[name] === 'true'
  }
  const demo = boolean('DEMO_MODE')
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) throw new Error('NODE_ENV debe ser development, test o production.')
  const production = env.NODE_ENV === 'production'
  const parseOrigin = (value, name) => {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
      if (production && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error()
      return url.origin
    } catch { throw new Error(`${name} debe contener orígenes HTTP(S) exactos, sin credenciales, ruta ni parámetros.`) }
  }
  const allowedWebOrigins = (env.V2_ALLOWED_WEB_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean).map((v) => parseOrigin(v, 'V2_ALLOWED_WEB_ORIGINS'))
  if (production && !env.APP_BASE_URL) throw new Error('APP_BASE_URL es obligatorio en producción.')
  if (env.APP_BASE_URL) allowedWebOrigins.push(parseOrigin(env.APP_BASE_URL, 'APP_BASE_URL'))
  for (const name of ['V2_AI_ENCRYPTION_KEY', 'V2_INTEGRATIONS_ENCRYPTION_KEY']) {
    if (env[name] && !/^[a-f\d]{64}$/i.test(env[name])) throw new Error(`${name} debe tener 64 caracteres hexadecimales.`)
  }
  if (env.V2_TIME_ZONE) {
    try { new Intl.DateTimeFormat('en', { timeZone: env.V2_TIME_ZONE }).format() }
    catch { throw new Error('V2_TIME_ZONE no es una zona IANA válida.') }
  }
  const trustedProxies = (env.V2_TRUSTED_PROXIES || '').split(',').map((v) => v.trim()).filter(Boolean)
  for (const proxy of trustedProxies) {
    const [ip, prefix, ...rest] = proxy.split('/')
    if (!isIP(ip) || rest.length || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (isIP(ip) === 6 ? 128 : 32)))) throw new Error('V2_TRUSTED_PROXIES requiere IPs o CIDRs explícitos; nunca true ni un número de saltos.')
  }
  const smtpPort = Number(env.SMTP_PORT || 587)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT debe ser un puerto válido.')
  boolean('SMTP_SECURE')
  const aiAllowedOrigins = parseAllowedOrigins(env.V2_AI_ALLOWED_ORIGINS || '').join(',')
  const demoAiEnabled = boolean('V2_DEMO_AI_ENABLED')
  const requestLogs = boolean('V2_REQUEST_LOGS', production)

  const normalDb = env.V2_DB_PATH || path.join(root, 'data/webai-live.sqlite')
  const demoDb = env.V2_DEMO_DB_PATH || path.join(root, 'data/webai-demo.sqlite')
  if (demo && path.resolve(demoDb) === path.resolve(normalDb)) throw new Error('La demo y la aplicación normal no pueden compartir el mismo archivo SQLite.')
  const port = Number(env.PORT || (demo ? 3003 : 3002))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.')
  // Trusted sandbox metadata, NOT arbitrary X-Forwarded-Host. Gateways can
  // replace Host; admit only this sandbox's known same-origin app endpoints.
  if (env.E2B_SANDBOX_ID && /^[a-z0-9-]+$/i.test(env.E2B_SANDBOX_ID)) {
    for (const previewPort of [port, demo ? 5175 : 5174, 4174]) allowedWebOrigins.push(`https://${previewPort}-${env.E2B_SANDBOX_ID}.e2b.app`)
  }
  return {
    production, embeddedPreview: Boolean(env.E2B_SANDBOX_ID), trustedProxies: trustedProxies.length ? trustedProxies : false,
    allowedWebOrigins, aiAllowedOrigins, demoAiEnabled, requestLogs, demo,
    port,
    dbPath: demo ? demoDb : normalDb,
    cookie: demo ? 'webai_v2_demo_session' : 'webai_v2_private_session',
    keyPath: path.join(root, demo ? 'data/ai-demo-master.key' : 'data/ai-master.key'),
  }
}
