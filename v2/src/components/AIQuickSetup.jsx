import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap, Sparkles, Unplug } from 'lucide-react'
import { api } from '../lib/api.js'

export default function AIQuickSetup({ user }) {
  const [status, setStatus] = useState(null)
  const [provider, setProvider] = useState('ollama')
  const [model, setModel] = useState('qwen2.5:3b')
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434/v1')
  const [apiKey, setApiKey] = useState('')
  const [allowContext, setAllowContext] = useState(false)
  const [models, setModels] = useState([])
  const [busy, setBusy] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = user.role === 'admin'
  const selected = status?.providers.find((item) => item.id === provider)
  const local = Boolean(selected?.local)
  const keyRequired = selected?.keyRequired !== false
  const sameDestination = status?.configured && provider === status.provider && (!local || baseUrl.replace(/\/$/, '') === status.baseUrl)

  useEffect(() => {
    const controller = new AbortController()
    api('/ai/config', { signal: controller.signal }).then((result) => {
      setStatus(result)
      if (result.configured) {
        setProvider(result.provider)
        setModel(result.model)
        setBaseUrl(result.baseUrl)
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
    const profile = status.providers.find((item) => item.id === id)
    setModel(profile.model)
    setBaseUrl(profile.baseUrl)
    setApiKey('')
    setModels([])
    setError('')
    setNotice('')
  }
  async function loadModels() {
    setBusy('models'); setError(''); setNotice('')
    try {
      const result = await api('/ai/models', { method: 'POST', body: JSON.stringify({ provider, apiKey, baseUrl }) })
      setModels(result.models)
      if (local && result.models.length && !result.models.includes(model)) setModel(result.models[0])
      setNotice(result.models.length ? `${result.models.length} modelos disponibles. Elige un modelo de chat compatible; puedes escribir su identificador.` : 'No hay modelos disponibles. Descarga y carga un modelo de chat en tu servidor local y vuelve a consultar.')
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy('') }
  }
  async function activate(event) {
    event.preventDefault()
    setBusy('save'); setError(''); setNotice('')
    try {
      const result = await api('/ai/config', { method: 'PUT', body: JSON.stringify({ provider, model, apiKey, baseUrl, allowContext }) })
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
          <p>Un proveedor compartido para todos. Solo el administrador configura la conexión.</p>
        </div>
        {status && <span className={`ai-connection ${status.configured ? 'ai-connected' : ''}`}>
          <i />{status.configured ? 'Configurada' : 'Sin conectar'}
        </span>}
      </div>
      {status?.demoMode && <p className="ai-privacy-note">Demo pública: solo modelos locales sin claves. Configura las conexiones privadas en la aplicación normal, nunca aquí.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="ai-setup-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {busy === 'loading' && <p role="status">Cargando configuración…</p>}
      {status && !admin && <div className="ai-viewer-note">
        <strong>{status.configured ? `${status.providers.find((item) => item.id === status.provider)?.name} · ${status.model}` : 'Todavía no hay un proveedor de IA conectado.'}</strong>
        <p>Solo un administrador puede configurar o desconectar la IA. El asistente de reglas permanece disponible.</p>
      </div>}
      {status && admin && <form onSubmit={activate} className="ai-setup-form">
        <div className="ai-setup-steps" aria-label="Pasos de configuración">
          <span><b>1</b> Proveedor</span><span><b>2</b> Conexión y modelo</span><span><b>3</b> Probar y activar</span>
        </div>
        <div className="form-two">
          <label>Proveedor
            <select aria-label="Proveedor" value={provider} onChange={changeProvider} disabled={Boolean(busy)}>
              {status.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>{local ? 'Token opcional' : 'Clave API'} <span className="ai-field-hint"><KeyRound size={12} /> Solo servidor</span>
            <input aria-label="Clave API" type="password" name="ai-api-key" autoComplete="off" spellCheck={false}
              value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={Boolean(busy) || status.demoMode}
              required={keyRequired && !sameDestination} maxLength={4096}
              placeholder={sameDestination ? 'Vacío para conservar el token guardado, si existe' : local ? 'Normalmente no se necesita clave en local' : 'Pega tu clave del proveedor'} />
          </label>
        </div>
        {local && <label>URL de la API compatible con OpenAI
          <input aria-label="URL de la API" type="url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setApiKey(''); setModels([]) }} required maxLength={300} disabled={Boolean(busy)} placeholder={selected?.baseUrl} />
          <small className="ai-field-hint">Debe terminar en /v1. Localhost es la máquina donde corre la aplicación, no tu navegador.</small>
        </label>}
        <div className="ai-model-row">
          <label>Modelo de chat
            <input aria-label="Modelo de chat" name="ai-model" list="ai-model-options" value={model} onChange={(event) => setModel(event.target.value)} required maxLength={150} disabled={Boolean(busy)} />
            <datalist id="ai-model-options">{models.map((id) => <option key={id} value={id} />)}</datalist>
          </label>
          <button type="button" className="button button-outline" onClick={loadModels} disabled={Boolean(busy) || (keyRequired && !apiKey && !sameDestination)}>
            {busy === 'models' ? <LoaderCircle size={15} className="ai-spinner" /> : <PlugZap size={15} />} Consultar modelos
          </button>
        </div>
        <label className="ai-consent">
          <input type="checkbox" checked={allowContext} onChange={(event) => setAllowContext(event.target.checked)} disabled={Boolean(busy)} />
          <span>Autorizar contexto operativo opcional
            <small>Los usuarios podrán adjuntar títulos, estados y fechas de hasta 25 tareas, proyectos e incidencias por tipo. No se incluyen notas, correos ni responsables. Los títulos también pueden contener información sensible.</small>
          </span>
        </label>
        <p className="ai-privacy-note"><ShieldNotice /> {local ? 'No necesitas una cuenta de OpenAI ni una clave de pago. La API compatible es solo el formato de conexión. La inferencia se ejecuta en el servidor de modelos indicado, que debe estar instalado y en marcha. Usa un modelo descargado para inferencia local; no configures un backend que reenvíe a la nube si quieres mantener los datos en tu equipo.' : 'La clave se guarda cifrada en el servidor y nunca se devuelve al navegador. El proveedor puede cobrar por el uso de su API; necesitas una clave con saldo y permisos.'} La prueba envía un mensaje mínimo sin datos de trabajo.</p>
        {local && <details className="ai-local-guide" open={!status.configured}>
          <summary>¿Todavía no tienes modelos? Empieza aquí</summary>
          <ol>
            <li>Instala <a href="https://ollama.com/download" target="_blank" rel="noreferrer">Ollama</a> o <a href="https://lmstudio.ai" target="_blank" rel="noreferrer">LM Studio</a> en el equipo donde ejecutarás los modelos.</li>
            <li>Con Ollama, descarga un modelo con <code>ollama pull qwen2.5:3b</code> y arranca el servicio con <code>ollama serve</code> si la aplicación de Ollama no lo ha iniciado ya.</li>
            <li>Con LM Studio, descarga y carga un modelo de chat y activa su servidor local en el puerto 1234.</li>
            <li>Ejecuta también esta aplicación en ese equipo para usar las URLs locales predeterminadas. Después pulsa «Consultar modelos» y «Probar y activar».</li>
          </ol>
          <p>La vista previa de Arena no puede acceder al localhost de tu ordenador. Para otro equipo, puerto o contenedor, el operador debe autorizar el origen en <code>V2_AI_ALLOWED_ORIGINS</code>. No expongas un servidor de modelos sin protección a Internet.</p>
        </details>}
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
