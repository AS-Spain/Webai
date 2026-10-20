import { t } from '../lib/i18n.js'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleHelp, Plus, ShieldAlert, Sparkles } from 'lucide-react'
import { api } from '../lib/api.js'

function AssistantPage({ workspace, onCreate, onSetup }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asked, setAsked] = useState('')
  const [config, setConfig] = useState(null)
  const [mode, setMode] = useState('rules')
  const [includeContext, setIncludeContext] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [answerInfo, setAnswerInfo] = useState(null)
  const active = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    api('/ai/config', { signal: controller.signal }).then(setConfig).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message)
    })
    return () => { controller.abort(); active.current?.abort() }
  }, [])

  const suggestions = [
    t("What needs attention today?"),
    t("Which projects are at risk?"),
    t("Summarize open issues"),
  ]

  async function ask(value = question) {
    if (!value.trim() || pending) return
    const controller = new AbortController()
    active.current = controller
    setPending(true); setError(''); setAnswer(''); setAnswerInfo(null)
    setAsked(value)
    try {
      const result = await api('/ai/ask', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ question: value, mode, includeContext }),
      })
      if (controller.signal.aborted) return
      setAnswer(result.answer)
      setAnswerInfo(result)
      setQuestion('')
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message)
    } finally { if (!controller.signal.aborted) setPending(false) }
  }

  return (
    <div className="assistant-layout">
      <section className="assistant-main panel">
        <div className="assistant-intro">
          <span className="assistant-orbit-icon"><Sparkles size={20} /></span>
          <span className="panel-kicker"> {mode === 'ai' ? config?.local ? 'ASISTENTE · IA LOCAL' : 'ASISTENTE · IA GENERATIVA' : 'ASISTENTE · REGLAS LOCALES'} </span>
          <h2> {t("Ask a better")} <br /> {t("work question.")} </h2>
          <p> {t("Explore the project, task, and issue data currently loaded in this workspace.")} </p>
        </div>

        {config?.networkEnabled === false && <p className="ai-privacy-note" role="status">La demo pública utiliza reglas locales. El acceso a modelos requiere autorización del operador del servidor.</p>}
        <div className="assistant-mode-controls">
          <fieldset disabled={pending || !config}>
            <legend>Cómo quieres consultar</legend>
            <label><input type="radio" name="assistant-mode" value="rules" checked={mode === 'rules'} onChange={() => { setMode('rules'); setError('') }} /> Reglas locales</label>
            <label><input type="radio" name="assistant-mode" value="ai" checked={mode === 'ai'} disabled={!config?.configured || config?.networkEnabled === false || pending} onChange={() => { setMode('ai'); setError('') }} /> {config?.local ? 'IA local' : 'IA real'} {config?.configured ? `· ${config.model}` : '· sin configurar'}</label>
          </fieldset>
          {mode === 'ai' && <div className="assistant-ai-consent">
            <p>Tu pregunta se enviará a {config?.providers.find((item) => item.id === config.provider)?.name}. {config?.local ? 'Se usa el servidor de modelos configurado por el administrador para todo el espacio.' : 'Puede generar costes de API.'} Revisa la respuesta; la IA puede equivocarse.</p>
            {config?.allowContext ? <label><input type="checkbox" checked={includeContext} disabled={pending} onChange={(event) => setIncludeContext(event.target.checked)} /> Adjuntar una muestra de contexto operativo del espacio (hasta 25 registros por tipo).</label> : <small>Contexto desactivado por el administrador. Solo se enviará tu pregunta.</small>}
          </div>}
        </div>
        <div className="assistant-thread" aria-live="polite">
          {pending && <p role="status" className="ai-pending">Consultando {mode === 'ai' ? 'al proveedor de IA…' : 'las reglas locales…'}</p>}
          {error && <p className="form-error" role="alert">{error} {mode === 'ai' && 'No se ha sustituido la respuesta por reglas sin avisarte.'}</p>}
          {!answer && !pending ? (
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button key={suggestion} disabled={!config || pending} onClick={() => ask(suggestion)}>
                  {suggestion}<ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="user-question">
                <span>{asked}</span><span className="avatar avatar-mini"> {t("ME")} </span>
              </div>
              {answer && <div className="assistant-answer">
                <span className="assistant-answer-icon"><Sparkles size={15} /></span>
                <div>
                  <strong>{answerInfo?.mode === 'ai' ? `${answerInfo.provider} · ${answerInfo.model}` : 'Asistente · reglas locales'}</strong>
                  <p>{answer}</p>
                  {answerInfo?.truncated && <p className="ai-privacy-note" role="status">Respuesta parcial: el proveedor agotó el límite de salida o se recortó el texto. No la interpretes como una respuesta completa; acota la pregunta antes de repetirla.</p>}
                  {answerInfo?.mode === 'ai' && answerInfo.finishReason === 'unknown' && <small>El proveedor no comunicó el motivo de finalización. No se puede confirmar si el texto está completo.</small>}
                  {answerInfo?.usage?.total_tokens !== undefined && <small>Uso comunicado por el proveedor: {answerInfo.usage.total_tokens} tokens. No es un cálculo de coste.</small>}
                  <small> {answerInfo?.mode === 'ai' ? answerInfo.sharedContext ? `${answerInfo.local ? 'IA local' : 'IA generativa'} · muestra operativa limitada. Requiere revisión humana.` : `${answerInfo.local ? 'IA local' : 'IA generativa'} · sin contexto del espacio.` : 'Reglas locales sobre una muestra de hasta 1.000 registros por tipo de tu empresa; sin proveedor externo.'} </small>
                </div>
              </div>}
            </>
          )}
        </div>

        <form
          className="assistant-input"
          onSubmit={(event) => {
            event.preventDefault()
            ask()
          }}
        >
          <input
            value={question}
            maxLength={2000}
            disabled={pending || !config}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("Ask about your projects, tasks, or issues…")}
            aria-label="Pregunta al asistente"
          />
          <button className="icon-button send-button" aria-label="Enviar pregunta" type="submit" disabled={pending || !config || !question.trim()}>
            <ArrowRight size={17} />
          </button>
        </form>
        {pending && <button type="button" className="button button-outline" onClick={() => {
          active.current?.abort(); active.current = null; setPending(false)
          setError('Consulta cancelada. El proveedor puede haber comenzado el procesamiento; cancelarla no garantiza evitar su coste.')
        }}>Cancelar consulta</button>}
      </section>

      <aside className="assistant-side">
        <div className="assistant-notice">
          <span><CircleHelp size={17} /></span>
          <div>
            <strong>{config?.configured ? `IA configurada · ${config.model}` : 'Conecta una IA en un minuto'}</strong>
            <p>{config?.configured ? 'Elige IA real para enviar tu pregunta al proveedor, o reglas locales para no utilizar servicios externos. Ningún modo puede modificar registros.' : 'El administrador conecta Ollama, LM Studio u otra API compatible con OpenAI para todos. No necesitas una cuenta de OpenAI para usar modelos locales. Mientras tanto, utiliza las reglas locales.'}</p>
            <button className="text-action" onClick={onSetup}>{config?.configured ? 'Gestionar conexión' : 'Abrir configuración rápida'}<ArrowRight size={14} /></button>
          </div>
        </div>

        <div className="panel assistant-sources">
          <span className="panel-kicker"> {t("AVAILABLE CONTEXT")} </span>
<h3>Registros disponibles localmente</h3>
          <p className="ai-context-caption">No se envían automáticamente a la IA. Con tu autorización solo se adjunta una muestra de tareas, proyectos e incidencias; nunca reuniones.</p>
          {[
            [t("Projects"), workspace.projects.length],
            [t("Tasks"), workspace.tasks.length],
            [t("Meetings"), workspace.meetings.length],
            [t("Open issues"), workspace.issues.filter((issue) => issue.status !== 'Resolved').length],
          ].map(([label, count]) => (
            <div className="context-source" key={t(label)}>
              <span><i />{t(label)}</span><strong>{count}</strong>
            </div>
          ))}
          <div className="source-foot"><ShieldAlert size={13} /> {t("Responses cannot modify records.")} </div>
        </div>

        <button className="button button-outline assistant-create" onClick={onCreate}>
          <Plus size={15} /> {t("Create a task")} </button>
      </aside>
    </div>
  )
}

export default AssistantPage
