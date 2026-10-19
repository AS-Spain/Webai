import { Compass, Play } from 'lucide-react'

export default function DemoWelcome({ onEnter, error }) {
  return <main className="auth-layout"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Compass size={20} /></span><strong>Northstar · DEMO</strong></div>
    <span className="form-overline">PRUEBA SIN REGISTRO</span>
    <h1>Explora con datos de ejemplo</h1>
    <p className="auth-description">Esta demo está separada de la aplicación normal. Elige un perfil y entra sin correo ni contraseña.</p>
    <div className="demo-entry-profiles">
      {[['admin', 'Administrador'], ['manager', 'Gestor'], ['member', 'Miembro'], ['viewer', 'Solo lectura']].map(([role, label]) => <button className="button button-outline" key={role} onClick={() => onEnter(role)}><Play size={15} />{label}</button>)}
    </div>
    {error && <p className="login-error" role="alert">{error}</p>}
    <p className="auth-footnote">Los datos son compartidos y de prueba. No introduzcas información personal ni claves privadas.</p>
  </section></main>
}
