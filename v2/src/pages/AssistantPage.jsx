import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleHelp, Mic, Plus, ShieldAlert, Sparkles, Square, Volume2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAssistantVoice } from '../hooks/useAssistantVoice.js'

function AssistantPage({ workspace, user, demoMode = false, visible = true, onCreate, onSetup, onChange }) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState([])
  const [config, setConfig] = useState(null)
  const [mode, setMode] = useState('rules')
  const [includeContext, setIncludeContext] = useState(false)
  const [includeHistory, setIncludeHistory] = useState(false)
  const [allowTools, setAllowTools] = useState(false)
  const [voiceConsent, setVoiceConsent] = useState(false)
  const [autoRead, setAutoRead] = useState(false)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const active = useRef(null), bottom = useRef(null)
  const voice = useAssistantVoice(setQuestion, visible)
  const demoKey = `webai-demo-conversation:${user?.id || 'anonymous'}`

  useEffect(() => {
    if (!visible || pending || actionBusy) return
    const controller = new AbortController()
    Promise.all([api('/ai/config', { signal: controller.signal }), api('/ai/conversation', { signal: controller.signal })]).then(([status, history]) => {
      if (controller.signal.aborted) return
      setConfig(status)
      let saved = history.turns
      if (demoMode) { try { const local = JSON.parse(sessionStorage.getItem(demoKey) || '[]'); if (Array.isArray(local)) saved = local.filter((turn) => typeof turn.question === 'string' && typeof turn.answer === 'string').slice(-40) } catch { /* Storage can be blocked; history remains in this page only. */ } }
      setTurns(saved)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [demoKey, demoMode, visible, pending, actionBusy, refresh])
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (!visible || pending || actionBusy) return
    const update = () => { if (!document.hidden) setRefresh((value) => value + 1) }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [visible, pending, actionBusy])

  function store(next) {
    const bounded = next.slice(-40)
    setTurns(bounded)
    if (demoMode) { try { sessionStorage.setItem(demoKey, JSON.stringify(bounded)) } catch { /* Do not switch to localStorage if storage is blocked. */ } }
  }
  async function ask(value = question) {
    if (!value.trim() || pending || actionBusy || voice.listening || loading) return
    const controller = new AbortController()
    active.current = controller
    setPending(true); setError('')
    try {
      const result = await api('/ai/ask', { method: 'POST', signal: controller.signal, body: JSON.stringify({ question: value, mode, includeContext: includeContext && config?.allowContext, includeHistory: includeHistory && config?.allowContext, allowTools: mode === 'ai' && allowTools && config?.allowContext && !demoMode && user?.role !== 'viewer' }) })
      if (controller.signal.aborted) return
      store([...turns, { ...result, question: value }])
      setQuestion('')
      if (autoRead) voice.speak(result.answer)
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
    finally { if (!controller.signal.aborted) setPending(false) }
  }
  async function clearHistory() {
    if (!window.confirm('¿Borrar tu historial del asistente y cancelar sus propuestas pendientes? No se borran registros de trabajo.')) return
    setActionBusy('clear'); setError(''); voice.stopSpeaking()
    try { await api('/ai/conversation', { method: 'DELETE' }); store([]) }
    catch (failure) { setError(failure.message) }
    finally { setActionBusy('') }
  }
  async function act(proposal, command) {
    setActionBusy(proposal.id); setError('')
    try {
      const result = await api(`/ai/actions/${encodeURIComponent(proposal.id)}/${command}`, { method: 'POST', body: JSON.stringify(command === 'confirm' ? { confirm: true } : {}) })
      const updated = command === 'confirm' ? result.action : result
      store(turns.map((turn) => ({ ...turn, proposals: turn.proposals?.map((item) => item.id === proposal.id ? updated : item) })))
      if (command === 'confirm') await onChange?.()
    } catch (failure) { setError(failure.message) }
    finally { setActionBusy('') }
  }
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }) }, [turns.length, pending])
  const disabled = pending || loading || !config || Boolean(actionBusy)
  const mayUseTools = !demoMode && user?.role !== 'viewer' && config?.allowContext

  return <div className="assistant-layout">
    <section className="assistant-main panel" aria-label="Conversación con el asistente">
      <div className="assistant-intro">
        <span className="assistant-orbit-icon"><Sparkles size={20} /></span>
        <span className="panel-kicker">ASISTENTE · {mode === 'ai' ? 'IA' : 'REGLAS LOCALES'}</span>
        <h2>Habla de tu trabajo.<br />Revisa antes de cambiarlo.</h2>
        <p>{demoMode ? 'Historial de demo solo en esta pestaña; no se comparte con otros visitantes. Si el navegador bloquea almacenamiento, se pierde al recargar.' : 'Tu historial se guarda en tu cuenta al recibir cada respuesta: vuelve aquí desde cualquier sección o pestaña.'}</p>
        <small>Se conservan los últimos 40 turnos completados. No escribas contraseñas ni claves.</small>
      </div>
      {config?.networkEnabled === false && <p className="ai-privacy-note" role="status">La demo pública utiliza reglas locales. El acceso a modelos requiere autorización del operador.</p>}
      <div className="assistant-mode-controls">
        <fieldset disabled={disabled}>
          <legend>Cómo quieres consultar</legend>
          <label><input type="radio" name="assistant-mode" checked={mode === 'rules'} onChange={() => setMode('rules')} /> Reglas locales</label>
          <label><input type="radio" name="assistant-mode" checked={mode === 'ai'} disabled={!config?.configured || config?.networkEnabled === false} onChange={() => setMode('ai')} /> {config?.local ? 'IA local' : 'IA real'} {config?.configured ? `· ${config.model}` : '· sin configurar'}</label>
        </fieldset>
        {mode === 'ai' && <div className="assistant-ai-consent">
          <p>La consulta se enviará al proveedor configurado por el administrador y puede tener coste.</p>
          <label><input type="checkbox" checked={includeHistory && Boolean(config?.allowContext)} disabled={disabled || demoMode || !config?.allowContext} onChange={(event) => setIncludeHistory(event.target.checked)} /> Enviar últimos mensajes para continuar el contexto (máximo 8 turnos, 12.000 caracteres).</label>
          {config?.allowContext ? <label><input type="checkbox" checked={includeContext} disabled={disabled} onChange={(event) => { setIncludeContext(event.target.checked); if (!event.target.checked) setAllowTools(false) }} /> Adjuntar muestra operativa. Con herramientas incluye IDs y nombres de responsables, reuniones y eventos; nunca notas ni correos.</label> : <small>El administrador no autoriza contexto operativo. Solo se envía tu pregunta; el historial contextual requiere autorización del administrador.</small>}
          {mayUseTools && <label><input type="checkbox" checked={allowTools} disabled={disabled || !includeContext} onChange={(event) => setAllowTools(event.target.checked)} /> Permitir propuestas de cambios (requiere confirmar cada una).</label>}
          <small>Se pueden proponer altas y modificaciones de tareas, proyectos, incidencias, reuniones y eventos según tu rol. No se eliminan registros ni se administran cuentas. El modelo debe admitir llamadas a herramientas.</small>
        </div>}
      </div>
      <div className="assistant-history-heading"><strong>Conversación · {turns.length}/40 turnos</strong><button type="button" className="text-action" disabled={disabled || !turns.length} onClick={clearHistory}>Borrar historial</button></div>
      {loading && <p role="status">Cargando tu conversación…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="assistant-thread assistant-history">
        {!turns.length && !loading && <div className="suggestion-list">{['¿Qué tareas necesitan atención hoy?', '¿Qué proyectos están en riesgo?', 'Resume las incidencias abiertas'].map((suggestion) => <button key={suggestion} disabled={disabled || voice.listening} onClick={() => ask(suggestion)}>{suggestion}<ArrowRight size={14} /></button>)}</div>}
        {turns.map((turn) => <article className="assistant-turn" key={turn.id}>
          <div className="user-question"><span>{turn.question}</span><span className="avatar avatar-mini">YO</span></div>
          <div className="assistant-answer"><Sparkles size={18} aria-hidden="true" /><div>
            <strong>{turn.mode === 'ai' ? `${turn.provider} · ${turn.model}` : 'Reglas locales'}</strong>
            <p>{turn.answer}</p>
            {turn.truncated && <p className="ai-privacy-note" role="status">Respuesta parcial: se agotó el límite del proveedor o se recortó el texto. Acota la pregunta.</p>}
            {turn.mode === 'ai' && turn.finishReason === 'unknown' && <small>El proveedor no comunicó la finalización; el texto puede estar incompleto.</small>}
            {turn.usage?.total_tokens !== undefined && <small>Uso comunicado: {turn.usage.total_tokens} tokens. No es un cálculo de coste.</small>}
            {turn.mode === 'rules' && <small>Muestra de hasta 1.000 registros por tipo; sin proveedor externo.</small>}
            {(turn.proposals || []).map((proposal) => <section className="assistant-proposal" key={proposal.id} aria-label={proposal.label}>
              <strong>{proposal.label} · {proposal.status === 'executed' ? 'Cambio aplicado' : proposal.status === 'canceled' ? 'Cancelada' : proposal.status === 'pending' ? 'Sin ejecutar' : 'Caducada o no disponible'}</strong>
              <p>Revisa los campos exactos. Esta confirmación modifica datos de tu espacio.</p>
              {proposal.recordId && <small>Registro: {proposal.recordId}</small>}
              <dl>{Object.entries(proposal.values).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{proposal.action === 'update' && <span>Antes: {JSON.stringify(proposal.before[field])} → </span>}{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl>
              {proposal.status === 'pending' && <div className="assistant-proposal-actions"><button type="button" className="button button-primary" disabled={disabled} onClick={() => act(proposal, 'confirm')}>Confirmar y aplicar</button><button type="button" className="button button-outline" disabled={disabled} onClick={() => act(proposal, 'cancel')}>Cancelar propuesta</button><small>Caduca a los 10 minutos.</small></div>}
            </section>)}
            <button type="button" className="text-action" onClick={() => voice.speak(turn.answer)} disabled={!voice.canSpeak || voice.listening}><Volume2 size={14} /> Leer respuesta</button>
          </div></div>
        </article>)}
        {pending && <p role="status">Consultando {mode === 'ai' ? 'al proveedor…' : 'las reglas locales…'}</p>}
        <div ref={bottom} />
      </div>
      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); ask() }}>
        <input value={question} maxLength={2000} disabled={disabled} onChange={(event) => setQuestion(event.target.value)} placeholder="Escribe o dicta tu pregunta…" aria-label="Pregunta al asistente" />
        <button className="icon-button send-button" aria-label="Enviar pregunta" type="submit" disabled={disabled || voice.listening || !question.trim()}><ArrowRight size={17} /></button>
      </form>
      {pending && <button type="button" className="button button-outline" onClick={() => { active.current?.abort(); setPending(false); setError('Consulta cancelada. Cancelarla no garantiza evitar el procesamiento o coste del proveedor.') }}>Cancelar consulta</button>}
      <div className="assistant-voice">
        <label>Idioma de voz <select value={voice.language} disabled={voice.listening} onChange={(event) => voice.setLanguage(event.target.value)}><option value="es-ES">Español</option><option value="en-US">English</option><option value="eu-ES">Euskara (si está disponible)</option></select></label>
        <label><input type="checkbox" checked={voiceConsent} disabled={voice.listening} onChange={(event) => setVoiceConsent(event.target.checked)} /> Autorizo el dictado: el navegador puede enviar audio a su servicio de reconocimiento. No garantiza procesamiento local.</label>
        <div className="assistant-proposal-actions"><button type="button" className="button button-outline" disabled={!voice.canListen || !voiceConsent || disabled} onClick={() => voice.listening ? voice.stopListening() : voice.startListening(question)}>{voice.listening ? <Square size={15} /> : <Mic size={15} />}{voice.listening ? 'Detener dictado' : 'Dictar pregunta'}</button>{voice.speaking && <button type="button" className="button button-outline" onClick={voice.stopSpeaking}><Square size={15} />Detener voz</button>}</div>
        <label><input type="checkbox" checked={autoRead} disabled={!voice.canSpeak} onChange={(event) => setAutoRead(event.target.checked)} /> Leer nuevas respuestas automáticamente.</label>
        <small>{voice.canListen ? 'El dictado solo rellena el texto: revísalo y pulsa Enviar. No confirma cambios por voz.' : 'Dictado no disponible: requiere HTTPS, permisos de micrófono y un navegador compatible. Puedes escribir.'} La lectura usa voces del navegador que también pueden ser servicios en línea.</small>
        {voice.listening && <p role="status">Escuchando… Pulsa Detener dictado para revisar el texto.</p>}
        {voice.error && <p role="alert" className="form-error">{voice.error}</p>}
      </div>
    </section>
    <aside className="assistant-side">
      <div className="assistant-notice"><CircleHelp size={18} /><div><strong>{config?.configured ? `IA configurada · ${config.model}` : 'Conecta un modelo de IA'}</strong><p>Solo el administrador configura el proveedor compartido. Los cambios requieren revisión y confirmación; nunca se ejecutan al dictar.</p><button className="text-action" onClick={onSetup}>Gestionar conexión<ArrowRight size={14} /></button></div></div>
      <div className="panel assistant-sources"><h3>Contexto disponible</h3>{[['Proyectos', workspace.projects.length], ['Tareas', workspace.tasks.length], ['Reuniones', workspace.meetings.length], ['Incidencias', workspace.issues.length]].map(([label, count]) => <div className="context-source" key={label}><span>{label}</span><strong>{count}</strong></div>)}<div className="source-foot"><ShieldAlert size={13} />Solo tu usuario puede confirmar sus propuestas. No hay borrados ni acciones externas.</div></div>
      <button className="button button-outline assistant-create" onClick={onCreate}><Plus size={15} />Crear tarea manualmente</button>
    </aside>
  </div>
}
export default AssistantPage
