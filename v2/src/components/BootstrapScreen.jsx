import { t } from '../lib/i18n.js'
import { ArrowRight, Compass } from 'lucide-react'

function BootstrapScreen({ onSubmit, error, enabled }) {
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Compass size={20} /></span>
          <span className="brand-name">northstar<span>work · v2</span></span>
        </div>
        <span className="form-overline"> {t("INITIAL SETUP")} </span>
        <h1> {t("Create your workspace")} </h1>
        <p className="auth-description"> {t("Set up the company and its first administrator. The admin account will be created only after this form is verified.")} </p>

        {!enabled && (
          <div className="auth-warning" role="status"> {t("Bootstrap is locked. Set a one-time BOOTSTRAP_TOKEN of at least 32 characters in the server environment, then restart the app.")} </div>
        )}

        <form className="auth-form" onSubmit={onSubmit}>
          <label> {t("One-time setup token")} <input name="bootstrapToken" type="password" autoComplete="off" required disabled={!enabled} />
            <small>{t("Read the private bootstrap token file indicated in the server console, or ask your deployment administrator.")}</small>
          </label>
          <label> {t("Company name")} <input name="company" autoComplete="organization" required minLength="2" maxLength="100" disabled={!enabled} />
          </label>
          <label> {t("Administrator name")} <input name="name" autoComplete="name" required minLength="2" maxLength="100" disabled={!enabled} />
          </label>
          <label> {t("Work email")} <input name="email" type="email" autoComplete="email" required disabled={!enabled} />
          </label>
          <label> {t("Create password")} <input name="password" type="password" autoComplete="new-password" minLength="12" required disabled={!enabled} />
            <small> {t("Use at least 12 characters. You will sign in with this password.")} </small>
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="button button-primary login-submit" type="submit" disabled={!enabled}> {t("Create workspace and admin")} <ArrowRight size={16} />
          </button>
        </form>

        <p className="auth-footnote"> {t("This setup link is not public. The operator must provide the one-time token out-of-band.")} </p>
      </section>
    </main>
  )
}

export default BootstrapScreen
