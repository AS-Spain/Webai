import { t } from '../lib/i18n.js'
import { ArrowRight, Compass } from 'lucide-react'

function LoginScreen({ onSubmit, error, cookieUnavailable, pending }) {
  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark"><Compass size={20} /></span>
          <span className="brand-name">northstar<span>work · v2</span></span>
        </div>
        <div className="login-story-copy">
          <span className="story-kicker"><i /> {t("YOUR WORK, IN GOOD ORBIT")} </span>
          <h1> {t("Make room")} <br /> {t("for the work")} <br /><em> {t("that matters.")} </em></h1>
          <p> {t("One calm place to align teams, surface blockers, and move your best work forward.")} </p>
        </div>
        <div className="story-bottom">
          <span> {t("BUILT FOR THE EVERYDAY MOMENTUM")} </span>
          <span>01 — 04</span>
        </div>
        <div className="story-orbit orbit-one" />
        <div className="story-orbit orbit-two" />
        <div className="story-sun" />
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={onSubmit}>
          <span className="form-overline"> {t("WELCOME BACK")} </span>
          <h2> {t("Your workspace")} <br /> {t("is waiting.")} </h2>
          <p> {t("Sign in to pick up where your team left off.")} </p>

          <label> {t("Email address")} <input
              name="email"
              type="email"
              defaultValue=""
              autoComplete="username"
              required
            />
          </label>
          <label> {t("Password")} <input
              name="password"
              type="password"
              defaultValue=""
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="button button-primary login-submit" type="submit" disabled={pending}> {pending ? 'Comprobando…' : t("Continue")} <ArrowRight size={16} />
          </button>

          {cookieUnavailable && <div className="session-alternatives">
            <button className="button button-outline" type="submit" name="sessionTransport" value="memory" disabled={pending}>Entrar sin cookies (sesión temporal)</button>
            <p className="auth-footnote">Solo dura en esta página. Si recargas, volverás a introducir tus credenciales.</p>
            <a href={window.location.href} target="_blank" rel="noopener noreferrer">Abrir la aplicación en una pestaña propia</a>
          </div>}

          <div className="login-foot">
            <span> {t("Protected workspace")} </span>
            <span>Northstar Work</span>
          </div>
        </form>
      </section>
    </main>
  )
}

export default LoginScreen
