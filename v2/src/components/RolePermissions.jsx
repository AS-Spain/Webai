import { t } from '../lib/i18n.js'
import { ShieldAlert } from 'lucide-react'

function RolePermissions() {
  const roles = [
    [t("Admin"), 'Acceso completo; administra automatizaciones y configuración.'],
    [t("Manager"), 'Gestiona proyectos y eventos; puede borrar registros operativos.'],
    [t("Member"), 'Crea y actualiza tareas, reuniones e incidencias; no puede borrar.'],
    [t("Viewer"), 'Consulta los datos; no puede crear, modificar ni borrar.'],
  ]

  return (
    <section className="panel settings-section role-permissions">
      <div className="settings-section-head">
        <span className="settings-section-icon"><ShieldAlert size={18} /></span>
        <div><h2> {t("Role permissions")} </h2><p> {t("Permissions are checked by the API as well as the interface.")} </p></div>
      </div>
      <div className="role-permission-list">
        {roles.map(([name, description]) => (
          <div className="role-permission-row" key={name}>
            <strong>{name}</strong><span>{description}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default RolePermissions
