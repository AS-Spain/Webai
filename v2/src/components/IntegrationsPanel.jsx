import { useCallback, useEffect, useRef, useState } from 'react'
import { Workflow, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'

const actions = {
  google: [['calendars', 'Listar calendarios'], ['events', 'Consultar eventos'], ['createEvent', 'Crear evento externo']],
  outlook: [['calendars', 'Listar calendarios'], ['events', 'Consultar eventos'], ['createEvent', 'Crear evento externo'], ['sendMail', 'Enviar correo']],
  slack: [['channels', 'Listar canales públicos'], ['sendMessage', 'Enviar mensaje']],
  teams: [['teams', 'Listar mis equipos'], ['channels', 'Listar canales del equipo'], ['sendMessage', 'Enviar mensaje al canal'], ['createMeeting', 'Crear enlace de reunión']],
}

function Operations({ provider, onChange }) {
  const [action, setAction] = useState(actions[provider.id][0][0])
  const [fields, setFields] = useState({ calendarId: provider.id === 'google' ? 'primary' : '', teamId: '', channelId: '', start: '', end: '', title: '', recipient: '', subject: '', message: '' })
  const [result, setResult] = useState(null)
  const [resultAction, setResultAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = (name, label, type = 'text') => <label key={name}>{label}<input type={type} value={fields[name]} required maxLength={['title', 'subject'].includes(name) ? 200 : name === 'recipient' ? 254 : 400} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} /></label>
  const calendar = ['events', 'createEvent'].includes(action)
  const meeting = action === 'createMeeting'
  const sending = ['createEvent', 'createMeeting', 'sendMessage', 'sendMail'].includes(action)
  async function run(event) {
    event.preventDefault(); setError(''); setResult(null)
    if (sending && !window.confirm('Esta acción enviará datos al proveedor y realizará una operación real. ¿Continuar?')) return
    setBusy(true)
    try {
      const payload = { action, ...fields }
      if (calendar || meeting) { payload.start = new Date(fields.start).toISOString(); payload.end = new Date(fields.end).toISOString() }
      const response = await api(`/integrations/${provider.id}/operation`, { method: 'POST', body: JSON.stringify(payload) })
      setResult(response); setResultAction(action)
    } catch (requestError) { setError(requestError.message); onChange() }
    finally { setBusy(false) }
  }
  function select(item) {
    const name = resultAction === 'calendars' ? 'calendarId' : resultAction === 'teams' ? 'teamId' : 'channelId'
    setFields({ ...fields, [name]: item.id })
    setAction(resultAction === 'calendars' ? 'events' : resultAction === 'teams' ? 'channels' : 'sendMessage')
    setResult(null)
  }
  return <form className="integration-form integration-operations" onSubmit={run}>
    <h3>Operaciones reales · {provider.name}</h3>
    <p>Solo se ejecutan al pulsar el botón. No hay sincronización automática ni importación al calendario local. Si falla un envío por un corte de red, comprueba el proveedor antes de reintentarlo para evitar duplicados.</p>
    <label>Operación<select value={action} onChange={(event) => { setAction(event.target.value); setResult(null); setError('') }}>{actions[provider.id].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
    {calendar && field('calendarId', 'ID del calendario (consulta primero la lista)')}
    {provider.id === 'teams' && ['channels', 'sendMessage'].includes(action) && field('teamId', 'ID del equipo')}
    {action === 'sendMessage' && field('channelId', 'ID del canal')}
    {(calendar || meeting) && <div className="integration-form-grid">{field('start', 'Desde / inicio', 'datetime-local')}{field('end', 'Hasta / fin (máximo 31 días)', 'datetime-local')}</div>}
    {(action === 'createEvent' || meeting) && field('title', 'Título (sin invitaciones a asistentes)')}
    {action === 'sendMail' && <>{field('recipient', 'Correo del destinatario', 'email')}{field('subject', 'Asunto')}</>}
    {['sendMessage', 'sendMail'].includes(action) && <label>Mensaje<textarea value={fields.message} maxLength={4000} required rows={4} onChange={(event) => setFields({ ...fields, message: event.target.value })} /></label>}
    {provider.id === 'slack' && <small>Invita el bot al canal antes de enviar. La lista muestra hasta 100 canales públicos; también puedes introducir un ID autorizado.</small>}
    {meeting && <small>Crea un enlace de Teams, no una entrada de calendario. Requiere cuenta y licencia compatibles.</small>}
    <button className="button button-primary" disabled={busy}>{busy ? 'Procesando…' : actions[provider.id].find(([id]) => id === action)[1]}</button>
    {error && <p className="login-error" role="alert">{error}</p>}
    {result && <div className="integration-result" role="status">
      {result.sent && <p>Mensaje enviado.</p>}{result.accepted && <p>El proveedor ha aceptado el envío del correo.</p>}{result.created && <p>Creado en el proveedor externo.</p>}
      {result.joinUrl && <a href={result.joinUrl} target="_blank" rel="noopener noreferrer">Abrir reunión de Teams</a>}
      {result.items && <><p>{result.items.length} resultados{result.more ? ' (lista limitada; hay más en el proveedor)' : ''}.</p><ul>{result.items.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{item.start ? `${item.start} → ${item.end}` : item.id}</small></span>{resultAction !== 'events' && <button type="button" className="button button-outline" onClick={() => select(item)}>Usar</button>}</li>)}</ul></>}
    </div>}
  </form>
}

function Configuration({ provider, reload, authorize, busy }) {
  const [clientId, setClientId] = useState(provider.clientId || '')
  const [clientSecret, setClientSecret] = useState('')
  const [tenant, setTenant] = useState(provider.microsoftTenant || 'organizations')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const microsoft = ['outlook', 'teams'].includes(provider.id)
  async function save(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (provider.connected && !window.confirm('Guardar credenciales desconectará la cuenta actual. ¿Continuar?')) return
    setWorking(true)
    try {
      await api(`/integrations/${provider.id}/config`, { method: 'PUT', body: JSON.stringify({ clientId, clientSecret, microsoftTenant: tenant }) })
      setClientSecret(''); setNotice('Credenciales cifradas. Ahora pulsa Conectar con OAuth.'); await reload()
    } catch (requestError) { setError(requestError.message) }
    finally { setWorking(false) }
  }
  async function remove(connection) {
    if (!window.confirm(connection ? '¿Desconectar esta cuenta externa?' : '¿Eliminar las credenciales OAuth guardadas?')) return
    setWorking(true); setError(''); setNotice('')
    try {
      const response = await api(`/integrations/${provider.id}/${connection ? 'connection' : 'config'}`, { method: 'DELETE' })
      setNotice(response?.notice || 'Credenciales eliminadas.'); await reload()
    } catch (requestError) { setError(requestError.message) }
    finally { setWorking(false) }
  }
  return <div className="integration-detail">
    <form className="integration-form" onSubmit={save}>
      <p>La cuenta se comparte con los administradores de este espacio. Registra una aplicación en el proveedor y copia exactamente esta URL de retorno. El consentimiento puede requerir aprobación de tu organización.</p>
      <label>URL de retorno OAuth<code>{provider.callbackUrl || 'Configura APP_BASE_URL en el servidor y reinícialo.'}</code></label>
      {provider.setupError && <p className="login-error">{provider.setupError}</p>}
      {provider.credentialError && <p className="login-error" role="alert">{provider.credentialError}</p>}
      <label>Client ID<input value={clientId} required maxLength={300} autoComplete="off" onChange={(event) => setClientId(event.target.value)} /></label>
      <label>Client secret<input type="password" value={clientSecret} autoComplete="off" maxLength={4096} required={!provider.configured || provider.clientId !== clientId} placeholder={provider.configured ? 'Guardado · deja vacío para conservarlo' : ''} onChange={(event) => setClientSecret(event.target.value)} /></label>
      {microsoft && <label>Tenant Microsoft<input value={tenant} required maxLength={50} onChange={(event) => setTenant(event.target.value)} /><small>UUID de tu directorio, organizations o common.</small></label>}
      <details><summary>Permisos solicitados</summary><code>{provider.scopes}</code></details>
      <p>Secretos y tokens se cifran en el servidor. No se muestran ni se guardan en el navegador. Guardar cambios exige volver a autorizar.</p>
      <button className="button button-outline" disabled={working || busy}>Guardar credenciales</button>
    </form>
    <div className="integration-actions">
      <button className="button button-primary" disabled={!provider.configured || !provider.callbackUrl || working || busy || Boolean(provider.credentialError)} onClick={() => authorize(provider)}>{busy ? 'Esperando autorización…' : provider.connected ? 'Volver a autorizar' : 'Conectar con OAuth'}</button>
      {provider.connected && <button className="button button-outline" disabled={working || busy} onClick={() => remove(true)}>Desconectar cuenta</button>}
      {provider.configured && !provider.connected && <button className="button button-outline" disabled={working || busy} onClick={() => remove(false)}>Eliminar credenciales</button>}
    </div>
    {error && <p className="login-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{provider.lastError && <p className="login-error">{provider.lastError}</p>}
    {provider.connected && !provider.credentialError && !busy && <Operations provider={provider} onChange={reload} />}
  </div>
}

export default function IntegrationsPanel() {
  const [status, setStatus] = useState(null), [selected, setSelected] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(null)
  const popup = useRef(null)
  const reload = useCallback(async () => {
    try { const response = await api('/integrations'); setStatus(response); setError(''); return response }
    catch (requestError) { setError(requestError.message); return null }
  }, [])
  useEffect(() => { let active = true; api('/integrations').then((response) => { if (active) setStatus(response) }).catch((requestError) => { if (active) setError(requestError.message) }); return () => { active = false } }, [])
  useEffect(() => {
    if (!pending) return undefined
    let stopped = false, polling = false
    const timer = window.setInterval(async () => {
      if (polling) return
      polling = true
      const response = await reload()
      polling = false
      if (stopped) return
      const next = response?.providers.find((item) => item.id === pending.id)
      if (next?.connected && next.connectedAt !== pending.before) setPending(null)
      else if (next?.lastError || Date.now() > pending.until) { setPending(null); setError(next?.lastError || 'La autorización ha caducado. Vuelve a conectar.') }
    }, 2000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [pending, reload])
  async function authorize(provider) {
    // Open synchronously after the click so browsers don't block an async popup.
    const win = window.open('about:blank', '_blank', 'popup,width=700,height=800')
    if (!win) { setError('Permite ventanas emergentes o abre la aplicación en una pestaña propia para autorizar esta integración.'); return }
    win.opener = null; popup.current = win; setError('')
    try {
      const result = await api(`/integrations/${provider.id}/authorize`, { method: 'POST', body: '{}' })
      win.location.replace(result.url)
      setPending({ id: provider.id, before: provider.connectedAt, until: Date.now() + result.expiresIn * 1000 })
    } catch (requestError) { win.close(); setError(requestError.message) }
  }
  return <section className="panel settings-section">
    <div className="settings-section-head"><span className="settings-section-icon settings-integration-icon"><Workflow size={18} /></span><div><h2>Servicios conectados</h2><p>Calendarios, correo y mensajería mediante OAuth. Solo el administrador conecta cuentas y ejecuta operaciones.</p></div></div>
    <button className="button button-outline" onClick={reload}><RefreshCw size={14} /> Actualizar estado</button>
    {pending && <div className="integration-actions"><span role="status">Esperando el consentimiento del proveedor. Esta ventana se actualiza automáticamente.</span><button className="button button-outline" onClick={() => { try { popup.current?.close() } catch { /* Provider COOP may sever the popup reference. */ } setPending(null); reload() }}>Dejar de esperar</button></div>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {!status && !error && <p>Cargando integraciones…</p>}
    {status && !status.demoMode && status.admin && <p className="auth-footnote">Si la vista incrustada bloquea OAuth, <a href={window.location.href} target="_blank" rel="noopener noreferrer">abre la aplicación en una pestaña propia</a>.</p>}
    {status?.demoMode && <p className="settings-security-note">La demo pública no admite cuentas reales ni secretos. Configura las integraciones en la aplicación normal.</p>}
    <div className="integration-list">{status?.providers.map((provider) => <div key={provider.id}>
      <div className="integration-row"><span className="integration-monogram">{provider.name[0]}</span><span><strong>{provider.name}</strong><small>{provider.credentialError ? 'No se puede leer la configuración cifrada' : provider.connected ? `Conectado desde ${new Date(provider.connectedAt).toLocaleString()}` : provider.configured ? 'Credenciales guardadas · pendiente de autorización' : 'Sin configurar'}</small></span><span className={provider.connected && !provider.credentialError ? 'integration-connected' : 'integration-disconnected'}><i />{provider.credentialError ? 'Revisar cifrado' : provider.connected ? 'Conectado' : 'No conectado'}</span><button className="button button-outline" disabled={status.demoMode || !status.admin} onClick={() => setSelected(selected === provider.id ? '' : provider.id)}>{selected === provider.id ? 'Cerrar' : 'Configurar'}</button></div>
      {selected === provider.id && status.admin && !status.demoMode && <Configuration provider={provider} reload={reload} authorize={authorize} busy={Boolean(pending)} />}
    </div>)}</div>
  </section>
}
