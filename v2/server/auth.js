import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { SessionStore } from './sessions.js'

export function registerAuthRoutes(app, db, demoMode, recordActivity, bootstrap) {
  const sessions = new SessionStore(db)
  const loginAttempts = new Map()
  const sessionCookie = demoMode ? 'webai_v2_demo_session' : 'webai_v2_private_session'
  const readSession = (req) => {
    // Memory-only bearer sessions are exclusive to the public demo. Normal users use HttpOnly cookies.
    if (demoMode && req.headers.authorization?.startsWith('Bearer ')) return req.headers.authorization.slice(7)
    return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1)
  }
  const cookieAttributes = (req) => {
    const preview = /^[a-z0-9-]+\.e2b\.app$/i.test((req.get('host') || '').split(':')[0])
    return preview ? '; Secure; SameSite=None; Partitioned' : `; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  }
  const clearCookie = (req, res) => res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; Path=/; Max-Age=0${cookieAttributes(req)}`)
  const sessionDuration = 8 * 60 * 60 * 1000
  const userByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
  const setSessionCookie = (req, res, sessionId) => {
    res.setHeader('Set-Cookie', `${sessionCookie}=${sessionId}; HttpOnly; Path=/; Max-Age=${sessionDuration / 1000}${cookieAttributes(req)}`)
  }

  function establishSession(req, res, user) {
    const sessionId = randomBytes(32).toString('hex')
    sessions.set(sessionId, { userId: user.id, tenantId: user.tenant_id, expiresAt: Date.now() + sessionDuration })
    setSessionCookie(req, res, sessionId)
    if (demoMode) res.locals.demoSessionToken = sessionId
    return { id: user.id, name: user.name, email: user.email, role: user.role }
  }

  function hashToken(token) {
    return createHash('sha256').update(token).digest('hex')
  }

  function validBootstrapToken(token) {
    const expected = process.env.BOOTSTRAP_TOKEN || ''
    const providedBuffer = Buffer.from(String(token || ''))
    const expectedBuffer = Buffer.from(expected)
    return expectedBuffer.length >= 32 && providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
  }

  app.use('/api/setup', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  app.get('/api/setup/status', (req, res) => {
    const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
    res.json({ needsSetup: users === 0, bootstrapEnabled: users === 0 && !demoMode && Boolean(process.env.BOOTSTRAP_TOKEN), autoTokenEnabled: false, demoMode })
  })

  // Retired: bootstrap secrets are available only on the operator's console.
  app.post('/api/setup/claim', (req, res) => res.status(404).json({ error: 'El token inicial solo está disponible en la consola del servidor.' }))

  app.post('/api/setup/bootstrap', (req, res) => {
    if (demoMode) return res.status(403).json({ error: 'La demo no admite el alta de espacios privados.' })
    if (!validBootstrapToken(req.body?.bootstrapToken)) return res.status(403).json({ error: 'Token de configuración no válido. Contacta con quien administra el despliegue.' })
    if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) return res.status(409).json({ error: 'El administrador inicial ya fue creado.' })

    const company = String(req.body?.company || '').trim()
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (company.length < 2 || company.length > 100) return res.status(400).json({ error: 'El nombre de la empresa debe tener entre 2 y 100 caracteres.' })
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' })
    if (!validEmail(email)) return res.status(400).json({ error: 'Introduce un correo válido.' })
    if (password.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres.' })

    const createWorkspace = db.transaction(() => {
      if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) throw new Error('BOOTSTRAP_ALREADY_USED')
      const tenantId = randomUUID()
      const userId = randomUUID()
      const salt = randomBytes(16).toString('hex')
      const passwordHash = scryptSync(password, salt, 64).toString('hex')
      db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, company)
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash)
        VALUES (?, ?, ?, ?, 'admin', ?, ?)`)
        .run(userId, tenantId, name, email, salt, passwordHash)
      db.prepare("DELETE FROM deployment_metadata WHERE key = 'bootstrap_browser'").run()
      const user = { id: userId, tenant_id: tenantId, name, email, role: 'admin' }
      recordActivity(user, 'created', 'workspace', tenantId, `Creó el espacio de trabajo ${company} y el administrador inicial.`)
      return user
    })

    try {
      const user = createWorkspace()
      bootstrap?.consume()
      process.env.BOOTSTRAP_TOKEN = ''
      const publicUser = establishSession(req, res, user)
      return res.status(201).json({ user: publicUser, company })
    } catch (error) {
      if (error.message === 'BOOTSTRAP_ALREADY_USED') return res.status(409).json({ error: 'El administrador inicial ya fue creado.' })
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
      throw error
    }
  })

  app.get('/api/invitations/validate', (req, res) => {
    const token = String(req.query.token || '')
    if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'El enlace de invitación no es válido.' })
    const invitation = db.prepare(`SELECT i.email, i.role, i.expires_at, t.name AS company
      FROM invitations i JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`)
      .get(hashToken(token), new Date().toISOString())
    if (!invitation) return res.status(410).json({ error: 'La invitación ha caducado, fue revocada o ya se utilizó.' })
    res.json({ email: invitation.email, role: invitation.role, company: invitation.company, expiresAt: invitation.expires_at })
  })

  app.post('/api/invitations/accept', (req, res) => {
    const token = String(req.body?.token || '')
    const name = String(req.body?.name || '').trim()
    const password = String(req.body?.password || '')
    if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'El enlace de invitación no es válido.' })
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' })
    if (password.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres.' })
    const tokenHash = hashToken(token)

    try {
      const accept = db.transaction(() => {
        const invitation = db.prepare(`SELECT * FROM invitations
          WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
          .get(tokenHash, new Date().toISOString())
        if (!invitation) throw new Error('INVITATION_NOT_ACTIVE')
        if (userByEmail.get(invitation.email)) throw new Error('INVITATION_EMAIL_EXISTS')
        const id = randomUUID()
        const salt = randomBytes(16).toString('hex')
        const passwordHash = scryptSync(password, salt, 64).toString('hex')
        db.prepare(`INSERT INTO users (id, tenant_id, name, email, role, salt, password_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(id, invitation.tenant_id, name, invitation.email, invitation.role, salt, passwordHash)
        db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL').run(new Date().toISOString(), invitation.id)
        const user = { id, tenant_id: invitation.tenant_id, name, email: invitation.email, role: invitation.role }
        recordActivity(user, 'accepted', 'invitation', invitation.id, `Aceptó la invitación como ${invitation.role}.`)
        return { user, company: db.prepare('SELECT name FROM tenants WHERE id = ?').get(invitation.tenant_id).name }
      })()
      const publicUser = establishSession(req, res, accept.user)
      return res.status(201).json({ user: publicUser, company: accept.company })
    } catch (error) {
      if (error.message === 'INVITATION_NOT_ACTIVE') return res.status(410).json({ error: 'La invitación ha caducado, fue revocada o ya se utilizó.' })
      if (error.message === 'INVITATION_EMAIL_EXISTS' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
      throw error
    }
  })

  app.post('/api/auth/demo', (req, res) => {
    if (!demoMode) return res.status(404).json({ error: 'El acceso demo no está disponible en esta aplicación.' })
    const accounts = { admin: 'ava@northstar.io', manager: 'olivia@northstar.io', member: 'marcus@northstar.io', viewer: 'jonah@northstar.io' }
    const role = req.body?.role || 'admin'
    if (!Object.hasOwn(accounts, role)) return res.status(400).json({ error: 'Perfil demo no válido.' })
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND tenant_id = 'tenant-northstar' AND status = 'active' AND role = ?").get(accounts[role], role)
    if (!user) return res.status(409).json({ error: 'Ese perfil demo no está disponible. Elige otro perfil.' })
    // Do not revoke another tab's demo session merely because it shares a cookie.
    const previous = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
    if (previous) sessions.delete(previous)
    const publicUser = establishSession(req, res, user)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ user: publicUser, company: 'Northstar · DEMO', sessionToken: res.locals.demoSessionToken, demoMode: true })
  })

  app.post('/api/auth/login', (req, res) => {
    const address = req.ip || 'unknown'
    const attempts = loginAttempts.get(address) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 }
    if (attempts.resetAt < Date.now()) {
      attempts.count = 0
      attempts.resetAt = Date.now() + 15 * 60 * 1000
    }
    if (attempts.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' })

    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = userByEmail.get(email)
    const candidate = scryptSync(password, user?.salt || 'invalid-user-salt', 64)
    const valid = user && user.status === 'active' && timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))
    if (!valid) {
      attempts.count += 1
      loginAttempts.set(address, attempts)
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
    }

    loginAttempts.delete(address)
    const publicUser = establishSession(req, res, user)
    return res.json({ user: publicUser, company: db.prepare('SELECT name FROM tenants WHERE id = ?').get(user.tenant_id).name })
  })

  app.post('/api/auth/logout', (req, res) => {
    const sessionId = readSession(req)
    if (sessionId) sessions.delete(sessionId)
    clearCookie(req, res)
    res.status(204).end()
  })

  function authenticate(req, res, next) {
    const sessionId = readSession(req)
    const session = sessionId && sessions.get(sessionId)
    if (!session || session.expiresAt <= Date.now()) {
      if (sessionId) sessions.delete(sessionId)
      clearCookie(req, res)
      return res.status(401).json({ code: sessionId ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED', error: sessionId ? 'Tu sesión ha caducado. Inicia sesión de nuevo.' : 'Inicia sesión para acceder a tu espacio de trabajo.' })
    }
    const user = db.prepare('SELECT id, tenant_id, name, email, role, status FROM users WHERE id = ?').get(session.userId)
    if (!user || user.tenant_id !== session.tenantId) return res.status(401).json({ error: 'Sesión no válida.' })
    if (user.status !== 'active') {
      sessions.delete(sessionId)
      return res.status(401).json({ error: 'Tu cuenta está desactivada. Contacta con un administrador.' })
    }
    req.user = user
    req.tenantId = session.tenantId
    next()
  }


  return { authenticate, sessions, userByEmail, validEmail, hashToken }
}
