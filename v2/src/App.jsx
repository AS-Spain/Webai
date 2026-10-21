import { t } from './lib/i18n.js'
import { useState, useEffect, useRef } from 'react'
import { ArrowRight, Bell, CheckCircle2, ChevronDown, CircleHelp, Command, Compass, LogOut, Menu, Plus, Search, Settings2, ShieldAlert, Sparkles, Users, X } from 'lucide-react'
import { navGroups, pageMeta, can } from './lib/config.js'
import { formatDate, initials } from './lib/format.js'
import { api, setDemoSession, getDemoRoleHint, getDemoSessionResult, openPublicDemo, confirmPrivateSession, setPrivateSession, hasPrivateMemorySession } from './lib/api.js'
import { useClock } from './hooks/useClock.js'
import { useSearch } from './hooks/useSearch.js'
import { useWorkspace } from './hooks/useWorkspace.js'
import BootstrapScreen from './components/BootstrapScreen.jsx'
import ActivationScreen from './components/ActivationScreen.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import Dashboard from './pages/Dashboard.jsx'
import TasksPage from './pages/TasksPage.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'
import MeetingsPage from './pages/MeetingsPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import IssuesPage from './pages/IssuesPage.jsx'
import AutomationsPage from './pages/AutomationsPage.jsx'
import AssistantPage from './pages/AssistantPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import TeamPage from './pages/TeamPage.jsx'
import RolePermissions from './components/RolePermissions.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import CreateModal from './components/CreateModal.jsx'
import ActivityDrawer from './components/ActivityDrawer.jsx'
import './App.css'

