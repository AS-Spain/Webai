import { t } from '../lib/i18n.js'
import { ArrowRight, Compass } from 'lucide-react'

function ActivationScreen({ onSubmit, error, invite, onBack }) {
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Compass size={20} /></span>
          <span className="brand-name">northstar<span>work · v2</span></span>
        </div>

        <span className="form-overline"> {t("TEAM INVITATION")} </span>
        <h1> {t("Activate your account")} </h1>

        {invite ? (
          <>
            <p className="auth-description"> {t("You were invited to")} <strong>{invite.company}</strong> {t("as")} <strong>{t(invite.role)}</strong>.
            </p>

            <form className="auth-form" onSubmit={onSubmit}>
              <label> {t("Invited email")} <input value={invite.email} readOnly aria-readonly="true" />
              </label>
              <label> {t("Your name")} <input name="name" autoComplete="name" required minLength="2" maxLength="100" />
              </label>
              <label> {t("Create password")} <input name="password" type="password" autoComplete="new-password" required minLength="12" />
                <small> {t("At least 12 characters. This invitation can only be used once.")} </small>
              </label>

              {error && <div className="login-error" role="alert">{error}</div>}

              <button className="button button-primary login-submit" type="submit"> {t("Activate account")} <ArrowRight size={16} />
              </button>
            </form>

            <p className="auth-footnote"> {t("Invitation expires")} {new Date(invite.expiresAt).toLocaleString('es-ES')}.
            </p>
          </>
        ) : (
          <>
            <p className="auth-description"> {t("This invitation is invalid, expired, or has already been used.")} </p>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="button button-outline auth-back" onClick={onBack}> {t("Back to sign in")} </button>
          </>
        )}
      </section>
    </main>
  )
}

export default ActivationScreen
