import { t } from '../lib/i18n.js'
import { useState, useEffect } from 'react'
import { Activity, ShieldAlert, X } from 'lucide-react'
import { api } from '../lib/api.js'
import EmptyState from '../components/EmptyState.jsx'

function ActivityDrawer({ onClose }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api('/activities')
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
  }, [])

  return (
    <>
      <button className="drawer-scrim" aria-label="Cerrar actividad" onClick={onClose} />
      <aside className="activity-drawer">
        <div className="drawer-head">
          <div><span className="panel-kicker"> {t("WORKSPACE LOG")} </span><h2> {t("Recent activity")} </h2></div>
          <button className="icon-button" aria-label="Cerrar actividad" onClick={onClose}><X size={17} /></button>
        </div>
        {error && <p className="drawer-error">{error}</p>}
        <div className="drawer-activity-list">
          {items.map((item) => (
            <article className="drawer-activity" key={item.id}>
              <span className="drawer-activity-icon"><Activity size={14} /></span>
              <div>
                <strong>{item.actor || t("Workspace")}</strong>
                <p>{item.summary}</p>
                <time>{new Date(item.created_at).toLocaleString('es-ES')}</time>
                {item.reason && <small>Reason: {item.reason}</small>}
              </div>
            </article>
          ))}
          {!items.length && !error && <EmptyState title={t("No activity yet")} text={t("Workspace changes will be listed here.")} />}
        </div>
        <div className="drawer-foot"><ShieldAlert size={13} /> {t("Activity is scoped to this workspace.")} </div>
      </aside>
    </>
  )
}

export default ActivityDrawer