function App() {
  const { todayKey } = useClock()
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState('Northstar Studio')
  const [booting, setBooting] = useState(true)
  const demoEntryPending = useRef(false)
  const [privateTemporary, setPrivateTemporary] = useState(hasPrivateMemorySession)
  const [cookieUnavailable, setCookieUnavailable] = useState(false)
  const [authPending, setAuthPending] = useState(false)
  const [bootstrapToken, setBootstrapToken] = useState('')

  const [inviteToken] = useState(
    () => new URLSearchParams(window.location.search).get('invite') || ''
  )

  const [authMode, setAuthMode] = useState(() => inviteToken ? 'activate' : 'login')
  const [setupStatus, setSetupStatus] = useState(null)
  const [inviteInfo, setInviteInfo] = useState(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteEmailSent, setInviteEmailSent] = useState(false)

  const [page, setPage] = useState('dashboard')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState('')

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('northstar-v2-theme') === 'dark' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('northstar-v2-theme', dark ? 'dark' : 'light') } catch { /* Storage may be disabled. */ }
  }, [dark])
  const { workspace, loading, loadWorkspace, pageInfo, changePage, filter, changeFilter } = useWorkspace(page, user?.role, modal, setError)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    async function initialize() {
      try {
        const status = await api('/setup/status', { signal })
        if (signal.aborted) return
        setSetupStatus(status)
        if (status.demoMode || !status.needsSetup || inviteToken) setBootstrapToken('')
        document.title = status.demoMode ? 'Northstar v2 · DEMO' : 'Northstar v2 · Aplicación normal'
        if (status.demoMode) {
          if (hasPrivateMemorySession()) setPrivateSession(null)
          setPrivateTemporary(false)
          let result = getDemoSessionResult()
          if (!result || result.sessionToken) result = await openPublicDemo(getDemoRoleHint() || result?.user.role || 'admin')
          if (!signal.aborted) { setUser(result.user); setCompany(result.company) }
          return
        }
        if (inviteToken) {
          setDemoSession(null)
          const info = await api(`/invitations/validate?token=${encodeURIComponent(inviteToken)}`, { signal })
          setInviteInfo(info)
        } else if (status.needsSetup) {
          setDemoSession(null)
          setAuthMode('bootstrap')
        } else {
          setDemoSession(null)
          const result = await api('/auth/me', { signal })
          setUser(result.user)
          setCompany(result.company)
        }
      } catch (requestError) {
        if (!signal.aborted && requestError.status !== 401) setError(requestError.message)
      } finally { if (!signal.aborted) setBooting(false) }
    }
    initialize()
    return () => controller.abort()
  }, [inviteToken])

  useEffect(() => {
    const expired = (event) => {
      setDemoSession(null)
      setPrivateSession(null)
      setPrivateTemporary(false)
      setUser(null)
      setModal('')
      setActivityOpen(false)
      setInviteUrl('')
      setSearch('')
      setAuthMode('login')
      setError(event.detail || 'Tu sesión ha caducado. Inicia sesión de nuevo.')
    }
    window.addEventListener('northstar:session-expired', expired)
    return () => window.removeEventListener('northstar:session-expired', expired)
  }, [])

  async function enterDemo(role = 'admin') {
    if (demoEntryPending.current) return
    demoEntryPending.current = true
    setBooting(true)
    setError('')
    try {
      const result = await openPublicDemo(role)
      setModal('')
      setActivityOpen(false)
      setSearch('')
      setInviteUrl('')
      setPage('dashboard')
      setUser(result.user)
      setCompany(result.company)
    } catch (requestError) { setError(requestError.message) }
    finally { demoEntryPending.current = false; setBooting(false) }
  }

  useEffect(() => {
    if (!toast) return undefined

    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function signIn(event) {
    event.preventDefault()
    if (authPending) return
    const transport = event.nativeEvent.submitter?.value === 'memory' ? 'memory' : 'cookie'
    setError('')
    setAuthPending(true)
    setPrivateSession(null)

    try {
      const form = new FormData(event.currentTarget)

      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          sessionTransport: transport,
        }),
      })

      if (result.sessionTransport === 'memory') setPrivateSession(result)
      const verified = await confirmPrivateSession(result.user.id)
      setPrivateTemporary(hasPrivateMemorySession())
      setCookieUnavailable(false)
      setUser(verified.user)
      setAuthMode('login')
      setCompany(verified.company)

    } catch (requestError) {
      setPrivateSession(null)
      if (requestError.code === 'COOKIE_UNCONFIRMED') setCookieUnavailable(true)
      setError(requestError.message)
    } finally { setAuthPending(false) }
  }

  async function bootstrapWorkspace(event) {
    event.preventDefault()
    setError('')

    const form = new FormData(event.currentTarget)

    try {
      const result = await api('/setup/bootstrap', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      })

      setBootstrapToken('')
      setSetupStatus((status) => ({ ...status, needsSetup: false, bootstrapEnabled: false }))
      setAuthMode('login')
      const verified = await confirmPrivateSession(result.user.id)
      setUser(verified.user)
      setCompany(verified.company)
    } catch (requestError) {
      if (requestError.code === 'COOKIE_UNCONFIRMED') setCookieUnavailable(true)
      setError(requestError.message)
    }
  }

  async function activateInvitation(event) {
    event.preventDefault()
    setError('')

    const form = new FormData(event.currentTarget)

    try {
      const result = await api('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          name: form.get('name'),
          password: form.get('password'),
        }),
      })

      window.history.replaceState({}, '', window.location.pathname)
      setAuthMode('login')
      const verified = await confirmPrivateSession(result.user.id)
      setUser(verified.user)
      setCompany(verified.company)

    } catch (requestError) {
      if (requestError.code === 'COOKIE_UNCONFIRMED') setCookieUnavailable(true)
      setError(requestError.message)
    }
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setDemoSession(null)
    setPrivateSession(null)
    setPrivateTemporary(false)
    setCookieUnavailable(false)
    setUser(null)
    setAuthMode('login')
    setInviteUrl('')
    setSearch('')
    setModal('')
    setActivityOpen(false)
    setPage('dashboard')
  }

  async function createRecord(resource, values) {
    const result = await api(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(values),
    })

    if (resource === 'invitations') {
      setInviteUrl(result.activationUrl || '')
      setInviteEmailSent(result.emailSent)
    }

    setModal('')

    setToast(
      resource === 'invitations'
        ? result.emailSent
          ? 'Invitación creada y enviada.'
          : 'Invitación creada. Copia el enlace para compartirlo.'
        : 'Cambios guardados en el espacio de trabajo.'
    )

    await loadWorkspace()
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setToast('Enlace de activación copiado.')
    } catch {
      setError('No se pudo acceder al portapapeles. Selecciona y copia el enlace manualmente.')
    }
  }

  async function revokeInvitation(invitation) {
    if (!window.confirm(`¿Revocar la invitación de ${invitation.email}?`)) return

    try {
      await api(`/invitations/${invitation.id}`, { method: 'DELETE' })
      setToast('Invitación revocada.')
      await loadWorkspace()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateUserStatus(person, status) {
    const disabling = status === 'inactive'

    const message = disabling
      ? `¿Desactivar a ${person.name}? Perderá acceso de inmediato; sus sesiones se cerrarán y su historial se conservará.`
      : `¿Reactivar a ${person.name}? Podrá volver a iniciar sesión con su contraseña actual.`

    if (!window.confirm(message)) return

    try {
      await api(`/users/${person.id}/${disabling ? 'deactivate' : 'reactivate'}`, {
        method: 'POST',
        body: '{}',
      })

      setToast(
        disabling
          ? `Acceso de ${person.name} desactivado.`
          : `Acceso de ${person.name} reactivado.`
      )

      await loadWorkspace()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateRecord(resource, id, values) {
    try {
      await api(`/${resource}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      })

      setToast('Actualización guardada y registrada en la actividad.')
      await loadWorkspace()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteRecord(resource, record) {
    const message = resource === 'projects'
      ? `¿Eliminar el proyecto "${record.name}"? Sus tareas se conservarán sin proyecto y quedará constancia en la actividad.`
      : `¿Eliminar "${record.title}"? Esta acción no se puede deshacer.`

    if (!window.confirm(message)) return

    try {
      await api(`/${resource}/${record.id}`, { method: 'DELETE' })

      setToast(
        resource === 'projects'
          ? 'Proyecto eliminado; las tareas se han conservado.'
          : 'Registro eliminado.'
      )

      await loadWorkspace()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function runAutomation(id) {
    try {
      const result = await api(`/automations/${id}/run`, {
        method: 'POST',
        body: '{}',
      })

      setToast(result.summary)
      await loadWorkspace()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const { results: searchResults, searching, searchError } = useSearch(search, Boolean(user))

  if (booting) {
    return (
      <div className="boot-screen">
        <span className="brand-mark"><Compass size={20} /></span>
        <span>Abriendo tu espacio de trabajo…</span>
      </div>
    )
  }

  if (!setupStatus) return (
    <main className="auth-layout"><section className="auth-card">
      <h1>No se pudo conectar con Northstar</h1>
      <p className="auth-description">El servidor todavía no está disponible. No se ha cerrado tu sesión ni cambiado de modo.</p>
      <p className="login-error" role="alert">{error || 'Comprueba que la API esté en marcha y vuelve a intentarlo.'}</p>
      <button className="button button-primary" onClick={() => window.location.reload()}>Reintentar conexión</button>
    </section></main>
  )

  if (!user && setupStatus?.demoMode) return <main className="auth-layout"><section className="auth-card">
    <h1>No se pudo abrir la demo</h1>
    <p className="auth-description">La demo es pública y no requiere iniciar sesión.</p>
    <p className="login-error" role="alert">{error || 'Comprueba que la API demo esté disponible.'}</p>
    <button className="button button-primary" onClick={() => enterDemo(getDemoRoleHint() || 'admin')}>Reintentar demo</button>
  </section></main>

  if (!user && authMode === 'bootstrap') {
    return (
      <BootstrapScreen
        onSubmit={bootstrapWorkspace}
        error={error}
        enabled={setupStatus?.bootstrapEnabled}
        token={bootstrapToken}
        onTokenChange={setBootstrapToken}
      />
    )
  }

  if (!user && authMode === 'activate') {
    return (
      <ActivationScreen
        onSubmit={activateInvitation}
        error={error}
        invite={inviteInfo}
        onBack={() => {
          window.history.replaceState({}, '', window.location.pathname)
          setAuthMode('login')
          setError('')
        }}
      />
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onSubmit={signIn}
        error={error}
        cookieUnavailable={cookieUnavailable}
        pending={authPending}
      />
    )
  }

  const ProfileTag = setupStatus?.demoMode ? 'div' : 'button'
  const meta = pageMeta[page] || pageMeta.dashboard
  const createTarget = page === 'dashboard'
    ? 'tasks'
    : page === 'team'
      ? 'invitations'
      : page

  const canCreateCurrent = createTarget === 'invitations'
    ? !setupStatus?.demoMode && can(user.role, 'users:manage')
    : can(user.role, `${createTarget}:create`)

  const canManageProjects = can(user.role, 'projects:delete')

  const createLabel = page === 'dashboard'
    ? t("Create task")
    : page === 'team'
      ? t("Invite person")
      : ({ tasks: 'Nueva tarea', projects: 'Nuevo proyecto', meetings: 'Nueva reunión', events: 'Nuevo evento', issues: 'Nueva incidencia' })[page]

  return (
    <div className={`app-shell ${dark ? 'theme-dark' : ''}`}>
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobileNav(false)}
        />
      )}

      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <button
          className="brand-lockup"
          onClick={() => setPage('dashboard')}
          aria-label="Ir al panel"
        >
          <span className="brand-mark"><Compass size={20} strokeWidth={2.1} /></span>
          <span className="brand-name">northstar<span>work · v2</span></span>
        </button>

        <button
          className="workspace-switcher"
          onClick={() => setToast(`${company} · espacio activo`)}
        >
          <span className="workspace-monogram">N</span>
          <span className="workspace-copy">
            <strong>{company}</strong>
            <small> {t("Workspace")} </small>
          </span>
          <ChevronDown size={15} />
        </button>

        <nav className="primary-nav" aria-label="Navegación principal">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map(({ id, label, icon: Icon, badge }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? 'active' : ''}`}
                  onClick={() => {
                    setPage(id)
                    setMobileNav(false)
                  }}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{t(label)}</span>
                  {badge === 'critical' && workspace.overview?.counts.critical > 0 && (
                    <i
                      className="nav-dot"
                      aria-label={`${workspace.overview.counts.critical} críticas`}
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <button
          className={`nav-item ${page === 'team' ? 'active' : ''}`}
          onClick={() => setPage('team')}
        >
          <Users size={17} /><span> {t("People")} </span>
        </button>

        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          <Settings2 size={17} /><span> {t("Settings")} </span>
        </button>

        <div className="sidebar-bottom">
          <div className="plan-note">
            <span className="plan-icon"><Sparkles size={14} /></span>
            <div>
              <strong> {t("Operations, in sync")} </strong>
              <small> {t("Workspace health")} <b> {t("Good")} </b></small>
            </div>
          </div>

          <ProfileTag className="profile-button" onClick={setupStatus.demoMode ? undefined : signOut} title={setupStatus.demoMode ? 'Perfil de ejemplo' : 'Cerrar sesión'}>
            <span className="avatar avatar-coral">{initials(user.name)}</span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{t(user.role)}</small>
            </span>
            {!setupStatus.demoMode && <LogOut size={15} />}
          </ProfileTag>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            title="Abrir navegación"
            aria-label="Abrir navegación"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={19} />
          </button>

          <div className="breadcrumbs">
            <span>{company}</span>
            <span className="crumb-slash">/</span>
            <strong>{meta[0]}</strong>
          </div>

          <div className="topbar-tools">
            <div className={`search-wrap ${searchOpen ? 'search-active' : ''}`}>
              <Search size={16} />
              <input
                value={search}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearch('')
                    setSearchOpen(false)
                  }
                }}
                placeholder="Buscar en el espacio…"
                aria-label="Buscar en el espacio de trabajo"
              />
              <kbd><Command size={11} /> K</kbd>

              {searchOpen && search && (
                <div className="search-popover">
                  {searchResults.length ? searchResults.map((result) => (
                    <button
                      key={`${result.resource}-${result.id}`}
                      onClick={() => {
                        setPage(result.resource)
                        setSearch('')
                        setSearchOpen(false)
                      }}
                    >
                      <span className="search-result-icon"><Search size={14} /></span>
                      <span>
                        <strong>{result.title || result.name}</strong>
                        <small>{result.label}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  )) : <p>{searching ? 'Buscando…' : searchError || 'No hay coincidencias.'}</p>}
                </div>
              )}
            </div>

            <button
              className="icon-button theme-button"
              title={dark ? 'Usar tema claro' : 'Usar tema oscuro'}
              aria-label={dark ? 'Usar tema claro' : 'Usar tema oscuro'}
              onClick={() => setDark(!dark)}
            >
              <span className="theme-glyph">{dark ? '☼' : '◐'}</span>
            </button>

            <button
              className={`icon-button notification-button ${activityOpen ? 'selected' : ''}`}
              title="Ver actividad reciente"
              aria-label="Ver actividad reciente"
              onClick={() => setActivityOpen(!activityOpen)}
            >
              <Bell size={17} /><i />
            </button>

            <button className="avatar avatar-coral top-avatar" title={user.name}>
              {initials(user.name)}
            </button>
          </div>
        </header>

        {privateTemporary && !setupStatus?.demoMode && <div className="demo-banner" role="status"><span><strong>Sesión temporal sin cookies.</strong> Al recargar o cerrar esta pestaña tendrás que iniciar sesión de nuevo. No se guarda tu contraseña ni el token.</span></div>}
      {setupStatus?.demoMode && <div className="demo-banner" role="region" aria-label="Entorno de demostración">
          <span><strong>DEMO · Datos de ejemplo</strong> Separada de la web normal. No introduzcas datos reales ni claves.</span>
          <label>Perfil de prueba
            <select aria-label="Perfil de prueba" value={user.role} onChange={(event) => enterDemo(event.target.value)}>
              <option value="admin">Administrador</option><option value="manager">Gestor</option><option value="member">Miembro</option><option value="viewer">Solo lectura</option>
            </select>
          </label>
        </div>}
        <div
          className="content-scroll"
          onClick={() => searchOpen && setSearchOpen(false)}
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> {t("OPERATIONS CENTER")} <span className="eyebrow-divider">/</span>
                {formatDate(todayKey, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <h1>{meta[0]}</h1>
              <p>{meta[1]}</p>
            </div>

            {canCreateCurrent && (
              <button
                className="button button-primary"
                onClick={() => setModal(createTarget)}
              >
                <Plus size={16} />{createLabel}
              </button>
            )}
          </div>

          {error && (
            <div className="inline-error" role="alert">
              <CircleHelp size={16} />{error}
              <button onClick={() => setError('')} aria-label="Cerrar aviso">
                <X size={15} />
              </button>
            </div>
          )}

          {loading && <div className="loading-line"><span /> {t("Syncing workspace data…")} </div>}

          {page === 'dashboard' && (
            <Dashboard
              workspace={workspace}
              onNavigate={setPage}
              onCreate={() => setModal('tasks')}
            />
          )}

          {page === 'tasks' && (
            <TasksPage
              filter={filter}
              onFilterChange={changeFilter}
              tasks={workspace.tasks}
              projects={workspace.projects}
              canUpdate={can(user.role, 'tasks:update')}
              canDelete={can(user.role, 'tasks:delete')}
              onStatus={(task, status) => updateRecord('tasks', task.id, { status })}
              onDelete={(task) => deleteRecord('tasks', task)}
            />
          )}

          {page === 'projects' && (
            <ProjectsPage
              projects={workspace.projects}
              tasks={workspace.tasks}
              canManage={canManageProjects}
              onStatus={(project, status) => updateRecord('projects', project.id, { status })}
              onDelete={(project) => deleteRecord('projects', project)}
            />
          )}

          {page === 'meetings' && (
            <MeetingsPage
              meetings={workspace.meetings}
              canDelete={can(user.role, 'meetings:delete')}
              onDelete={(meeting) => deleteRecord('meetings', meeting)}
            />
          )}

          {page === 'events' && (
            <EventsPage
              events={workspace.events}
              canDelete={can(user.role, 'events:delete')}
              onDelete={(event) => deleteRecord('events', event)}
            />
          )}

          {page === 'calendar' && (
            <CalendarPage
              meetings={workspace.meetings}
              events={workspace.events}
              tasks={workspace.tasks}
            />
          )}

          {page === 'issues' && (
            <IssuesPage
              filter={filter}
              onFilterChange={changeFilter}
              summary={pageInfo?.summary}
              issues={workspace.issues}
              canUpdate={can(user.role, 'issues:update')}
              onStatus={(issue, status) => updateRecord('issues', issue.id, {
                status,
                reason: `Estado actualizado a ${status}`,
              })}
            />
          )}

          {page === 'automations' && (
            <AutomationsPage
              automations={workspace.automations}
              canManage={can(user.role, 'automations:manage')}
              onToggle={(item) => updateRecord('automations', item.id, {
                enabled: !item.enabled,
              })}
              onRun={runAutomation}
            />
          )}

          <div hidden={page !== 'assistant'}>
            <AssistantPage
              visible={page === 'assistant'}
              key={`${user.id}:${setupStatus?.demoMode ? 'demo' : 'private'}`}
              user={user}
              demoMode={setupStatus?.demoMode}
              onChange={loadWorkspace}
              onSetup={() => setPage('settings')}
              workspace={workspace}
              onCreate={() => setModal('tasks')}
            />
          </div>

          {page === 'reports' && <ReportsPage workspace={workspace} />}

          {page === 'team' && (
            <TeamPage
              team={workspace.team}
              tasks={workspace.tasks}
              currentUserId={user.id}
              canInvite={!setupStatus?.demoMode && can(user.role, 'users:manage')}
              demoMode={setupStatus?.demoMode}
              invitations={workspace.invitations}
              inviteUrl={inviteUrl}
              inviteEmailSent={inviteEmailSent}
              onCopyInvite={copyInviteLink}
              onRevoke={revokeInvitation}
              onStatus={updateUserStatus}
            />
          )}

          {page === 'settings' && (
            <>
              <SettingsPage company={company} user={user} />
              <RolePermissions />
            </>
          )}

          {pageInfo && (
            <nav className="pagination" aria-label="Paginación de registros">
              <span>{pageInfo.total} registros · Página {pageInfo.page} de {Math.max(1, pageInfo.totalPages)}</span>
              <button className="button button-outline" disabled={loading || pageInfo.page <= 1} onClick={() => changePage(pageInfo.page - 1)}>Anterior</button>
              <button className="button button-outline" disabled={loading || pageInfo.page >= pageInfo.totalPages} onClick={() => changePage(pageInfo.page + 1)}>Siguiente</button>
            </nav>
          )}
          <footer className="page-footer">
            <span><ShieldAlert size={13} /> Datos de {company}</span>
            <span> {t("Last synced just now")} <i className="sync-dot" /></span>
          </footer>
        </div>
      </main>

      {activityOpen && <ActivityDrawer onClose={() => setActivityOpen(false)} />}

      {modal && (
        <CreateModal
          type={modal}
          projects={workspace.projects}
          team={workspace.team}
          onClose={() => setModal('')}
          onCreate={createRecord}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />{toast}
          <button aria-label="Cerrar" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

export default App
