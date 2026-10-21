import { t } from '../lib/i18n.js'
import { useState } from 'react'
import { ArrowRight, ShieldAlert, X } from 'lucide-react'
import { useClock } from '../hooks/useClock.js'
import InvitationModal from '../components/InvitationModal.jsx'

function CreateModal({ type, projects, team = [], onClose, onCreate }) {
  const { tomorrowKey } = useClock()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeTeam = Array.isArray(team)
    ? team.filter((person) => person?.status === 'active' && person?.name)
    : []

  const titles = {
    tasks: t("Create a task"),
    projects: t("Create a project"),
    meetings: t("Schedule a meeting"),
    events: t("Plan an event"),
    issues: t("Report an issue"),
  }

  const dateDefault = tomorrowKey

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())

    if (
      ['tasks', 'projects', 'issues'].includes(type) &&
      activeTeam.length === 0
    ) {
      setError('No hay miembros activos en el equipo. Invita a una persona desde Personas y vuelve a intentarlo.')
      setSaving(false)
      return
    }

    if (type === 'meetings') {
      values.attendees = form.getAll('attendees').map(String).filter(Boolean)
    }

    if (type === 'projects') {
      values.budget = Number(values.budget || 0)
      values.progress = 0
      values.color = '#d46e4f'
    }

    if (type === 'events') {
      values.attendees = Number(values.attendees || 0)
    }

    if (type === 'issues') {
      values.impact = Number(values.impact || 0)
    }

    if (type === 'meetings' || type === 'events') {
      const startDate = new Date(values.starts_at)

      if (Number.isNaN(startDate.getTime())) {
        setError('Introduce una fecha y una hora válidas.')
        setSaving(false)
        return
      }

      values.starts_at = startDate.toISOString()
    }

    try {
      await onCreate(type, values)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar el registro.')
      setSaving(false)
    }
  }

  if (type === 'invitations') {
    return <InvitationModal onClose={onClose} onCreate={onCreate} />
  }

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker"> {t("NORTHSTAR WORKSPACE")} </span>
            <h2 id="modal-title">{titles[type]}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="create-form">
          {type === 'tasks' && (
            <>
              <label> {t("Task name")} <input name="title" placeholder={t("e.g. Prepare launch review")} required autoFocus />
              </label>

              <div className="form-two">
                <label> {t("Assignee")} <select
                    name="assignee"
                    defaultValue={activeTeam[0]?.name || ''}
                    required
                    disabled={!activeTeam.length}
                  >
                    {activeTeam.length === 0 ? (
                      <option value=""> {t("No active team members")} </option>
                    ) : (
                      activeTeam.map((person) => (
                        <option key={person.id} value={person.name}>{person.name}</option>
                      ))
                    )}
                  </select>
                  {!activeTeam.length && <small> {t("Invite a teammate from People first.")} </small>}
                </label>

                <label> {t("Priority")} <select name="priority" defaultValue="Medium">
                    <option value="Low"> {t("Low")} </option>
                    <option value="Medium"> {t("Medium")} </option>
                    <option value="High"> {t("High")} </option>
                  </select>
                </label>
              </div>

              <div className="form-two">
                <label> {t("Due date")} <input name="due_date" type="date" defaultValue={dateDefault} required />
                </label>
                <label> {t("Project")} <select name="project_id" defaultValue="">
                    <option value=""> {t("No project")} </option>
                    {projects.map((project) => (
                      <option value={project.id} key={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <input name="status" type="hidden" value="To do" />
            </>
          )}

          {type === 'projects' && (
            <>
              <label> {t("Project name")} <input name="name" placeholder={t("e.g. Customer onboarding refresh")} required autoFocus />
              </label>

              <div className="form-two">
                <label> {t("Project lead")} <select
                    name="owner"
                    defaultValue={activeTeam[0]?.name || ''}
                    required
                    disabled={!activeTeam.length}
                  >
                    {activeTeam.length === 0 ? (
                      <option value=""> {t("No active team members")} </option>
                    ) : (
                      activeTeam.map((person) => (
                        <option key={person.id} value={person.name}>{person.name}</option>
                      ))
                    )}
                  </select>
                </label>

                <label> {t("Due date")} <input name="due_date" type="date" defaultValue={dateDefault} required />
                </label>
              </div>

              <label> {t("Approved budget")} <input name="budget" type="number" min="0" step="100" placeholder="0" />
              </label>
              <input name="status" type="hidden" value="On track" />
            </>
          )}

          {type === 'meetings' && (
            <>
              <label> {t("Meeting title")} <input name="title" placeholder={t("e.g. Weekly product sync")} required autoFocus />
              </label>

              <div className="form-two">
                <label> {t("Date & time")} <input name="starts_at" type="datetime-local" defaultValue={`${dateDefault}T10:00`} required />
                </label>
                <label> {t("Duration")} <select name="duration" defaultValue="30">
                    <option value="30"> {t("30 minutes")} </option>
                    <option value="45"> {t("45 minutes")} </option>
                    <option value="60"> {t("1 hour")} </option>
                  </select>
                </label>
              </div>

              <label> {t("Participants")} <select
                  name="attendees"
                  multiple
                  size={Math.min(Math.max(activeTeam.length, 2), 5)}
                  disabled={!activeTeam.length}
                  className="member-multi-select"
                  aria-describedby="attendees-help"
                >
                  {activeTeam.map((person) => (
                    <option value={person.name} key={person.id}>{person.name}</option>
                  ))}
                </select>
                <small id="attendees-help">
                  {activeTeam.length
                    ? t("Select one or more team members. Use Ctrl (Windows/Linux) or Cmd (Mac) for multiple selections.")
                    : t("No active members to select. Invite teammates from People first.")}
                </small>
              </label>

              <div className="form-two">
                <label> {t("Location")} <input name="location" defaultValue="Google Meet" /></label>
                <label>Agenda<input name="agenda" placeholder={t("Topics to cover")} /></label>
              </div>
            </>
          )}

          {type === 'events' && (
            <>
              <label> {t("Event name")} <input name="title" placeholder={t("e.g. Team offsite")} required autoFocus />
              </label>
              <div className="form-two">
                <label> {t("Date & time")} <input name="starts_at" type="datetime-local" defaultValue={`${dateDefault}T09:00`} required />
                </label>
                <label> {t("Expected attendees")} <input name="attendees" type="number" min="0" defaultValue="0" />
                </label>
              </div>
              <label> {t("Location")} <input name="location" placeholder={t("Venue or online")} defaultValue="TBD" />
              </label>
              <input name="status" type="hidden" value="Planning" />
            </>
          )}

          {type === 'issues' && (
            <>
              <label>
                Issue summary
                <input name="title" placeholder={t("What needs attention?")} required autoFocus />
              </label>
              <label> {t("Description")} <textarea name="description" placeholder={t("Add the relevant context")} rows="3" />
              </label>

              <div className="form-two">
                <label> {t("Category")} <select name="category" defaultValue="Operations">
                    <option value="Operations"> {t("Operations")} </option>
                    <option value="IT & security"> {t("IT & security")} </option>
                    <option value="Finance"> {t("Finance")} </option>
                    <option value="Supply chain"> {t("Supply chain")} </option>
                    <option value="People"> {t("People")} </option>
                  </select>
                </label>
                <label> {t("Severity")} <select name="severity" defaultValue="Medium">
                    <option value="Low"> {t("Low")} </option>
                    <option value="Medium"> {t("Medium")} </option>
                    <option value="High"> {t("High")} </option>
                    <option value="Critical"> {t("Critical")} </option>
                  </select>
                </label>
              </div>

              <div className="form-two">
                <label> {t("Owner")} <select
                    name="owner"
                    defaultValue={activeTeam[0]?.name || ''}
                    required
                    disabled={!activeTeam.length}
                  >
                    {activeTeam.length === 0 ? (
                      <option value=""> {t("No active team members")} </option>
                    ) : (
                      activeTeam.map((person) => (
                        <option key={person.id} value={person.name}>{person.name}</option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  Impacto estimado ($)
                  <input name="impact" type="number" min="0" step="1" defaultValue="0" />
                </label>
              </div>

              <label> {t("Suggested next step")} <input name="recommendation" placeholder={t("Review details with the owner")} />
              </label>
              <input name="status" type="hidden" value="Open" />
            </>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="modal-foot">
            <span><ShieldAlert size={13} /> {t("Changes are recorded in workspace activity.")} </span>
            <div>
              <button type="button" className="button button-quiet" onClick={onClose}> {t("Cancel")} </button>
              <button className="button button-primary" disabled={saving}>
                {saving ? t("Saving…") : titles[type]}
                {!saving && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

export default CreateModal
