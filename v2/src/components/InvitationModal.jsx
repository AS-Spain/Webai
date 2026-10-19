import { t } from '../lib/i18n.js'
import { useState } from 'react'
import { ArrowRight, ShieldAlert, X } from 'lucide-react'

function InvitationModal({ onClose, onCreate }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const form = new FormData(event.currentTarget)

    try {
      await onCreate('invitations', {
        email: form.get('email'),
        role: form.get('role'),
      })
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="create-modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <div className="modal-head">
          <div><span className="panel-kicker"> {t("WORKSPACE ACCESS")} </span><h2 id="invite-title"> {t("Invite a teammate")} </h2></div>
          <button className="icon-button" onClick={onClose} aria-label={t("Close")}><X size={18} /></button>
        </div>

        <form className="create-form" onSubmit={submit}>
          <p className="invite-modal-copy"> {t("The person will receive a single-use activation link that expires in 48 hours. Choose the least privileged role they need.")} </p>
          <label> {t("Work email")} <input name="email" type="email" autoComplete="off" placeholder="name@company.com" required autoFocus /></label>
          <label>
            Role
            <select name="role" defaultValue="member">
              <option value="member"> {t("Member · tasks, meetings, issues")} </option>
              <option value="viewer"> {t("Viewer · read only")} </option>
              <option value="manager"> {t("Manager · projects and team operations")} </option>
              <option value="admin"> {t("Admin · full access and access management")} </option>
            </select>
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="invite-security-note">
            <ShieldAlert size={14} /> The activation URL is shown only once and stored as a hash.
          </div>

          <div className="modal-foot">
            <span> {t("Invitation action is audited.")} </span>
            <div>
              <button type="button" className="button button-quiet" onClick={onClose}> {t("Cancel")} </button>
              <button className="button button-primary" disabled={saving}>
                {saving ? t("Creating…") : t("Create invitation")}
                {!saving && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

export default InvitationModal
