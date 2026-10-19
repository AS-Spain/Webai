import { t } from '../lib/i18n.js'
import { Activity, ArrowRight, Workflow } from 'lucide-react'
import { automationTrigger } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function AutomationsPage({ automations, canManage, onToggle, onRun }) {
  return (
    <>
      <div className="automation-banner">
        <div className="automation-banner-icon"><Workflow size={20} /></div>
        <div>
          <span className="panel-kicker"> {t("RULES, NOT MAGIC")} </span>
          <h2> {t("Helpful workflows, with a human in control.")} </h2>
          <p> {'Las pruebas consultan datos y registran actividad. No envían notificaciones externas ni utilizan IA generativa.'} </p>
        </div>
        <span className="automation-status"><i /> {automations.filter((item) => item.enabled).length} ACTIVAS</span>
      </div>

      <div className="automation-list">
        {automations.map((item, index) => (
          <article className="automation-card panel" key={item.id}>
            <div className={`automation-icon automation-icon-${index}`}><Workflow size={18} /></div>
            <div className="automation-content">
              <div className="automation-title-line">
                <h3>{item.name}</h3>
                <span className={`automation-state ${item.enabled ? 'is-enabled' : ''}`}>
                  {item.enabled ? 'Activa' : 'Pausada'}
                </span>
              </div>
              <p>{item.description}</p>
              <div className="automation-meta">
                <span><span className="automation-node"> {t("WHEN")} </span>{automationTrigger(item.trigger_key)}</span>
                <span><Activity size={13} />{item.runs} ejecuciones</span>
              </div>
            </div>
            <div className="automation-actions">
              <button
                className="button button-outline"
                onClick={() => onRun(item.id)}
                disabled={!canManage || !item.enabled}
                title={canManage ? 'Probar regla' : 'Solo admin puede ejecutar automatizaciones'}
              >
                <span> {t("Test run")} </span><ArrowRight size={14} />
              </button>
              <button
                className={`toggle-switch ${item.enabled ? 'toggle-on' : ''}`}
                role="switch"
                aria-checked={Boolean(item.enabled)}
                aria-label={`${item.enabled ? 'Pausar' : 'Activar'} ${item.name}`}
                onClick={() => onToggle(item)}
                disabled={!canManage}
                title={canManage ? 'Cambiar estado' : 'Solo admin puede cambiar automatizaciones'}
              >
                <span />
              </button>
            </div>
          </article>
        ))}
        {!automations.length && <EmptyState title={t("No rules configured")} text={t("Your automations will appear here.")} />}
      </div>
    </>
  )
}

export default AutomationsPage
