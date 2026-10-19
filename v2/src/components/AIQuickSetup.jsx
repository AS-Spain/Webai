import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap, Sparkles, Unplug } from 'lucide-react'
import { api } from '../lib/api.js'

export default function AIQuickSetup({ user }) {
  const [status, setStatus] = useState(null)
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiKey, setApiKey] = useState('')
  const [allowContext, setAllowContext] = useState(false)
  const [models, setModels] = useState([])
  const [busy, setBusy] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = user.role === 'admin'

  useEffect(() => {
    const controller = new AbortController()
    api('/ai/config', { signal: controller.signal }).then((result) => {
      setStatus(result)
      if (result.configured) {
        setProvider(result.provider)
        setModel(result.model)
        setAllowContext(result.allowContext)
      }
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message)
    }).finally(() => { if (!controller.signal.aborted) setBusy('') })
    return () => controller.abort()
  }, [])

  function changeProvider(event) {
    const id = event.target.value
    setProvider(id)
    setModel(status.providers.find((item) => item.id === id).model)
    setApiKey('')
    setModels([])
    setError('')
    setNotice('')
  }
  async function loadModels() {
    setBusy('models'); setError(''); setNotice('')
    try {
      const result = await api('/ai/models', { method: 'POST', body: JSON.stringify({ provider, apiKey }) })
      setModels(result.models)
      setNotice(`${result.models.length} modelos disponibles. Elige un modelo de chat compatible; puedes escribir su identificador.`)
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy('') }
  }
  async function activate(event) {
    event.preventDefault()
    setBusy('save'); setError(''); setNotice('')
    try {
      const result = await api('/ai/config', { method: 'PUT', body: JSON.stringify({ provider, model, apiKey, allowContext }) })
      setStatus(result)
      setApiKey('')
      setNotice('Conexión verificada y activada. Ya puedes elegir IA real en el asistente.')
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy('') }
  }
  async function disconnect() {
    if (!window.confirm('¿Desconectar la IA y eliminar la clave API guardada de este espacio?')) return
    setBusy('disconnect'); setError(''); setNotice('')
    try {
      await api('/ai/config', { method: 'DELETE' })
      setStatus({ ...status, configured: false, provider: '', model: '', allowContext: false })
      setApiKey(''); setAllowContext(false); setModels([])
      setNotice('Proveedor desconectado y clave eliminada. El modo de reglas sigue disponible.')
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy('') }
  }

  return (
    <section className="panel settings-section ai-setup" aria-labelledby="ai-setup-title">
      <div className="settings-section-head">
        <span className="settings-section-icon ai-setup-icon"><Sparkles size={18} /></span>
        <div>
          <span className="panel-kicker">FAST SETUP · IA REAL</span>
          <h2 id="ai-setup-title">Conecta tu inteligencia artificial</h2>
          <p>Elige proveedor, añade tu clave y comprueba la conexión en un paso.</p>
        </div>
        {status && <span className={`ai-connection ${status.configured ? 'ai-connected' : ''}`}>
          <i />{status.configured ? 'Configurada' : 'Sin conectar'}
        </span>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="ai-setup-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {busy === 'loading' && <p role="status">Cargando configuración…</p>}
      {status && !admin && <div className="ai-viewer-note">
        <strong>{status.configured ? `${status.providers.find((item) => item.id === status.provider)?.name} · ${status.model}` : 'Todavía no hay un proveedor de IA conectado.'}</strong>
        <p>Solo un administrador puede configurar o desconectar la IA. El asistente de reglas permanece disponible.</p>
      </div>}
      {status && admin && <form onSubmit={activate} className="ai-setup-form">
        <div className="ai-setup-steps" aria-label="Pasos de configuración">
          <span><b>1</b> Proveedor</span><span><b>2</b> Clave y modelo</span><span><b>3</b> Probar y activar</span>
        </div>
        <div className="form-two">
          <label>Proveedor
            <select aria-label="Proveedor" value={provider} onChange={changeProvider} disabled={Boolean(busy)}>
              {status.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Clave API <span className="ai-field-hint"><KeyRound size={12} /> Solo servidor</span>
            <input aria-label="Clave API" type="password" name="ai-api-key" autoComplete="off" spellCheck={false}
              value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={Boolean(busy)}
              required={!status.configured || provider !== status.provider} maxLength={4096}
              placeholder={status.configured && provider === status.provider ? 'Clave guardada · deja vacío para conservarla' : 'Pega tu clave del proveedor'} />
          </label>
        </div>
        <div className="ai-model-row">
          <label>Modelo de chat
            <input aria-label="Modelo de chat" name="ai-model" list="ai-model-options" value={model} onChange={(event) => setModel(event.target.value)} required maxLength={150} disabled={Boolean(busy)} />
            <datalist id="ai-model-options">{models.map((id) => <option key={id} value={id} />)}</datalist>
          </label>
          <button type="button" className="button button-outline" onClick={loadModels} disabled={Boolean(busy) || (!apiKey && (!status.configured || provider !== status.provider))}>
            {busy === 'models' ? <LoaderCircle size={15} className="ai-spinner" /> : <PlugZap size={15} />} Consultar modelos
          </button>
        </div>
        <label className="ai-consent">
          <input type="checkbox" checked={allowContext} onChange={(event) => setAllowContext(event.target.checked)} disabled={Boolean(busy)} />
          <span>Autorizar contexto operativo opcional
            <small>Los usuarios podrán adjuntar títulos, estados y fechas de hasta 25 tareas, proyectos e incidencias por tipo. No se incluyen notas, correos ni responsables. Los títulos también pueden contener información sensible.</small>
          </span>
        </label>
        <p className="ai-privacy-note"><ShieldNotice /> La clave se guarda cifrada en el servidor y nunca se devuelve al navegador. La prueba envía un mensaje mínimo sin datos de trabajo. El proveedor puede cobrar por el uso de su API; necesitas una clave con saldo y permisos.</p>
        <div className="ai-setup-actions">
          {status.configured && <button type="button" className="button button-outline" onClick={disconnect} disabled={Boolean(busy)}><Unplug size={15} />Desconectar</button>}
          <button type="submit" className="button button-primary" disabled={Boolean(busy)}>
            {busy === 'save' ? <LoaderCircle size={15} className="ai-spinner" /> : <Sparkles size={15} />}
            {busy === 'save' ? 'Verificando conexión…' : 'Probar y activar'}
          </button>
        </div>
        {status.verifiedAt && status.configured && <p className="ai-verification-date">Última verificación: {new Date(status.verifiedAt).toLocaleString('es-ES')} · {status.model}</p>}
      </form>}
    </section>
  )
}

function ShieldNotice() { return <KeyRound size={14} aria-hidden="true" /> }
