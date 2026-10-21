import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { integrationProviders, providerEndpoints } from './integration-providers.js'
import { readJsonBounded } from './upstream.js'
import { rateLimiter } from './security.js'
import { integrationVault } from './integration-vault.js'

class IntegrationError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const fail = (status, message) => { throw new IntegrationError(status, message) }
const hash = (value) => createHash('sha256').update(value).digest('hex')
const random = () => randomBytes(32).toString('base64url')
const identifier = (value) => {
  if (typeof value !== 'string' || !/^[a-z\d][a-z\d._:@!#=+-]{0,399}$/i.test(value)) fail(400, 'Identificador de destino no válido.')
  return encodeURIComponent(value)
}
const text = (value, max = 4000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Introduce un texto de entre 1 y ${max} caracteres.`)
  return value.trim()
}
const confirmedId = (data, field = 'id') => {
  if (typeof data[field] !== 'string' || !data[field]) fail(502, 'El proveedor no confirmó la operación con un identificador válido. Comprueba el destino antes de repetirla.')
  return data[field]
}
const dates = (from, to, maxDays = 31) => {
  if (typeof from !== 'string' || typeof to !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(from) || !/(Z|[+-]\d\d:\d\d)$/.test(to)) fail(400, 'Indica fechas ISO con zona horaria.')
  const start = Date.parse(from), end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > maxDays * 86400000) fail(400, `El intervalo debe ser válido y no superar ${maxDays} días.`)
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}

export function registerIntegrationRoutes(app, { db, authenticate, demoMode = false, keyPath, publicBaseUrl = process.env.APP_BASE_URL || '', encryptionKey, fetchImpl = fetch, recordActivity = () => {} }) {
  db.exec(`CREATE TABLE IF NOT EXISTS integration_settings (
    tenant_id TEXT NOT NULL REFERENCES tenants(id), provider TEXT NOT NULL,
    config_cipher TEXT NOT NULL, tokens_cipher TEXT, version TEXT NOT NULL,
    connected_at TEXT, expires_at INTEGER, last_error TEXT,
    PRIMARY KEY (tenant_id, provider)
  );
  CREATE TABLE IF NOT EXISTS integration_oauth_states (
    state_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider TEXT NOT NULL,
    user_id TEXT NOT NULL, version TEXT NOT NULL, verifier_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL
  );`)
  const vault = integrationVault(keyPath, encryptionKey)
  const flights = new Map(), budget = rateLimiter(db)
  const row = (tenant, provider) => db.prepare('SELECT * FROM integration_settings WHERE tenant_id = ? AND provider = ?').get(tenant, provider)
  const context = (tenant, provider, type) => `${tenant}:${provider}:${type}`
  const seal = (value, tenant, provider, type) => vault.seal(value, context(tenant, provider, type))
  const open = (value, tenant, provider, type) => vault.open(value, context(tenant, provider, type))
  const config = (value) => open(value.config_cipher, value.tenant_id, value.provider, 'config')
  function provider(id) {
    if (!Object.hasOwn(integrationProviders, id)) fail(404, 'Integración no disponible.')
    return integrationProviders[id]
  }
  function baseUrl() {
    let url
    try { url = new URL(publicBaseUrl) } catch { fail(503, 'Configura APP_BASE_URL con la URL pública de la aplicación antes de conectar OAuth.') }
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail(503, 'APP_BASE_URL debe ser un origen HTTPS, sin ruta ni parámetros (HTTP solo en localhost).')
    return url.origin
  }
  const callback = (id) => `${baseUrl()}/api/integrations/${id}/callback`
  const noDemo = () => { if (demoMode) fail(403, 'La demo pública no admite credenciales ni cuentas externas. Usa la aplicación normal.') }
  const admin = (req) => { noDemo(); if (req.user.role !== 'admin') fail(403, 'Solo un administrador puede configurar o utilizar las integraciones externas.') }
  function consume(req) {
    try { budget('integration-user', `${req.tenantId}:${req.user.id}`, 30, 60_000) }
    catch (error) { if (error.status === 429) fail(429, 'Límite de 30 operaciones de integración por minuto.'); throw error }
  }
  function status(tenant, id, isAdmin) {
    const value = row(tenant, id), meta = provider(id)
    let callbackUrl = '', setupError = ''
    try { callbackUrl = callback(id) } catch (error) { setupError = error.message }
    let safeConfig = {}, credentialError = ''
    if (isAdmin && value) { try { safeConfig = config(value) } catch { credentialError = 'No se puede descifrar la configuración. Restaura la clave maestra o desconecta y reemplaza las credenciales.' } }
    return { id, name: meta.name, kind: meta.kind, scopes: meta.scopes, configured: Boolean(value), connected: Boolean(value?.tokens_cipher),
      connectedAt: value?.connected_at || null, lastError: value?.last_error || '', callbackUrl, setupError,
      ...(isAdmin && value ? { clientId: safeConfig.clientId || '', microsoftTenant: safeConfig.microsoftTenant || 'organizations', credentialError } : {}) }
  }
  const guard = (handler, { publicCallback = false } = {}) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer')
    if (publicCallback) { res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); res.setHeader('X-Robots-Tag', 'noindex, nofollow') }
    try { await handler(req, res) }
    catch (error) {
      const code = error instanceof IntegrationError ? error.status : 503
      if (code === 429) res.setHeader('Retry-After', '60')
      const message = error instanceof IntegrationError ? error.message : 'No se pudo completar la integración. Comprueba la conexión y la clave de cifrado del servidor.'
      if (publicCallback) {
        const flow = req.integrationFlow
        if (flow) db.prepare('UPDATE integration_settings SET last_error = ? WHERE tenant_id = ? AND provider = ? AND version = ?').run(message, flow.tenant_id, flow.provider, flow.version)
        res.status(code).type('html').send(page(false))
      } else res.status(code).json({ error: message, requestId: req.requestId })
    }
  }
  function page(ok) {
    // No interpolated provider data, secrets, state, scripts or redirects.
    return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Northstar · OAuth</title><body><h1>${ok ? 'Integración conectada' : 'No se pudo conectar'}</h1><p>${ok ? 'Puedes cerrar esta pestaña y actualizar el estado en Configuración.' : 'La autorización fue rechazada, ha caducado o la configuración cambió. Cierra esta pestaña y vuelve a intentarlo desde Configuración.'}</p></body></html>`
  }
  async function request(url, options) {
    let response
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) }) }
    catch { fail(502, 'No se pudo contactar con el proveedor. Comprueba la salida a Internet del servidor.') }
    if (response.status === 429) { await response.body?.cancel().catch(() => {}); fail(429, 'El proveedor ha limitado las solicitudes. Espera antes de reintentar.') }
    return response
  }
  async function json(response, maxBytes = 2_097_152) {
    // Outlook sendMail legitimately returns an empty 202 response.
    if (response.status === 202 || response.status === 204) { await response.body?.cancel().catch(() => {}); return {} }
    try { return await readJsonBounded(response, maxBytes) }
    catch { fail(502, 'Respuesta del proveedor no válida o demasiado grande. Comprueba el destino antes de repetir una operación de envío.') }
  }
  async function tokenRequest(id, cfg, params) {
    const meta = providerEndpoints(id, cfg.microsoftTenant)
    const response = await request(meta.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...(meta.microsoft ? { scope: meta.scopes } : {}), ...params }).toString() })
    const payload = await json(response, 65_536)
    if (!response.ok || payload.ok === false || typeof payload.access_token !== 'string' || !payload.access_token || payload.access_token.length > 16384 || /[^!-~]/.test(payload.access_token)) fail(422, 'El proveedor rechazó la autorización. Revisa las credenciales, los permisos y la URL de retorno, o vuelve a conectar.')
    const seconds = Number(payload.expires_in || 0)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 366 * 86400) fail(502, 'La respuesta OAuth del proveedor no es válida.')
    return { accessToken: payload.access_token, refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : '', expiresAt: seconds ? Date.now() + seconds * 1000 : null }
  }
  async function freshToken(value, force = false) {
    const current = row(value.tenant_id, value.provider)
    if (!current?.tokens_cipher || current.version !== value.version) fail(409, 'La conexión ha cambiado. Actualiza su estado.')
    const token = open(current.tokens_cipher, current.tenant_id, current.provider, 'tokens')
    if (!force && (!token.expiresAt || token.expiresAt > Date.now() + 60_000)) return token
    if (!token.refreshToken) fail(409, 'La autorización ha caducado. Vuelve a conectar la integración.')
    const key = `${current.tenant_id}:${current.provider}:${current.version}`
    if (!flights.has(key)) {
      const promise = (async () => {
        let next
        try { next = await tokenRequest(current.provider, config(current), { grant_type: 'refresh_token', refresh_token: token.refreshToken }) }
        catch (error) {
          if (error.status === 422) db.prepare('UPDATE integration_settings SET tokens_cipher = NULL, connected_at = NULL, last_error = ? WHERE tenant_id = ? AND provider = ? AND version = ? AND tokens_cipher = ?').run('La autorización fue revocada o caducó. Vuelve a conectar.', current.tenant_id, current.provider, current.version, current.tokens_cipher)
          throw error
        }
        next.refreshToken ||= token.refreshToken
        const result = db.prepare('UPDATE integration_settings SET tokens_cipher = ?, expires_at = ?, last_error = NULL WHERE tenant_id = ? AND provider = ? AND version = ? AND tokens_cipher = ?').run(seal(next, current.tenant_id, current.provider, 'tokens'), next.expiresAt, current.tenant_id, current.provider, current.version, current.tokens_cipher)
        if (!result.changes) fail(409, 'La conexión cambió durante la renovación. Actualiza su estado.')
        return next
      })().finally(() => { if (flights.get(key) === promise) flights.delete(key) })
      flights.set(key, promise)
    }
    return flights.get(key)
  }
  async function api(value, url, body) {
    let token = await freshToken(value)
    const send = () => {
      const latest = row(value.tenant_id, value.provider)
      if (!latest?.tokens_cipher || latest.version !== value.version) fail(409, 'La conexión ha cambiado. Actualiza su estado.')
      return request(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json', ...(url.startsWith('https://graph.microsoft.com/') ? { Prefer: 'outlook.timezone="UTC"' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    }
    let response = await send()
    if (response.status === 401) { await response.body?.cancel().catch(() => {}); token = await freshToken(value, true); response = await send() }
    const result = await json(response)
    if ([401, 403].includes(response.status) || result.ok === false) fail(422, 'El proveedor rechazó la operación. Revisa los permisos, la pertenencia al canal y la autorización.')
    if (!response.ok) fail(502, 'El proveedor no pudo completar la operación. Comprueba el destino y su disponibilidad.')
    return result
  }
  const claim = db.transaction((state, id) => {
    if (typeof state !== 'string' || state.length > 200) fail(400, 'Estado OAuth no válido.')
    const value = db.prepare('SELECT * FROM integration_oauth_states WHERE state_hash = ?').get(hash(state))
    if (!value || value.provider !== id) fail(400, 'Estado OAuth no válido.')
    db.prepare('DELETE FROM integration_oauth_states WHERE state_hash = ?').run(hash(state))
    const user = db.prepare('SELECT role, status, tenant_id FROM users WHERE id = ?').get(value.user_id)
    if (value.expires_at <= Date.now() || !user || user.role !== 'admin' || user.status !== 'active' || user.tenant_id !== value.tenant_id || row(value.tenant_id, id)?.version !== value.version) fail(400, 'La autorización ha caducado o la cuenta ya no tiene permisos.')
    return value
  })

  // Callback must precede the app-wide session guard: providers cannot send our
  // iframe cookie or explicit memory credential back on the browser navigation.
  app.get('/api/integrations/:provider/callback', guard(async (req, res) => {
    noDemo(); provider(req.params.provider)
    const state = claim(req.query.state, req.params.provider)
    req.integrationFlow = state
    if (req.query.error || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) fail(400, 'Autorización cancelada o código no válido.')
    const value = row(state.tenant_id, state.provider)
    if (!value || value.version !== state.version) fail(409, 'La configuración ha cambiado.')
    const cfg = config(value)
    const verifier = open(state.verifier_cipher, state.tenant_id, state.provider, `state:${state.state_hash}`)
    const tokens = await tokenRequest(state.provider, cfg, { grant_type: 'authorization_code', code: req.query.code, redirect_uri: callback(state.provider), ...(provider(state.provider).pkce ? { code_verifier: verifier } : {}) })
    // Permission must still hold after the network request (deactivation race).
    const user = db.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ? AND role = ? AND status = ?').get(state.user_id, state.tenant_id, 'admin', 'active')
    if (!user) fail(403, 'La cuenta ya no puede conectar integraciones.')
    const saved = db.prepare('UPDATE integration_settings SET tokens_cipher = ?, connected_at = ?, expires_at = ?, last_error = NULL WHERE tenant_id = ? AND provider = ? AND version = ?').run(seal(tokens, state.tenant_id, state.provider, 'tokens'), new Date().toISOString(), tokens.expiresAt, state.tenant_id, state.provider, state.version)
    if (!saved.changes) fail(409, 'La configuración cambió durante la autorización.')
    recordActivity({ id: state.user_id, tenant_id: state.tenant_id }, 'connected', 'integration', state.provider, `Conectó ${provider(state.provider).name}.`)
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    res.type('html').send(page(true))
  }, { publicCallback: true }))

  app.get('/api/integrations', authenticate, guard(async (req, res) => {
    res.json({ demoMode, admin: req.user.role === 'admin', providers: Object.keys(integrationProviders).map((id) => demoMode ? { id, name: provider(id).name, kind: provider(id).kind, configured: false, connected: false, scopes: provider(id).scopes } : status(req.tenantId, id, req.user.role === 'admin')) })
  }))
  app.put('/api/integrations/:provider/config', authenticate, guard(async (req, res) => {
    admin(req); provider(req.params.provider); consume(req)
    const clientId = text(req.body?.clientId, 300), current = row(req.tenantId, req.params.provider)
    const clientSecret = req.body?.clientSecret || (current && config(current).clientId === clientId ? config(current).clientSecret : '')
    if (typeof clientSecret !== 'string' || !clientSecret.trim() || clientSecret.length > 4096 || /\s/.test(clientSecret)) fail(400, 'Introduce un secreto de cliente válido. No se muestra tras guardarlo.')
    const cfg = { clientId, clientSecret, microsoftTenant: req.body?.microsoftTenant || 'organizations' }
    if (typeof cfg.microsoftTenant !== 'string') fail(400, 'Tenant Microsoft no válido.')
    try { providerEndpoints(req.params.provider, cfg.microsoftTenant) } catch { fail(400, 'Tenant Microsoft no válido.') }
    db.transaction(() => {
      db.prepare(`INSERT INTO integration_settings (tenant_id, provider, config_cipher, version) VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, provider) DO UPDATE SET config_cipher = excluded.config_cipher, version = excluded.version, tokens_cipher = NULL, connected_at = NULL, expires_at = NULL, last_error = NULL`).run(req.tenantId, req.params.provider, seal(cfg, req.tenantId, req.params.provider, 'config'), randomUUID())
      db.prepare('DELETE FROM integration_oauth_states WHERE tenant_id = ? AND provider = ?').run(req.tenantId, req.params.provider)
    })()
    recordActivity(req.user, 'configured', 'integration', req.params.provider, `Configuró OAuth de ${provider(req.params.provider).name}.`)
    res.json(status(req.tenantId, req.params.provider, true))
  }))
  app.post('/api/integrations/:provider/authorize', authenticate, guard(async (req, res) => {
    admin(req); provider(req.params.provider); consume(req)
    if (!req.is('application/json')) fail(415, 'Utiliza application/json.')
    const value = row(req.tenantId, req.params.provider)
    if (!value) fail(409, 'Configura primero las credenciales de la aplicación OAuth.')
    const cfg = config(value), meta = providerEndpoints(req.params.provider, cfg.microsoftTenant), redirectUri = callback(req.params.provider)
    const state = random(), verifier = random(), stateHash = hash(state), version = randomUUID()
    db.transaction(() => {
      db.prepare('DELETE FROM integration_oauth_states WHERE expires_at < ? OR (tenant_id = ? AND provider = ?)').run(Date.now(), req.tenantId, req.params.provider)
      db.prepare('UPDATE integration_settings SET version = ?, last_error = NULL WHERE tenant_id = ? AND provider = ?').run(version, req.tenantId, req.params.provider)
      db.prepare('INSERT INTO integration_oauth_states VALUES (?, ?, ?, ?, ?, ?, ?)').run(stateHash, req.tenantId, req.params.provider, req.user.id, version, seal(verifier, req.tenantId, req.params.provider, `state:${stateHash}`), Date.now() + 10 * 60_000)
    })()
    const url = new URL(meta.authorize)
    url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: 'code', scope: meta.scopes, state,
      ...(meta.pkce ? { code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' } : {}),
      ...(req.params.provider === 'google' ? { access_type: 'offline', prompt: 'consent select_account' } : meta.microsoft ? { prompt: 'select_account' } : {}) }).toString()
    res.json({ url: url.href, expiresIn: 600 })
  }))
  app.delete('/api/integrations/:provider/connection', authenticate, guard(async (req, res) => {
    admin(req); provider(req.params.provider); consume(req)
    const value = row(req.tenantId, req.params.provider)
    let token = null
    try { if (value?.tokens_cipher) token = open(value.tokens_cipher, req.tenantId, req.params.provider, 'tokens') } catch { /* Local disconnect must work even after a lost master key. */ }
    db.transaction(() => {
      db.prepare('UPDATE integration_settings SET tokens_cipher = NULL, connected_at = NULL, expires_at = NULL, version = ?, last_error = NULL WHERE tenant_id = ? AND provider = ?').run(randomUUID(), req.tenantId, req.params.provider)
      db.prepare('DELETE FROM integration_oauth_states WHERE tenant_id = ? AND provider = ?').run(req.tenantId, req.params.provider)
    })()
    let revoked = false
    try {
      if (token && req.params.provider === 'google') revoked = (await request('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refreshToken || token.accessToken }).toString() })).ok
      if (token && req.params.provider === 'slack') { const response = await request('https://slack.com/api/auth.revoke', { method: 'POST', headers: { Authorization: `Bearer ${token.accessToken}` } }); revoked = response.ok && (await json(response)).ok === true }
    } catch { /* Still disconnected locally; tell the operator to revoke upstream. */ }
    recordActivity(req.user, 'disconnected', 'integration', req.params.provider, `Desconectó ${provider(req.params.provider).name}.`)
    res.json({ disconnected: true, revoked, notice: revoked ? 'Desconectada y autorización revocada.' : 'Desconectada localmente. Retira también el consentimiento en las aplicaciones autorizadas del proveedor.' })
  }))
  app.delete('/api/integrations/:provider/config', authenticate, guard(async (req, res) => {
    admin(req); provider(req.params.provider)
    if (row(req.tenantId, req.params.provider)?.tokens_cipher) fail(409, 'Desconecta primero la cuenta para intentar revocar su autorización.')
    db.transaction(() => {
      db.prepare('DELETE FROM integration_settings WHERE tenant_id = ? AND provider = ?').run(req.tenantId, req.params.provider)
      db.prepare('DELETE FROM integration_oauth_states WHERE tenant_id = ? AND provider = ?').run(req.tenantId, req.params.provider)
    })()
    res.status(204).end()
  }))

  app.post('/api/integrations/:provider/operation', authenticate, guard(async (req, res) => {
    admin(req); const meta = provider(req.params.provider); consume(req)
    const value = row(req.tenantId, req.params.provider)
    if (!value?.tokens_cipher) fail(409, 'Conecta primero esta integración.')
    const { action } = req.body || {}, body = req.body || {}, id = req.params.provider
    let result
    const graph = 'https://graph.microsoft.com/v1.0'
    if (['google', 'outlook'].includes(id)) {
      if (action === 'calendars') {
        const data = await api(value, id === 'google' ? 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100' : `${graph}/me/calendars?$top=100`)
        result = { items: (data.items || data.value || []).slice(0, 100).map((item) => ({ id: item.id, name: item.summary || item.name })), more: Boolean(data.nextPageToken || data['@odata.nextLink']) }
      } else if (['events', 'createEvent'].includes(action)) {
        const calendar = identifier(body.calendarId || (id === 'google' ? 'primary' : ''))
        const range = dates(body.start, body.end), title = action === 'createEvent' ? text(body.title, 200) : ''
        if (id === 'google') {
          const url = `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`
          const data = await api(value, action === 'events' ? `${url}?${new URLSearchParams({ timeMin: range.start, timeMax: range.end, singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })}` : url,
            action === 'createEvent' ? { summary: title, start: { dateTime: range.start }, end: { dateTime: range.end } } : undefined)
          result = action === 'createEvent' ? { id: confirmedId(data), created: true } : { items: (data.items || []).slice(0, 50).map((event) => ({ id: event.id, name: event.summary || '(Sin título)', start: event.start?.dateTime || event.start?.date, end: event.end?.dateTime || event.end?.date })), more: Boolean(data.nextPageToken) }
        } else {
          const url = `${graph}/me/calendars/${calendar}`
          const data = await api(value, action === 'events' ? `${url}/calendarView?${new URLSearchParams({ startDateTime: range.start, endDateTime: range.end, '$top': '50', '$orderby': 'start/dateTime' })}` : `${url}/events`,
            action === 'createEvent' ? { subject: title, start: { dateTime: range.start, timeZone: 'UTC' }, end: { dateTime: range.end, timeZone: 'UTC' } } : undefined)
          result = action === 'createEvent' ? { id: confirmedId(data), created: true } : { items: (data.value || []).slice(0, 50).map((event) => ({ id: event.id, name: event.subject || '(Sin título)', start: event.start?.dateTime ? `${event.start.dateTime}Z`.replace(/ZZ$/, 'Z') : null, end: event.end?.dateTime ? `${event.end.dateTime}Z`.replace(/ZZ$/, 'Z') : null })), more: Boolean(data['@odata.nextLink']) }
        }
      } else if (id === 'outlook' && action === 'sendMail') {
        const recipient = text(body.recipient, 254)
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) fail(400, 'Introduce un destinatario de correo válido.')
        await api(value, `${graph}/me/sendMail`, { message: { subject: text(body.subject, 200), body: { contentType: 'Text', content: text(body.message) }, toRecipients: [{ emailAddress: { address: recipient } }] }, saveToSentItems: true })
        result = { accepted: true }
      }
    } else if (id === 'slack') {
      if (action === 'channels') {
        const data = await api(value, 'https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=100')
        result = { items: (data.channels || []).slice(0, 100).map((item) => ({ id: item.id, name: item.name })), more: Boolean(data.response_metadata?.next_cursor) }
      } else if (action === 'sendMessage') {
        const channel = text(body.channelId, 100), message = text(body.message)
        if (!/^[CG][A-Z\d]{7,}$/.test(channel)) fail(400, 'Introduce el ID del canal Slack (C… o G…).')
        const data = await api(value, 'https://slack.com/api/chat.postMessage', { channel, text: message, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false })
        result = { sent: true, id: confirmedId(data, 'ts') }
      }
    } else if (id === 'teams') {
      if (action === 'teams') {
        const data = await api(value, `${graph}/me/joinedTeams`)
        result = { items: (data.value || []).slice(0, 100).map((item) => ({ id: item.id, name: item.displayName })), more: Boolean(data['@odata.nextLink']) }
      } else if (action === 'channels') {
        const data = await api(value, `${graph}/teams/${identifier(body.teamId)}/channels`)
        result = { items: (data.value || []).slice(0, 100).map((item) => ({ id: item.id, name: item.displayName })), more: Boolean(data['@odata.nextLink']) }
      } else if (action === 'sendMessage') {
        const data = await api(value, `${graph}/teams/${identifier(body.teamId)}/channels/${identifier(body.channelId)}/messages`, { body: { contentType: 'text', content: text(body.message) } })
        result = { sent: true, id: confirmedId(data) }
      } else if (action === 'createMeeting') {
        const range = dates(body.start, body.end)
        const data = await api(value, `${graph}/me/onlineMeetings`, { subject: text(body.title, 200), startDateTime: range.start, endDateTime: range.end })
        let join
        try { join = new URL(data.joinWebUrl) } catch { fail(502, 'El proveedor no devolvió un enlace de reunión válido.') }
        if (join.protocol !== 'https:' || !['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'].includes(join.hostname)) fail(502, 'El proveedor no devolvió un enlace de reunión válido.')
        result = { created: true, id: confirmedId(data), joinUrl: join.href }
      }
    }
    if (!result) fail(400, 'Operación no admitida para esta integración.')
    if (!['calendars', 'events', 'channels', 'teams'].includes(action)) recordActivity(req.user, 'sent', 'integration', id, `Ejecutó ${action} en ${meta.name}.`)
    res.json(result)
  }))
}
