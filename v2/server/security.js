import { createHash, randomUUID } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Durable budgets shared by processes using THIS database, not by independent DBs.
export function rateLimiter(db, clock = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS request_limits (
    scope TEXT NOT NULL, key_hash TEXT NOT NULL, started_at INTEGER NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY(scope, key_hash)
  )`)
  return db.transaction((scope, key, max, windowMs) => {
    const now = clock(), hash = createHash('sha256').update(String(key)).digest('hex')
    db.prepare('DELETE FROM request_limits WHERE started_at < ?').run(now - 86_400_000)
    const row = db.prepare('SELECT * FROM request_limits WHERE scope = ? AND key_hash = ?').get(scope, hash)
    if (row && row.started_at > now - windowMs && row.count >= max) {
      const error = new HttpError(429, 'Demasiadas solicitudes. Espera antes de volver a intentarlo.')
      error.retryAfter = Math.max(1, Math.ceil((row.started_at + windowMs - now) / 1000))
      throw error
    }
    db.prepare(`INSERT INTO request_limits VALUES (?, ?, ?, 1) ON CONFLICT(scope, key_hash) DO UPDATE SET
      started_at = excluded.started_at, count = ?`).run(scope, hash, row && row.started_at > now - windowMs ? row.started_at : now,
      row && row.started_at > now - windowMs ? row.count + 1 : 1)
  })
}

export function installSecurity(app, { db, runtime, log = (entry) => console.log(JSON.stringify(entry)) }) {
  app.disable('x-powered-by')
  app.set('trust proxy', runtime.trustedProxies)
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.setHeader('X-Request-ID', req.requestId)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    if (runtime.production) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000')
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
    }
    const start = performance.now()
    res.once('finish', () => {
      // Never log raw URLs, query strings (OAuth/invites), IDs, bodies or errors.
      if (runtime.requestLogs) log({ event: 'http_request', requestId: req.requestId, method: req.method,
        route: req.route?.path || 'unmatched', status: res.statusCode, durationMs: Math.round(performance.now() - start) })
    })
    next()
  })
  const consume = rateLimiter(db)
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      if (unsafe) {
        const origin = req.get('origin')
        // Host is fixed by the browser; forwarded hosts are never trusted here.
        // Preserved preview Hosts work over HTTP upstream; replaced Hosts use
        // exact origins derived from trusted sandbox metadata/configuration.
        const hosts = new Set([`${req.protocol}://${req.get('host')}`])
        if (runtime.embeddedPreview && /^[a-z0-9-]+\.e2b\.app(?::\d{1,5})?$/i.test(req.get('host') || '')) hosts.add(`https://${req.get('host')}`)
        for (const value of runtime.allowedWebOrigins) hosts.add(value)
        if ((origin && !hosts.has(origin)) || (!origin && req.get('sec-fetch-site') && req.get('sec-fetch-site') !== 'same-origin')) {
          throw new HttpError(403, 'Origen de solicitud no permitido.')
        }
        if ((req.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'La API solo admite application/json para cambios.')
      }
      if (!req.path.startsWith('/health/')) consume('api-ip', req.ip, 300, 60_000)
      next()
    } catch (error) { next(error) }
  })
  return consume
}

export function apiErrors(error, req, res, next) {
  if (res.headersSent) return next(error)
  const status = error instanceof HttpError ? error.status : error.type === 'entity.too.large' ? 413 : ['entity.parse.failed', 'request.size.invalid', 'request.aborted'].includes(error.type) ? 400 : ['charset.unsupported', 'encoding.unsupported'].includes(error.type) ? 415 : 500
  if (status === 429) res.setHeader('Retry-After', String(error.retryAfter || 1))
  res.status(status).json({ error: error instanceof HttpError ? error.message : status === 400 ? 'JSON no válido.' : status === 413 ? 'La solicitud es demasiado grande.' : status === 415 ? 'Codificación de solicitud no compatible.' : 'No se pudo completar la operación.', requestId: req.requestId })
}
