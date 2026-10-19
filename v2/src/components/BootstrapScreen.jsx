import { t } from '../lib/i18n.js'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Compass, Copy, Eye, EyeOff, ShieldCheck } from 'lucide-react'

function BootstrapScreen({ onSubmit, error, enabled, token, onTokenChange }) {
  const [visible, setVisible] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const tokenInput = useRef(null)
  const [copyRequest, setCopyRequest] = useState(0)
  useEffect(() => {
    if (copyRequest) { tokenInput.current?.focus(); tokenInput.current?.select() }
  }, [copyRequest, visible])
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token)
      setCopyMessage('Token copiado. Pégalo en tu gestor de contraseñas; no se ha guardado automáticamente.')
    } catch {
      setVisible(true)
      setCopyRequest((request) => request + 1)
      setCopyMessage('El navegador no permite copiar automáticamente. El token está seleccionado: usa Copiar y pégalo en tu gestor de contraseñas.')
    }
  }
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
          <section className="bootstrap-token-panel" aria-label="Tu token de configuración">
            <div className="bootstrap-token-heading"><ShieldCheck size={18} /><strong>Tu token de configuración</strong><span>UN SOLO USO</span></div>
            <p>{token.length >= 32 ? 'Tu token ya está cargado. Puedes mostrarlo y copiarlo para guardarlo en tu gestor de contraseñas.' : 'Abre tu enlace privado de instalación para cargarlo aquí. Puedes verlo y copiarlo sin usar la terminal.'}</p>
            <label htmlFor="bootstrap-token">{t("One-time setup token")}</label>
            <input ref={tokenInput} id="bootstrap-token" name="bootstrapToken" type={visible ? 'text' : 'password'} value={token} onChange={(event) => { onTokenChange(event.target.value); setCopyMessage(''); setCopyRequest(0) }} autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={32} required disabled={!enabled} placeholder="Se carga desde tu enlace privado" />
            <div className="bootstrap-token-actions">
              <button type="button" className="button button-secondary" onClick={() => setVisible(!visible)} disabled={!enabled || !token} aria-pressed={visible}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}{visible ? 'Ocultar token' : 'Mostrar token'}</button>
              <button type="button" className="button button-primary" onClick={copyToken} disabled={!enabled || token.length < 32}><Copy size={14} />Copiar token</button>
            </div>
            <p className="bootstrap-token-safety">Guárdalo en tu gestor de contraseñas, no en un documento público. El portapapeles no es un almacén seguro. Este token se invalida al crear el administrador; no sustituye a tu contraseña de acceso.</p>
            {copyMessage && <div className="bootstrap-copy-status" role="status">{copyMessage}</div>}
          </section>
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
