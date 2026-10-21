import AIQuickSetup from '../components/AIQuickSetup.jsx'
import { t } from '../lib/i18n.js'
import IntegrationsPanel from '../components/IntegrationsPanel.jsx'
import { Compass, LifeBuoy } from 'lucide-react'

function SettingsPage({ company, user }) {
  return (
    <div className="settings-page">
      <AIQuickSetup user={user} />
      <section className="panel settings-section">
        <div className="settings-section-head">
          <span className="settings-section-icon"><Compass size={18} /></span>
          <div><h2> {t("Workspace identity")} </h2><p> {t("Organization and signed-in account details.")} </p></div>
        </div>
        <div className="settings-fields">
          <div><span> {t("COMPANY")} </span><strong>{company}</strong></div>
          <div><span> {t("YOUR ACCOUNT")} </span><strong>{user.name} · {user.email}</strong></div>
          <div><span> {t("ACCESS ROLE")} </span><strong className="role-chip">{t(user.role)}</strong></div>
        </div>
      </section>

      <IntegrationsPanel />

      <section className="panel settings-section">
        <div className="settings-section-head">
          <span className="settings-section-icon"><LifeBuoy size={18} /></span>
          <div><h2> {t("Data & access")} </h2><p> {t("Current environment details.")} </p></div>
        </div>
        <div className="settings-fields">
          <div><span> {t("STORAGE")} </span><strong> {t("SQLite · local persistent database")} </strong></div>
          <div><span> {t("SESSION")} </span><strong> {t("HttpOnly cookie · 8 hour expiry")} </strong></div>
          <div><span> {t("AUDIT LOG")} </span><strong> {t("Workspace activity retained")} </strong></div>
        </div>
      </section>
    </div>
  )
}

/*
 * FORMULARIOS DE CREACIÓN
 *
 * Cambios importantes:
 * - El responsable de tareas procede de los miembros activos.
 * - El responsable del proyecto procede de los miembros activos.
 * - El responsable de la incidencia procede de los miembros activos.
 * - Los asistentes a reuniones se seleccionan entre miembros activos.
 * - No se muestran nombres de ejemplo si no hay miembros disponibles.
 */

export default SettingsPage
