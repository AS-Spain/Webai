import AIQuickSetup from '../components/AIQuickSetup.jsx'
import { t } from '../lib/i18n.js'
import { Compass, LifeBuoy, ShieldAlert, Workflow } from 'lucide-react'

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

      <section className="panel settings-section">
        <div className="settings-section-head">
          <span className="settings-section-icon settings-integration-icon"><Workflow size={18} /></span>
          <div><h2> {t("Connected services")} </h2><p> {t("External services remain disconnected until credentials are configured.")} </p></div>
        </div>
        <div className="integration-list">
          {[
            ['Google Calendar', t("Meetings and availability")],
            ['Microsoft Outlook', t("Calendar and email")],
            ['Slack', t("Notifications and escalations")],
            ['Microsoft Teams', t("Meetings and team alerts")],
          ].map(([name, detail]) => (
            <div className="integration-row" key={name}>
              <span className="integration-monogram">{name === 'Google Calendar' ? 'G' : name === 'Microsoft Outlook' ? 'O' : name === 'Slack' ? 'S' : 'T'}</span>
              <span><strong>{name}</strong><small>{t(detail)}</small></span>
              <span className="integration-disconnected"><i /> {t("Not connected")} </span>
              <button className="button button-outline" disabled title={t("Configure credentials to enable this integration")}> {t("Configure")} </button>
            </div>
          ))}
        </div>
        <div className="settings-security-note">
          <ShieldAlert size={15} /> {t("No external provider is active. Configure OAuth credentials and callback URLs before enabling a connection.")} </div>
      </section>

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
