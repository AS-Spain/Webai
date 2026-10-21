import { t } from '../lib/i18n.js'
import { Check, Copy, Users, X } from 'lucide-react'
import { formatDate, initials } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function TeamPage({
  team,
  tasks,
  currentUserId,
  canInvite,
  invitations,
  inviteUrl,
  inviteEmailSent,
  onCopyInvite,
  onRevoke,
  onStatus, demoMode = false,
}) {
  return (
    <div className="team-page">
      <div className="team-intro panel">
        <div>
          <span className="panel-kicker"> {t("PEOPLE & CAPACITY")} </span>
          <h2> {t("Manage your people and their access.")} </h2>
          <p> {demoMode ? 'Perfiles sintéticos compartidos. La demo no crea invitaciones ni cuentas reales y no permite desactivar estos perfiles.' : t("Invitations expire after 48 hours and can only be accepted once.")} </p>
        </div>
        <span className="team-count"><Users size={16} />{team.length} {t("member")} {team.length === 1 ? '' : 's'}</span>
      </div>

      {canInvite && (
        <section className="panel invitation-panel">
          <div className="panel-heading">
            <div><span className="panel-kicker"> {t("ACCESS CONTROL")} </span><h2> {t("Invitations")} </h2></div>
            <span className="record-count">{invitations.length} pendientes</span>
          </div>

          {inviteUrl && (
            <div className="invite-link-box">
              <div>
                <strong>{inviteEmailSent ? 'Invitación enviada por correo' : 'Comparte el enlace de activación'}</strong>
                <small>{inviteEmailSent ? 'La persona puede utilizar el correo o este enlace de un solo uso.' : 'El correo no se ha enviado. Comparte este enlace por un canal seguro.'}</small>
                <input aria-label="Enlace único de activación" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} />
              </div>
              <button className="button button-outline" onClick={onCopyInvite}><Copy size={14} /> {t("Copy link")} </button>
            </div>
          )}

          <div className="invitation-list">
            {invitations.map((invitation) => (
              <div className="invitation-row" key={invitation.id}>
                <span className="invitation-avatar"><Users size={15} /></span>
                <span className="invitation-person">
                  <strong>{invitation.email}</strong>
                  <small>Invitación de {invitation.created_by_name} · Caduca el {formatDate(invitation.expires_at, { month: 'short', day: 'numeric' })}</small>
                </span>
                <span className="role-chip invitation-role">{t(invitation.role)}</span>
                <button className="row-action" title="Revocar invitación" aria-label={`Revocar invitación de ${invitation.email}`} onClick={() => onRevoke(invitation)}>
                  <X size={15} />
                </button>
              </div>
            ))}
            {!invitations.length && (
              <p className="invitation-empty"> {t("No pendientes invitations. Create one to add someone to this workspace.")} </p>
            )}
          </div>
        </section>
      )}

      <div className="team-grid">
        {team.map((person, index) => {
          const assigned = tasks.filter((task) => task.assignee === person.name)
          const open = assigned.filter((task) => task.status !== 'Done').length
          const active = person.status === 'active'

          return (
            <article className={`team-card panel ${!active ? 'team-card-inactive' : ''}`} key={person.id}>
              <div className="team-card-actions">
                <span className={`member-status ${active ? 'member-active' : 'member-inactive'}`}>{active ? 'Activa' : 'Inactiva'}</span>
                {canInvite && person.id !== currentUserId && (
                  <button
                    className={`member-access-button ${active ? 'member-deactivate' : 'member-reactivate'}`}
                    title={active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                    aria-label={`${active ? 'Desactivar' : 'Reactivar'} a ${person.name}`}
                    onClick={() => onStatus(person, active ? 'inactive' : 'active')}
                  >
                    {active ? <X size={14} /> : <Check size={14} />}
                  </button>
                )}
              </div>

              <div className={`team-avatar team-avatar-${index % 3}`}><span>{initials(person.name)}</span><i /></div>
              <div className="team-person-name"><h3>{person.name}</h3><span>{t(person.role)}</span></div>
              <p>{person.email}</p>
              <div className="team-workload"><span> {t("Assigned work")} </span><strong>{open} pendientes</strong></div>
              <div className="workload-meter"><i style={{ width: `${Math.min(open * 24, 90)}%` }} /></div>
              <span className="team-task-caption">
                {assigned.length} tareas asignadas
                {person.deactivated_at ? ` · Desactivada el ${formatDate(person.deactivated_at)}` : ''}
              </span>
            </article>
          )
        })}
        {!team.length && <EmptyState title={t("No team members")} text={t("Invite teammates to begin collaborating.")} />}
      </div>
    </div>
  )
}

export default TeamPage
