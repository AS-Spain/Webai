      import { useEffect, useMemo, useState } from 'react'
      import {
        Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
        CheckCircle2, ChevronDown, CircleHelp, Clock3, Command, Compass, FileBarChart2,
        Flag, FolderKanban, LayoutDashboard, LifeBuoy, ListTodo, LogOut, Menu,
        Copy, MoreHorizontal, Plus, Search, Settings2, ShieldAlert, Sparkles, Trash2, Users,
        Workflow, X,
      } from 'lucide-react'
      import './App.css'

      const navGroups = [
        { label: 'WORKSPACE', items: [
          { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
          { id: 'meetings', label: 'Meetings', icon: Users },
          { id: 'events', label: 'Events', icon: Flag },
        ] },
        { label: 'DELIVERY', items: [
          { id: 'tasks', label: 'Tasks', icon: ListTodo },
          { id: 'projects', label: 'Projects', icon: FolderKanban },
          { id: 'issues', label: 'Issues', icon: ShieldAlert, badge: 'critical' },
        ] },
        { label: 'INTELLIGENCE', items: [
          { id: 'automations', label: 'Automations', icon: Workflow },
          { id: 'assistant', label: 'AI assistant', icon: Sparkles },
          { id: 'reports', label: 'Reports', icon: FileBarChart2 },
        ] },
      ]

      const rolePermissions = {
        admin: new Set(['projects:create', 'projects:update', 'projects:delete', 'tasks:create', 'tasks:update', 'tasks:delete', 'meetings:create', 'meetings:update', 'meetings:delete', 'events:create', 'events:update', 'events:delete', 'issues:create', 'issues:update', 'automations:manage', 'users:manage']),
        manager: new Set(['projects:create', 'projects:update', 'projects:delete', 'tasks:create', 'tasks:update', 'tasks:delete', 'meetings:create', 'meetings:update', 'meetings:delete', 'events:create', 'events:update', 'events:delete', 'issues:create', 'issues:update']),
        member: new Set(['tasks:create', 'tasks:update', 'meetings:create', 'meetings:update', 'issues:create', 'issues:update']),
        viewer: new Set(),
      }

      function can(role, permission) {
        return rolePermissions[role]?.has(permission) || false
      }

      const pageMeta = {
        dashboard: ['Good morning', 'Here is what needs your attention today.'],
        calendar: ['Calendar', 'A clear view of the work ahead.'],
        meetings: ['Meetings', 'Conversations, decisions, and next steps.'],
        events: ['Events', 'Plan the moments that bring your teams together.'],
        tasks: ['Tasks', 'Keep the important work moving.'],
        projects: ['Projects', 'A live view of your team’s priorities.'],
        issues: ['Issues & incidents', 'Surface blockers early and keep a clear owner.'],
        automations: ['Automations', 'Small rules that keep work flowing.'],
        assistant: ['AI assistant', 'Ask a question about the work in your workspace.'],
        reports: ['Reports', 'A measured view of progress and operational health.'],
        team: ['Your team', 'People, responsibilities, and access.'],
        settings: ['Workspace settings', 'Manage your workspace and connected services.'],
      }

      const demoEmail = 'olivia@northstar.io'
      const demoPassword = 'Northstar2026!'
      const initialState = { projects: [], tasks: [], meetings: [], issues: [], events: [], automations: [], team: [], invitations: [], overview: null }
      const referenceDate = new Date()
      const todayKey = referenceDate.toISOString().slice(0, 10)
      const currentTime = referenceDate.getTime()
      const tomorrowKey = new Date(currentTime + 86400000).toISOString().slice(0, 10)
      const calendarDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(referenceDate)
        date.setDate(referenceDate.getDate() + index)
        return date
      })

      async function api(path, options = {}) {
        const response = await fetch(`/api${path}`, {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...options.headers },
          ...options,
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || 'No se pudo completar la solicitud.')
        }
        if (response.status === 204) return null
        return response.json()
      }

      function formatDate(value, options = { month: 'short', day: 'numeric' }) {
        if (!value) return 'Sin fecha'
        const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
        return new Intl.DateTimeFormat('es-ES', options).format(date)
      }

      function initials(name = '') {
        return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
      }

      function App() {
        const [user, setUser] = useState(null)
        const [company, setCompany] = useState('Northstar Studio')
        const [booting, setBooting] = useState(true)
        const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') || '')
        const [authMode, setAuthMode] = useState(() => inviteToken ? 'activate' : 'login')
        const [setupStatus, setSetupStatus] = useState(null)
        const [inviteInfo, setInviteInfo] = useState(null)
        const [inviteUrl, setInviteUrl] = useState('')
        const [inviteEmailSent, setInviteEmailSent] = useState(false)
        const [page, setPage] = useState('dashboard')
        const [workspace, setWorkspace] = useState(initialState)
        const [loading, setLoading] = useState(false)
        const [error, setError] = useState('')
        const [toast, setToast] = useState('')
        const [modal, setModal] = useState('')
        const [search, setSearch] = useState('')
        const [searchOpen, setSearchOpen] = useState(false)
        const [activityOpen, setActivityOpen] = useState(false)
        const [mobileNav, setMobileNav] = useState(false)
        const [dark, setDark] = useState(false)

        useEffect(() => {
          if (inviteToken) {
            api(`/invitations/validate?token=${encodeURIComponent(inviteToken)}`)
              .then(setInviteInfo)
              .catch((requestError) => setError(requestError.message))
              .finally(() => setBooting(false))
            return
          }
          api('/setup/status').then((status) => {
            setSetupStatus(status)
            if (status.needsSetup) {
              setAuthMode('bootstrap')
              return
            }
            return api('/auth/me').then((result) => {
              setUser(result.user)
              setCompany(result.company)
              loadWorkspace(result.user.role)
            })
          }).catch(() => {}).finally(() => setBooting(false))
        }, [inviteToken])

        async function refreshWorkspace(role = user?.role) {
          try {
            const invitationsRequest = role === 'admin' ? api('/invitations') : Promise.resolve([])
            const [overview, projects, tasks, meetings, issues, events, automations, team, invitations] = await Promise.all([
              api('/overview'), api('/projects'), api('/tasks'), api('/meetings'), api('/issues'),
              api('/events'), api('/automations'), api('/team'), invitationsRequest,
            ])
            setWorkspace({ overview, projects, tasks, meetings, issues, events, automations, team, invitations })
            setError('')
          } catch (requestError) {
            setError(requestError.message)
          } finally {
            setLoading(false)
          }
        }

        function loadWorkspace(role = user?.role) {
          setLoading(true)
          return refreshWorkspace(role)
        }

        useEffect(() => {
          if (!toast) return undefined
          const timer = window.setTimeout(() => setToast(''), 3200)
          return () => window.clearTimeout(timer)
        }, [toast])

        async function signIn(event) {
          event.preventDefault()
          setError('')
          try {
            const form = new FormData(event.currentTarget)
            const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
            setUser(result.user)
            setCompany(result.company)
            await loadWorkspace(result.user.role)
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        async function bootstrapWorkspace(event) {
          event.preventDefault()
          setError('')
          const form = new FormData(event.currentTarget)
          try {
            const result = await api('/setup/bootstrap', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) })
            setUser(result.user)
            setCompany(result.company)
            await loadWorkspace('admin')
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        async function activateInvitation(event) {
          event.preventDefault()
          setError('')
          const form = new FormData(event.currentTarget)
          try {
            const result = await api('/invitations/accept', { method: 'POST', body: JSON.stringify({ token: inviteToken, name: form.get('name'), password: form.get('password') }) })
            window.history.replaceState({}, '', window.location.pathname)
            setUser(result.user)
            setCompany(result.company)
            await loadWorkspace(result.user.role)
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        async function signOut() {
          await api('/auth/logout', { method: 'POST' }).catch(() => {})
          setUser(null)
          setWorkspace(initialState)
        }

        async function createRecord(resource, values) {
          const result = await api(`/${resource}`, { method: 'POST', body: JSON.stringify(values) })
          if (resource === 'invitations') {
            setInviteUrl(result.activationUrl || '')
            setInviteEmailSent(result.emailSent)
          }
          setModal('')
          setToast(resource === 'invitations' ? result.emailSent ? 'Invitación creada y enviada.' : 'Invitación creada. Copia el enlace para compartirlo.' : 'Cambios guardados en el espacio de trabajo.')
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
            await api(`/users/${person.id}/${disabling ? 'deactivate' : 'reactivate'}`, { method: 'POST', body: '{}' })
            setToast(disabling ? `Acceso de ${person.name} desactivado.` : `Acceso de ${person.name} reactivado.`)
            await loadWorkspace()
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        async function updateRecord(resource, id, values) {
          try {
            await api(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(values) })
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
            setToast(resource === 'projects' ? 'Proyecto eliminado; las tareas se han conservado.' : 'Registro eliminado.')
            await loadWorkspace()
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        async function runAutomation(id) {
          try {
            const result = await api(`/automations/${id}/run`, { method: 'POST', body: '{}' })
            setToast(result.summary)
            await loadWorkspace()
          } catch (requestError) {
            setError(requestError.message)
          }
        }

        const searchResults = useMemo(() => {
          const query = search.trim().toLowerCase()
          if (!query) return []
          return [
            ...workspace.tasks.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ ...item, resource: 'tasks', label: 'Tarea' })),
            ...workspace.projects.filter((item) => item.name.toLowerCase().includes(query)).map((item) => ({ ...item, resource: 'projects', label: 'Proyecto' })),
            ...workspace.issues.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ ...item, resource: 'issues', label: 'Incidencia' })),
            ...workspace.meetings.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ ...item, resource: 'meetings', label: 'Reunión' })),
          ].slice(0, 6)
        }, [search, workspace])

        if (booting) return <div className="boot-screen"><span className="brand-mark"><Compass size={20} /></span><span>Abriendo tu espacio de trabajo…</span></div>
        if (!user && authMode === 'bootstrap') return <BootstrapScreen onSubmit={bootstrapWorkspace} error={error} enabled={setupStatus?.bootstrapEnabled} />
        if (!user && authMode === 'activate') return <ActivationScreen onSubmit={activateInvitation} error={error} invite={inviteInfo} onBack={() => { window.history.replaceState({}, '', window.location.pathname); setAuthMode('login'); setError('') }} />
        if (!user) return <LoginScreen onSubmit={signIn} error={error} demoMode={setupStatus?.demoMode} />

        const meta = pageMeta[page] || pageMeta.dashboard
        const createTarget = page === 'dashboard' ? 'tasks' : page === 'team' ? 'invitations' : page
        const canCreateCurrent = createTarget === 'invitations' ? can(user.role, 'users:manage') : can(user.role, `${createTarget}:create`)
        const canManageProjects = can(user.role, 'projects:delete')
        const createLabel = page === 'dashboard' ? 'Create task' : page === 'team' ? 'Invite person' : `New ${page === 'issues' ? 'issue' : page.slice(0, -1)}`

        return (
          <div className={`app-shell ${dark ? 'theme-dark' : ''}`}>
            {mobileNav && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}
            <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
              <button className="brand-lockup" onClick={() => setPage('dashboard')} aria-label="Ir al panel">
                <span className="brand-mark"><Compass size={20} strokeWidth={2.1} /></span>
                <span className="brand-name">northstar<span>work</span></span>
              </button>
              <button className="workspace-switcher" onClick={() => setToast(`${company} · espacio activo`)}>
                <span className="workspace-monogram">N</span>
                <span className="workspace-copy"><strong>{company}</strong><small>Workspace</small></span>
                <ChevronDown size={15} />
              </button>
              <nav className="primary-nav" aria-label="Navegación principal">
                {navGroups.map((group) => (
                  <div className="nav-group" key={group.label}>
                    <p className="nav-group-label">{group.label}</p>
                    {group.items.map(({ id, label, icon: Icon, badge }) => (
                      <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileNav(false) }}>
                        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                        {badge === 'critical' && workspace.overview?.counts.critical > 0 && <i className="nav-dot" aria-label={`${workspace.overview.counts.critical} críticas`} />}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="sidebar-spacer" />
              <button className={`nav-item ${page === 'team' ? 'active' : ''}`} onClick={() => setPage('team')}><Users size={17} /><span>People</span></button>
              <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings2 size={17} /><span>Settings</span></button>
              <div className="sidebar-bottom">
                <div className="plan-note"><span className="plan-icon"><Sparkles size={14} /></span><div><strong>Operations, in sync</strong><small>Workspace health <b>Good</b></small></div></div>
                <button className="profile-button" onClick={signOut} title="Cerrar sesión">
                  <span className="avatar avatar-coral">{initials(user.name)}</span>
                  <span className="profile-copy"><strong>{user.name}</strong><small>{user.role}</small></span>
                  <LogOut size={15} />
                </button>
              </div>
            </aside>

            <main className="main-panel">
              <header className="topbar">
                <button className="icon-button mobile-menu" title="Abrir navegación" aria-label="Abrir navegación" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
                <div className="breadcrumbs"><span>{company}</span><span className="crumb-slash">/</span><strong>{meta[0]}</strong></div>
                <div className="topbar-tools">
                  <div className={`search-wrap ${searchOpen ? 'search-active' : ''}`}>
                    <Search size={16} />
                    <input value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && (setSearch(''), setSearchOpen(false))} placeholder="Search anything..." aria-label="Buscar en el espacio de trabajo" />
                    <kbd><Command size={11} /> K</kbd>
                    {searchOpen && search && <div className="search-popover">
                      {searchResults.length ? searchResults.map((result) => (
                        <button key={`${result.resource}-${result.id}`} onClick={() => { setPage(result.resource); setSearch(''); setSearchOpen(false) }}><span className="search-result-icon"><Search size={14} /></span><span><strong>{result.title || result.name}</strong><small>{result.label}</small></span><ArrowRight size={14} /></button>
                      )) : <p>No hay coincidencias en los datos cargados.</p>}
                    </div>}
                  </div>
                  <button className="icon-button theme-button" title={dark ? 'Usar tema claro' : 'Usar tema oscuro'} aria-label={dark ? 'Usar tema claro' : 'Usar tema oscuro'} onClick={() => setDark(!dark)}><span className="theme-glyph">{dark ? '☼' : '◐'}</span></button>
                  <button className={`icon-button notification-button ${activityOpen ? 'selected' : ''}`} title="Ver actividad reciente" aria-label="Ver actividad reciente" onClick={() => setActivityOpen(!activityOpen)}><Bell size={17} /><i /></button>
                  <button className="avatar avatar-coral top-avatar" title={user.name}>{initials(user.name)}</button>
                </div>
              </header>

              <div className="content-scroll" onClick={() => searchOpen && setSearchOpen(false)}>
                <div className="page-heading">
                  <div><div className="eyebrow"><span className="eyebrow-dot" /> OPERATIONS CENTER <span className="eyebrow-divider">/</span> {formatDate(todayKey, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>{meta[0]}</h1><p>{meta[1]}</p></div>
                  {canCreateCurrent && <button className="button button-primary" onClick={() => setModal(createTarget)}><Plus size={16} />{createLabel}</button>}
                </div>

                {error && <div className="inline-error" role="alert"><CircleHelp size={16} />{error}<button onClick={() => setError('')} aria-label="Cerrar aviso"><X size={15} /></button></div>}
                {loading && <div className="loading-line"><span /> Syncing workspace data…</div>}

                {page === 'dashboard' && <Dashboard workspace={workspace} onNavigate={setPage} onCreate={() => setModal('tasks')} />}
                {page === 'tasks' && <TasksPage tasks={workspace.tasks} projects={workspace.projects} canUpdate={can(user.role, 'tasks:update')} canDelete={can(user.role, 'tasks:delete')} onStatus={(task, status) => updateRecord('tasks', task.id, { status })} onDelete={(task) => deleteRecord('tasks', task)} />}
                {page === 'projects' && <ProjectsPage projects={workspace.projects} tasks={workspace.tasks} canManage={canManageProjects} onStatus={(project, status) => updateRecord('projects', project.id, { status })} onDelete={(project) => deleteRecord('projects', project)} />}
                {page === 'meetings' && <MeetingsPage meetings={workspace.meetings} canDelete={can(user.role, 'meetings:delete')} onDelete={(meeting) => deleteRecord('meetings', meeting)} />}
                {page === 'events' && <EventsPage events={workspace.events} canDelete={can(user.role, 'events:delete')} onDelete={(event) => deleteRecord('events', event)} />}
                {page === 'calendar' && <CalendarPage meetings={workspace.meetings} events={workspace.events} tasks={workspace.tasks} />}
                {page === 'issues' && <IssuesPage issues={workspace.issues} canUpdate={can(user.role, 'issues:update')} onStatus={(issue, status) => updateRecord('issues', issue.id, { status, reason: `Estado actualizado a ${status}` })} />}
                {page === 'automations' && <AutomationsPage automations={workspace.automations} canManage={can(user.role, 'automations:manage')} onToggle={(item) => updateRecord('automations', item.id, { enabled: !item.enabled })} onRun={runAutomation} />}
                {page === 'assistant' && <AssistantPage workspace={workspace} onCreate={() => setModal('tasks')} />}
                {page === 'reports' && <ReportsPage workspace={workspace} />}
                {page === 'team' && <TeamPage team={workspace.team} tasks={workspace.tasks} currentUserId={user.id} canInvite={can(user.role, 'users:manage')} invitations={workspace.invitations} inviteUrl={inviteUrl} inviteEmailSent={inviteEmailSent} onCopyInvite={copyInviteLink} onRevoke={revokeInvitation} onStatus={updateUserStatus} />}
                {page === 'settings' && <><SettingsPage company={company} user={user} /><RolePermissions /></>}
                <footer className="page-footer"><span><ShieldAlert size={13} /> Data scoped to {company}</span><span>Last synced just now <i className="sync-dot" /></span></footer>
              </div>
            </main>

            {activityOpen && <ActivityDrawer onClose={() => setActivityOpen(false)} />}
            {modal && <CreateModal type={modal} projects={workspace.projects} onClose={() => setModal('')} onCreate={createRecord} />}
            {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}<button aria-label="Cerrar" onClick={() => setToast('')}><X size={14} /></button></div>}
          </div>
        )
      }

      function BootstrapScreen({ onSubmit, error, enabled }) {
        return <main className="auth-layout"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><Compass size={20} /></span><span className="brand-name">northstar<span>work</span></span></div><span className="form-overline">INITIAL SETUP</span><h1>Create your workspace</h1><p className="auth-description">Set up the company and its first administrator. The admin account will be created only after this form is verified.</p>{!enabled && <div className="auth-warning" role="status">Bootstrap is locked. Set a one-time BOOTSTRAP_TOKEN of at least 32 characters in the server environment, then restart the app.</div>}<form className="auth-form" onSubmit={onSubmit}><label>One-time setup token<input name="bootstrapToken" type="password" autoComplete="off" required disabled={!enabled} /></label><label>Company name<input name="company" autoComplete="organization" required minLength="2" maxLength="100" disabled={!enabled} /></label><label>Administrator name<input name="name" autoComplete="name" required minLength="2" maxLength="100" disabled={!enabled} /></label><label>Work email<input name="email" type="email" autoComplete="email" required disabled={!enabled} /></label><label>Create password<input name="password" type="password" autoComplete="new-password" minLength="12" required disabled={!enabled} /><small>Use at least 12 characters. You will sign in with this password.</small></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-primary login-submit" type="submit" disabled={!enabled}>Create workspace and admin <ArrowRight size={16} /></button></form><p className="auth-footnote">This setup link is not public. The operator must provide the one-time token out-of-band.</p></section></main>
      }

      function ActivationScreen({ onSubmit, error, invite, onBack }) {
        return <main className="auth-layout"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><Compass size={20} /></span><span className="brand-name">northstar<span>work</span></span></div><span className="form-overline">TEAM INVITATION</span><h1>Activate your account</h1>{invite ? <><p className="auth-description">You were invited to <strong>{invite.company}</strong> as <strong>{invite.role}</strong>.</p><form className="auth-form" onSubmit={onSubmit}><label>Invited email<input value={invite.email} readOnly aria-readonly="true" /></label><label>Your name<input name="name" autoComplete="name" required minLength="2" maxLength="100" /></label><label>Create password<input name="password" type="password" autoComplete="new-password" required minLength="12" /><small>At least 12 characters. This invitation can only be used once.</small></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-primary login-submit" type="submit">Activate account <ArrowRight size={16} /></button></form><p className="auth-footnote">Invitation expires {new Date(invite.expiresAt).toLocaleString('es-ES')}.</p></> : <><p className="auth-description">This invitation is invalid, expired, or has already been used.</p>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-outline auth-back" onClick={onBack}>Back to sign in</button></>}</section></main>
      }

      function LoginScreen({ onSubmit, error, demoMode }) {
        return <main className="login-layout">
          <section className="login-story"><div className="login-brand"><span className="brand-mark"><Compass size={20} /></span><span className="brand-name">northstar<span>work</span></span></div><div className="login-story-copy"><span className="story-kicker"><i /> YOUR WORK, IN GOOD ORBIT</span><h1>Make room<br />for the work<br /><em>that matters.</em></h1><p>One calm place to align teams, surface blockers, and move your best work forward.</p></div><div className="story-bottom"><span>BUILT FOR THE EVERYDAY MOMENTUM</span><span>01 — 04</span></div><div className="story-orbit orbit-one" /><div className="story-orbit orbit-two" /><div className="story-sun" /></section>
          <section className="login-form-panel"><form className="login-form" onSubmit={onSubmit}><span className="form-overline">WELCOME BACK</span><h2>Your workspace<br />is waiting.</h2><p>Sign in to pick up where your team left off.</p><label>Email address<input name="email" type="email" defaultValue={demoMode ? demoEmail : ''} autoComplete="username" required /></label><label>Password<input name="password" type="password" defaultValue={demoMode ? demoPassword : ''} autoComplete="current-password" required /></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-primary login-submit" type="submit">Continue <ArrowRight size={16} /></button>{demoMode && <div className="demo-note"><span className="demo-check"><Check size={13} /></span><span><strong>Demo workspace</strong><small>Credentials are prefilled. Sign in to explore.</small></span></div>}<div className="login-foot"><span>Protected workspace</span><span>Northstar Work</span></div></form></section>
        </main>
      }

      function Dashboard({ workspace, onNavigate, onCreate }) {
        const overview = workspace.overview || {}
        const counts = overview.counts || { tasks: 0, overdue: 0, projects: 0, meetings: 0, issues: 0, critical: 0 }
        const projects = overview.projects || workspace.projects || []
        const tasks = overview.tasks || workspace.tasks || []
        const meetings = overview.meetings || workspace.meetings || []
        const issues = overview.issues || workspace.issues || []
        const activities = overview.activities || []
        const urgent = issues.filter((issue) => issue.severity === 'Critical' || issue.severity === 'High').slice(0, 3)
        return <div className="dashboard-content">
          <div className="metric-grid">
            <Metric icon={FolderKanban} label="Active projects" value={counts.projects} detail="Across your workspace" tone="green" trend="steady" />
            <Metric icon={ListTodo} label="Open tasks" value={counts.tasks} detail={counts.overdue ? `${counts.overdue} past their due date` : 'No overdue tasks'} tone="orange" trend={counts.overdue ? 'alert' : 'steady'} />
            <Metric icon={CalendarDays} label="Upcoming meetings" value={counts.meetings} detail="Next 7 days" tone="blue" trend="steady" />
            <Metric icon={ShieldAlert} label="Open issues" value={counts.issues} detail={counts.critical ? `${counts.critical} critical to review` : 'No critical incidents'} tone="red" trend={counts.critical ? 'alert' : 'steady'} />
          </div>

          <div className="dashboard-grid dashboard-main-grid">
            <section className="panel projects-panel">
              <div className="panel-heading"><div><span className="panel-kicker">DELIVERY</span><h2>Projects in motion</h2></div><button className="text-action" onClick={() => onNavigate('projects')}>All projects <ArrowRight size={14} /></button></div>
              <div className="project-list">{projects.slice(0, 3).map((project, index) => <div className="project-row" key={project.id}><div className={`project-symbol symbol-${index + 1}`}><FolderKanban size={16} /></div><div className="project-info"><div className="project-title-row"><strong>{project.name}</strong><span className={`status-pill ${statusClass(project.status)}`}>{project.status}</span></div><div className="project-subline"><span>{project.owner}</span><span>Due {formatDate(project.due_date)}</span></div><div className="progress-track"><span style={{ width: `${project.progress}%`, backgroundColor: project.color }} /></div></div><span className="progress-label">{project.progress}%</span></div>)}</div>
              {!projects.length && <EmptyState key="empty-projects" title="No projects yet" text="Create a project to get your team moving." />}
              <div className="project-panel-footer"><span><i className="legend-green" /> On track <i className="legend-amber" /> At risk</span><button className="quiet-button" onClick={() => onNavigate('projects')}>View portfolio</button></div>
            </section>

            <section className="attention-panel">
              <div className="attention-topline"><span className="attention-symbol"><Activity size={16} /></span><span>ATTENTION NEEDED</span><span className="attention-count">{urgent.length}</span></div>
              <h2>A few things<br />need a closer look.</h2>
              <p>Your team can keep momentum with a quick check-in on these items.</p>
              <div className="attention-list">{urgent.map((issue) => <button className="attention-item" key={issue.id} onClick={() => onNavigate('issues')}><span className={`severity-pin severity-${issue.severity.toLowerCase()}`} /><span><strong>{issue.title}</strong><small>{issue.category} · {issue.owner}</small></span><ArrowRight size={14} /></button>)}{!urgent.length && <div className="attention-clear" key="empty-attention"><CheckCircle2 size={17} /> Nothing urgent is waiting.</div>}</div>
              <button className="attention-link" onClick={() => onNavigate('issues')}>Open issue board <ArrowRight size={14} /></button>
            </section>
          </div>

          <div className="dashboard-grid dashboard-lower-grid">
            <section className="panel task-panel">
              <div className="panel-heading"><div><span className="panel-kicker">YOUR FOCUS</span><h2>Tasks to keep moving</h2></div><button className="icon-button small-icon" title="Create a task" aria-label="Create a task" onClick={onCreate}><Plus size={17} /></button></div>
              <div className="compact-task-list">{tasks.slice(0, 5).map((task) => <div className="compact-task" key={task.id}><span className={`task-check ${task.status === 'Done' ? 'checked' : ''}`}>{task.status === 'Done' && <Check size={11} />}</span><span className="compact-task-title">{task.title}<small>{task.assignee}</small></span><span className={`priority-label priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span className={`task-due ${task.due_date < todayKey && task.status !== 'Done' ? 'due-late' : ''}`}>{formatDate(task.due_date)}</span></div>)}</div>
              <button className="panel-bottom-action" onClick={() => onNavigate('tasks')}>View all tasks <ArrowRight size={14} /></button>
            </section>
            <section className="panel agenda-panel">
              <div className="panel-heading"><div><span className="panel-kicker">ON THE CALENDAR</span><h2>Coming up</h2></div><button className="text-action" onClick={() => onNavigate('calendar')}>Open calendar <ArrowRight size={14} /></button></div>
              <div className="agenda-list">{meetings.slice(0, 3).map((meeting) => <div className="agenda-item" key={meeting.id}><div className="agenda-date"><strong>{formatDate(meeting.starts_at, { day: '2-digit' })}</strong><small>{formatDate(meeting.starts_at, { month: 'short' })}</small></div><div className="agenda-detail"><strong>{meeting.title}</strong><span><Clock3 size={12} />{formatDate(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })} · {meeting.duration} min · {meeting.location}</span></div><div className="avatar-stack">{meeting.attendees.slice(0, 3).map((person, index) => <span className={`avatar avatar-tiny avatar-${index}`} key={person}>{initials(person)}</span>)}</div></div>)}</div>
              {!meetings.length && <EmptyState key="empty-meetings" title="Calendar is clear" text="Schedule a meeting to get started." />}
              <button className="panel-bottom-action" onClick={() => onNavigate('meetings')}>View meeting schedule <ArrowRight size={14} /></button>
            </section>
          </div>

          <section className="panel activity-panel">
            <div className="panel-heading"><div><span className="panel-kicker">TEAM PULSE</span><h2>Recent activity</h2></div><span className="activity-live"><i /> LIVE</span></div>
            <div className="activity-strip">{activities.slice(0, 4).map((activity, index) => <div className="activity-entry" key={activity.id}><span className={`activity-avatar activity-${index}`}>{initials(activity.actor || 'NW')}</span><span><strong>{activity.actor || 'Workspace'}</strong><small>{activity.summary}</small></span><time>{timeAgo(activity.created_at)}</time></div>)}{!activities.length && <span className="muted-copy" key="empty-activity">No recent activity.</span>}</div>
          </section>
        </div>
      }

      function Metric({ icon: Icon, label, value, detail, tone, trend }) {
        return <article className="metric-card"><div className="metric-top"><span className={`metric-icon metric-${tone}`}><Icon size={17} /></span><span className={`metric-trend ${trend === 'alert' ? 'trend-alert' : ''}`}>{trend === 'alert' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{trend === 'alert' ? 'Review' : 'Stable'}</span></div><p>{label}</p><div className="metric-bottom"><strong>{value}</strong><span>{detail}</span></div></article>
      }

      function TasksPage({ tasks, projects, canUpdate, canDelete, onStatus, onDelete }) {
        const [filter, setFilter] = useState('All tasks')
        const filtered = tasks.filter((task) => filter === 'All tasks' || task.status === filter)
        return <section className="panel data-panel"><div className="list-toolbar"><div className="segmented-control">{['All tasks', 'To do', 'In progress', 'Done'].map((option) => <button className={filter === option ? 'selected' : ''} key={option} onClick={() => setFilter(option)}>{option}</button>)}</div><span className="record-count">{filtered.length} records</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due date</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((task) => <tr key={task.id}><td><span className={`task-check table-check ${task.status === 'Done' ? 'checked' : ''}`}>{task.status === 'Done' && <Check size={11} />}</span><strong>{task.title}</strong></td><td>{projects.find((project) => project.id === task.project_id)?.name || '—'}</td><td><span className="table-person"><span className="avatar avatar-mini">{initials(task.assignee)}</span>{task.assignee}</span></td><td><span className={`priority-label priority-${task.priority.toLowerCase()}`}>{task.priority}</span></td><td>{formatDate(task.due_date)}</td><td><select className={`inline-select status-${statusClass(task.status)}`} value={task.status} onChange={(event) => onStatus(task, event.target.value)} aria-label={`Estado de ${task.title}`} disabled={!canUpdate}><option>To do</option><option>In progress</option><option>Done</option></select></td><td><button className="row-action" aria-label={`Eliminar ${task.title}`} title={canDelete ? 'Eliminar tarea' : 'Solo admin y manager pueden eliminar tareas'} disabled={!canDelete} onClick={() => onDelete(task)}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{!filtered.length && <EmptyState title="Nothing here yet" text="Try another filter or create a task." />}</div></section>
      }

      function ProjectsPage({ projects, tasks, canManage, onStatus, onDelete }) {
        return <div className="project-card-grid">{projects.map((project, index) => { const projectTasks = tasks.filter((task) => task.project_id === project.id); const done = projectTasks.filter((task) => task.status === 'Done').length; return <article className="project-card" key={project.id}><div className="project-card-top"><span className={`project-symbol symbol-${index + 1}`}><FolderKanban size={17} /></span><div className="project-card-actions"><button className="more-button" title={canManage ? 'Cambiar estado' : 'Solo admin y manager pueden modificar proyectos'} disabled={!canManage} onClick={() => onStatus(project, project.status === 'At risk' ? 'On track' : 'At risk')}><MoreHorizontal size={17} /></button><button className="more-button" title={canManage ? 'Eliminar proyecto' : 'Solo admin y manager pueden eliminar proyectos'} aria-label={`Eliminar ${project.name}`} disabled={!canManage} onClick={() => onDelete(project)}><Trash2 size={15} /></button></div></div><div className="project-card-title"><h2>{project.name}</h2><span className={`status-pill ${statusClass(project.status)}`}>{project.status}</span></div><p className="project-card-owner">Led by <strong>{project.owner}</strong></p><div className="project-progress-heading"><span>Progress</span><strong>{project.progress}%</strong></div><div className="progress-track project-large-progress"><span style={{ width: `${project.progress}%`, backgroundColor: project.color }} /></div><div className="project-card-foot"><span>{done}/{projectTasks.length || 0} tasks complete</span><span>Due {formatDate(project.due_date)}</span></div></article> })}{!projects.length && <EmptyState title="No projects yet" text="Create a project to organize the work." />}</div>
      }

      function MeetingsPage({ meetings, canDelete, onDelete }) {
        return <div className="meeting-list">{meetings.map((meeting) => <article className="meeting-row panel" key={meeting.id}><div className="meeting-date-block"><span>{formatDate(meeting.starts_at, { month: 'short' })}</span><strong>{formatDate(meeting.starts_at, { day: '2-digit' })}</strong><small>{formatDate(meeting.starts_at, { weekday: 'short' })}</small></div><div className="meeting-main"><span className="panel-kicker">{formatDate(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })} · {meeting.duration} MIN</span><h2>{meeting.title}</h2><p>{meeting.agenda || 'No agenda provided'}</p><div className="meeting-meta"><span><Users size={13} />{meeting.attendees.length} participants</span><span><Compass size={13} />{meeting.location}</span></div></div><div className="meeting-attendees"><div className="avatar-stack">{meeting.attendees.map((person, index) => <span className={`avatar avatar-${index % 3}`} key={person} title={person}>{initials(person)}</span>)}</div><span>{meeting.attendees.join(', ')}</span></div><button className="row-action" aria-label={`Eliminar ${meeting.title}`} title={canDelete ? 'Eliminar reunión' : 'Solo admin y manager pueden eliminar reuniones'} disabled={!canDelete} onClick={() => onDelete(meeting)}><MoreHorizontal size={17} /></button></article>)}{!meetings.length && <EmptyState title="No meetings scheduled" text="Add a meeting to bring the team together." />}</div>
      }

      function EventsPage({ events, canDelete, onDelete }) {
        return <div className="event-grid">{events.map((event, index) => <article className={`event-card event-card-${index % 2}`} key={event.id}><div className="event-card-art"><span className="event-date-chip"><CalendarDays size={13} />{formatDate(event.starts_at, { month: 'short', day: 'numeric' })}</span><span className="event-art-code">{String(index + 1).padStart(2, '0')} / 24</span><div className="event-art-lines" /></div><div className="event-card-body"><div className="event-heading"><h2>{event.title}</h2><button className="more-button" title={canDelete ? 'Eliminar evento' : 'Solo admin y manager pueden eliminar eventos'} disabled={!canDelete} onClick={() => onDelete(event)}><MoreHorizontal size={17} /></button></div><div className="event-details"><span><Compass size={14} />{event.location}</span><span><Users size={14} />{event.attendees} attending</span></div><div className="event-foot"><span className={`status-pill ${statusClass(event.status)}`}>{event.status}</span><span>{formatDate(event.starts_at, { hour: '2-digit', minute: '2-digit' })}</span></div></div></article>)}{!events.length && <EmptyState title="No events planned" text="Create an event to coordinate a workshop or team gathering." />}</div>
      }

      function CalendarPage({ meetings, events, tasks }) {
        const days = calendarDays
        const entries = [...meetings.map((item) => ({ ...item, kind: 'meeting', date: item.starts_at })), ...events.map((item) => ({ ...item, kind: 'event', date: item.starts_at })), ...tasks.map((item) => ({ ...item, kind: 'task', date: item.due_date }))]
        return <section className="panel calendar-panel"><div className="calendar-toolbar"><div><span className="panel-kicker">THIS WEEK</span><h2>{formatDate(days[0], { month: 'long', day: 'numeric' })} — {formatDate(days[6], { month: 'long', day: 'numeric', year: 'numeric' })}</h2></div><span className="calendar-key"><i className="key-meeting" /> Meeting <i className="key-task" /> Task <i className="key-event" /> Event</span></div><div className="calendar-week">{days.map((date) => { const key = date.toISOString().slice(0, 10); const items = entries.filter((item) => item.date.slice(0, 10) === key); return <div className={`calendar-day ${key === todayKey ? 'calendar-today' : ''}`} key={key}><div className="calendar-day-head"><span>{formatDate(date, { weekday: 'short' })}</span><strong>{formatDate(date, { day: '2-digit' })}</strong></div><div className="calendar-day-items">{items.map((item) => <div className={`calendar-chip chip-${item.kind}`} key={`${item.kind}-${item.id}`}><small>{item.kind === 'task' ? 'DUE' : formatDate(item.date, { hour: '2-digit', minute: '2-digit' })}</small><strong>{item.title}</strong></div>)}{!items.length && <span className="empty-day">—</span>}</div></div> })}</div></section>
      }

      function IssuesPage({ issues, onStatus }) {
        const [filter, setFilter] = useState('Open')
        const visible = issues.filter((issue) => filter === 'All' || issue.status === filter)
        return <><div className="issue-summary-strip"><div><span className="issue-summary-icon issue-red"><ShieldAlert size={16} /></span><strong>{issues.filter((issue) => issue.severity === 'Critical' && issue.status !== 'Resolved').length}</strong><small>Critical</small></div><div><span className="issue-summary-icon issue-amber"><Clock3 size={16} /></span><strong>{issues.filter((issue) => issue.status === 'Investigating').length}</strong><small>Investigating</small></div><div><span className="issue-summary-icon issue-green"><CheckCircle2 size={16} /></span><strong>{issues.filter((issue) => issue.status === 'Resolved').length}</strong><small>Resolved</small></div><div className="issue-summary-note"><Sparkles size={15} /> Suggested next steps are rule-based. Review before acting.</div></div><section className="panel data-panel"><div className="list-toolbar"><div className="segmented-control">{['Open', 'Investigating', 'Resolved', 'All'].map((option) => <button className={filter === option ? 'selected' : ''} key={option} onClick={() => setFilter(option)}>{option}</button>)}</div><span className="record-count">{visible.length} issues</span></div><div className="issue-list">{visible.map((issue) => <article className="issue-row" key={issue.id}><span className={`issue-severity-bar severity-bar-${issue.severity.toLowerCase()}`} /><div className="issue-main"><div className="issue-title-line"><span className={`severity-label severity-${issue.severity.toLowerCase()}`}>{issue.severity}</span><span className="issue-category">{issue.category}</span></div><h3>{issue.title}</h3><p>{issue.description}</p><div className="issue-suggestion"><Sparkles size={14} /><span><strong>Suggested next step</strong> {issue.recommendation || 'Review the available context with the issue owner.'}</span></div></div><div className="issue-owner"><span className="avatar avatar-mini">{initials(issue.owner)}</span><span><small>OWNER</small><strong>{issue.owner}</strong></span></div><div className="issue-impact"><small>EST. IMPACT</small><strong>{issue.impact ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(issue.impact) : 'Unestimated'}</strong></div><select className={`inline-select status-${statusClass(issue.status)}`} value={issue.status} onChange={(event) => onStatus(issue, event.target.value)} aria-label={`Estado de ${issue.title}`}><option>Open</option><option>Investigating</option><option>Resolved</option></select></article>)}{!visible.length && <EmptyState title="No issues in this view" text="Switch the filter to review other incidents." />}</div></section></>
      }

      function AutomationsPage({ automations, canManage, onToggle, onRun }) {
        return <><div className="automation-banner"><div className="automation-banner-icon"><Workflow size={20} /></div><div><span className="panel-kicker">RULES, NOT MAGIC</span><h2>Helpful workflows, with a human in control.</h2><p>Test runs inspect workspace data and record activity. External notifications and AI services are not connected.</p></div><span className="automation-status"><i /> {automations.filter((item) => item.enabled).length} ACTIVE</span></div><div className="automation-list">{automations.map((item, index) => <article className="automation-card panel" key={item.id}><div className={`automation-icon automation-icon-${index}`}><Workflow size={18} /></div><div className="automation-content"><div className="automation-title-line"><h3>{item.name}</h3><span className={`automation-state ${item.enabled ? 'is-enabled' : ''}`}>{item.enabled ? 'Active' : 'Paused'}</span></div><p>{item.description}</p><div className="automation-meta"><span><span className="automation-node">WHEN</span>{automationTrigger(item.trigger_key)}</span><span><Activity size={13} />{item.runs} runs</span></div></div><div className="automation-actions"><button className="button button-outline" onClick={() => onRun(item.id)} disabled={!canManage || !item.enabled} title={canManage ? 'Probar regla' : 'Solo admin puede ejecutar automatizaciones'}><span>Test run</span><ArrowRight size={14} /></button><button className={`toggle-switch ${item.enabled ? 'toggle-on' : ''}`} role="switch" aria-checked={Boolean(item.enabled)} aria-label={`${item.enabled ? 'Pausar' : 'Activar'} ${item.name}`} onClick={() => onToggle(item)} disabled={!canManage} title={canManage ? 'Cambiar estado' : 'Solo admin puede cambiar automatizaciones'}><span /></button></div></article>)}{!automations.length && <EmptyState title="No rules configured" text="Your automations will appear here." />}</div></>
      }

      function AssistantPage({ workspace, onCreate }) {
        const [question, setQuestion] = useState('')
        const [answer, setAnswer] = useState('')
        const [asked, setAsked] = useState('')
        const suggestions = ['What needs attention today?', 'Which projects are at risk?', 'Summarize open issues']
        function ask(value = question) {
          if (!value.trim()) return
          const query = value.toLowerCase()
          const { tasks, projects, issues } = workspace
          let response
          if (query.includes('project') || query.includes('deadline')) {
            const atRisk = projects.filter((project) => project.status === 'At risk' || project.progress < 40)
            response = atRisk.length ? `I found ${atRisk.length} project${atRisk.length === 1 ? '' : 's'} that may need a check-in: ${atRisk.map((project) => `${project.name} (${project.progress}% complete, due ${formatDate(project.due_date)})`).join('; ')}. This is a simple progress signal, not a forecast.` : 'No project is currently marked at risk. This status is maintained by your team; it is not an AI forecast.'
          } else if (query.includes('issue') || query.includes('incident') || query.includes('problem')) {
            const open = issues.filter((issue) => issue.status !== 'Resolved')
            response = open.length ? `${open.length} unresolved issue${open.length === 1 ? '' : 's'}: ${open.map((issue) => `${issue.title} (${issue.severity}, owner ${issue.owner})`).join('; ')}. The suggested next steps on each issue are rule-based and should be reviewed.` : 'There are no unresolved issues in the workspace data.'
          } else {
            const overdue = tasks.filter((task) => task.status !== 'Done' && task.due_date < todayKey)
            const critical = issues.filter((issue) => issue.severity === 'Critical' && issue.status !== 'Resolved')
            response = `Start with ${critical.length} critical issue${critical.length === 1 ? '' : 's'} and ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}. ${critical[0] ? `The first critical item is “${critical[0].title}”, owned by ${critical[0].owner}.` : 'No critical issue is currently open.'} ${overdue[0] ? `The oldest visible overdue task is “${overdue[0].title}”.` : 'No overdue task is currently visible.'}`
          }
          setAsked(value)
          setAnswer(response)
          setQuestion('')
        }
        return <div className="assistant-layout"><section className="assistant-main panel"><div className="assistant-intro"><span className="assistant-orbit-icon"><Sparkles size={20} /></span><span className="panel-kicker">WORKSPACE GUIDE · LOCAL PREVIEW</span><h2>Ask a better<br />work question.</h2><p>Explore the project, task, and issue data currently loaded in this workspace.</p></div><div className="assistant-thread">{!answer && <div className="suggestion-list">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)}>{suggestion}<ArrowRight size={14} /></button>)}</div>}{answer && <><div className="user-question"><span>{asked}</span><span className="avatar avatar-mini">OC</span></div><div className="assistant-answer"><span className="assistant-answer-icon"><Sparkles size={15} /></span><div><strong>Workspace guide</strong><p>{answer}</p><small>Based on the currently loaded workspace records.</small></div></div></>}</div><form className="assistant-input" onSubmit={(event) => { event.preventDefault(); ask() }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your projects, tasks, or issues…" aria-label="Pregunta al asistente" /><button className="icon-button send-button" aria-label="Enviar pregunta" type="submit"><ArrowRight size={17} /></button></form></section><aside className="assistant-side"><div className="assistant-notice"><span><CircleHelp size={17} /></span><div><strong>No AI provider connected</strong><p>Answers here use transparent rules over the data visible in this workspace. They are not generated by a language model.</p></div></div><div className="panel assistant-sources"><span className="panel-kicker">AVAILABLE CONTEXT</span><h3>Workspace records</h3>{[['Projects', workspace.projects.length], ['Tasks', workspace.tasks.length], ['Meetings', workspace.meetings.length], ['Open issues', workspace.issues.filter((issue) => issue.status !== 'Resolved').length]].map(([label, count]) => <div className="context-source" key={label}><span><i />{label}</span><strong>{count}</strong></div>)}<div className="source-foot"><ShieldAlert size={13} /> Responses cannot modify records.</div></div><button className="button button-outline assistant-create" onClick={onCreate}><Plus size={15} />Create a task</button></aside></div>
      }

      function ReportsPage({ workspace }) {
        const { tasks, projects, issues } = workspace
        const complete = tasks.filter((task) => task.status === 'Done').length
        const overdue = tasks.filter((task) => task.status !== 'Done' && task.due_date < todayKey).length
        const exportCsv = () => {
          const rows = [['Type', 'Title', 'Status', 'Owner', 'Due date'], ...tasks.map((task) => ['Task', task.title, task.status, task.assignee, task.due_date]), ...projects.map((project) => ['Project', project.name, project.status, project.owner, project.due_date]), ...issues.map((issue) => ['Issue', issue.title, issue.status, issue.owner, issue.created_at.slice(0, 10)])]
          const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
          const link = document.createElement('a'); link.href = url; link.download = 'northstar-operations-report.csv'; link.click(); URL.revokeObjectURL(url)
        }
        const taskBars = [['To do', tasks.filter((task) => task.status === 'To do').length, '#d5a566'], ['In progress', tasks.filter((task) => task.status === 'In progress').length, '#668c83'], ['Done', complete, '#7c9a6a']]
        return <><div className="report-toolbar"><span className="report-period"><CalendarDays size={14} /> Last 30 days <ChevronDown size={14} /></span><button className="button button-outline" onClick={exportCsv}><ArrowDownRight size={15} />Export CSV</button></div><div className="report-kpis"><article className="report-kpi"><span>TASKS COMPLETED</span><strong>{complete}<small> / {tasks.length}</small></strong><div className="report-kpi-foot"><span>Current workspace tasks</span><i className="report-kpi-green" /></div></article><article className="report-kpi"><span>PROJECTS AT RISK</span><strong>{projects.filter((project) => project.status === 'At risk' || project.status === 'Behind').length}</strong><div className="report-kpi-foot"><span>Owner status</span><i className="report-kpi-amber" /></div></article><article className="report-kpi"><span>OVERDUE TASKS</span><strong>{overdue}</strong><div className="report-kpi-foot"><span>Open and past due date</span><i className="report-kpi-red" /></div></article><article className="report-kpi"><span>OPEN ISSUES</span><strong>{issues.filter((issue) => issue.status !== 'Resolved').length}</strong><div className="report-kpi-foot"><span>Across all categories</span><i className="report-kpi-blue" /></div></article></div><div className="report-charts"><section className="panel report-chart"><div className="panel-heading"><div><span className="panel-kicker">WORKLOAD SNAPSHOT</span><h2>Task status</h2></div><span className="chart-caption">{tasks.length} total tasks</span></div><div className="bar-chart">{taskBars.map(([label, value, color]) => <div className="bar-chart-row" key={label}><span>{label}</span><div className="bar-chart-track"><i style={{ width: `${tasks.length ? Math.max(value / tasks.length * 100, value ? 7 : 0) : 0}%`, backgroundColor: color }} /></div><strong>{value}</strong></div>)}</div><p className="chart-footnote">Counts reflect records currently in the workspace.</p></section><section className="panel report-chart"><div className="panel-heading"><div><span className="panel-kicker">PROJECT PORTFOLIO</span><h2>Progress by project</h2></div><span className="chart-caption">Live status</span></div><div className="report-project-list">{projects.map((project) => <div className="report-project-row" key={project.id}><span>{project.name}</span><div className="progress-track"><i style={{ width: `${project.progress}%`, backgroundColor: project.color }} /></div><strong>{project.progress}%</strong></div>)}</div><p className="chart-footnote">Progress is team-maintained; no forecast model is connected.</p></section></div></>
      }

      function TeamPage({ team, tasks, currentUserId, canInvite, invitations, inviteUrl, inviteEmailSent, onCopyInvite, onRevoke, onStatus }) {
        return <div className="team-page">
          <div className="team-intro panel"><div><span className="panel-kicker">PEOPLE & CAPACITY</span><h2>Manage your people and their access.</h2><p>Invitations expire after 48 hours and can only be accepted once.</p></div><span className="team-count"><Users size={16} />{team.length} member{team.length === 1 ? '' : 's'}</span></div>
          {canInvite && <section className="panel invitation-panel">
            <div className="panel-heading"><div><span className="panel-kicker">ACCESS CONTROL</span><h2>Invitations</h2></div><span className="record-count">{invitations.length} pending</span></div>
            {inviteUrl && <div className="invite-link-box"><div><strong>{inviteEmailSent ? 'Invitation email sent' : 'Share activation link'}</strong><small>{inviteEmailSent ? 'The recipient can use the email or this one-time link.' : 'SMTP is not configured, so share this link securely yourself.'}</small><input aria-label="Enlace único de activación" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} /></div><button className="button button-outline" onClick={onCopyInvite}><Copy size={14} />Copy link</button></div>}
            <div className="invitation-list">{invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><span className="invitation-avatar"><Users size={15} /></span><span className="invitation-person"><strong>{invitation.email}</strong><small>Invited by {invitation.created_by_name} · Expires {formatDate(invitation.expires_at, { month: 'short', day: 'numeric' })}</small></span><span className="role-chip invitation-role">{invitation.role}</span><button className="row-action" title="Revocar invitación" aria-label={`Revocar invitación de ${invitation.email}`} onClick={() => onRevoke(invitation)}><X size={15} /></button></div>)}{!invitations.length && <p className="invitation-empty">No pending invitations. Create one to add someone to this workspace.</p>}</div>
          </section>}
          <div className="team-grid">{team.map((person, index) => { const assigned = tasks.filter((task) => task.assignee === person.name); const open = assigned.filter((task) => task.status !== 'Done').length; const active = person.status === 'active'; return <article className={`team-card panel ${!active ? 'team-card-inactive' : ''}`} key={person.id}><div className="team-card-actions"><span className={`member-status ${active ? 'member-active' : 'member-inactive'}`}>{active ? 'Active' : 'Inactive'}</span>{canInvite && person.id !== currentUserId && <button className={`member-access-button ${active ? 'member-deactivate' : 'member-reactivate'}`} title={active ? 'Desactivar cuenta' : 'Reactivar cuenta'} aria-label={`${active ? 'Desactivar' : 'Reactivar'} a ${person.name}`} onClick={() => onStatus(person, active ? 'inactive' : 'active')}>{active ? <X size={14} /> : <Check size={14} />}</button>}</div><div className={`team-avatar team-avatar-${index % 3}`}><span>{initials(person.name)}</span><i /></div><div className="team-person-name"><h3>{person.name}</h3><span>{person.role}</span></div><p>{person.email}</p><div className="team-workload"><span>Assigned work</span><strong>{open} open</strong></div><div className="workload-meter"><i style={{ width: `${Math.min(open * 24, 90)}%` }} /></div><span className="team-task-caption">{assigned.length} tracked task{assigned.length === 1 ? '' : 's'}{person.deactivated_at ? ` · Deactivated ${formatDate(person.deactivated_at)}` : ''}</span></article> })}{!team.length && <EmptyState key="empty-team" title="No team members" text="Invite teammates to begin collaborating." />}</div>
        </div>
      }

      function RolePermissions() {
        const roles = [
          ['Admin', 'Acceso completo; administra automatizaciones y configuración.'],
          ['Manager', 'Gestiona proyectos y eventos; puede borrar registros operativos.'],
          ['Member', 'Crea y actualiza tareas, reuniones e incidencias; no puede borrar.'],
          ['Viewer', 'Consulta los datos; no puede crear, modificar ni borrar.'],
        ]
        return <section className="panel settings-section role-permissions"><div className="settings-section-head"><span className="settings-section-icon"><ShieldAlert size={18} /></span><div><h2>Role permissions</h2><p>Permissions are checked by the API as well as the interface.</p></div></div><div className="role-permission-list">{roles.map(([name, description]) => <div className="role-permission-row" key={name}><strong>{name}</strong><span>{description}</span></div>)}</div></section>
      }

      function SettingsPage({ company, user }) {
        return <div className="settings-page"><section className="panel settings-section"><div className="settings-section-head"><span className="settings-section-icon"><Compass size={18} /></span><div><h2>Workspace identity</h2><p>Organization and signed-in account details.</p></div></div><div className="settings-fields"><div><span>COMPANY</span><strong>{company}</strong></div><div><span>YOUR ACCOUNT</span><strong>{user.name} · {user.email}</strong></div><div><span>ACCESS ROLE</span><strong className="role-chip">{user.role}</strong></div></div></section><section className="panel settings-section"><div className="settings-section-head"><span className="settings-section-icon settings-integration-icon"><Workflow size={18} /></span><div><h2>Connected services</h2><p>External services remain disconnected until credentials are configured.</p></div></div><div className="integration-list">{[['Google Calendar', 'Meetings and availability'], ['Microsoft Outlook', 'Calendar and email'], ['Slack', 'Notifications and escalations'], ['Microsoft Teams', 'Meetings and team alerts']].map(([name, detail]) => <div className="integration-row" key={name}><span className="integration-monogram">{name === 'Google Calendar' ? 'G' : name === 'Microsoft Outlook' ? 'O' : name === 'Slack' ? 'S' : 'T'}</span><span><strong>{name}</strong><small>{detail}</small></span><span className="integration-disconnected"><i /> Not connected</span><button className="button button-outline" disabled title="Configure credentials to enable this integration">Configure</button></div>)}</div><div className="settings-security-note"><ShieldAlert size={15} /> No external provider is active. Configure OAuth credentials and callback URLs before enabling a connection.</div></section><section className="panel settings-section"><div className="settings-section-head"><span className="settings-section-icon"><LifeBuoy size={18} /></span><div><h2>Data & access</h2><p>Current demo environment details.</p></div></div><div className="settings-fields"><div><span>STORAGE</span><strong>SQLite · local persistent database</strong></div><div><span>SESSION</span><strong>HttpOnly cookie · 8 hour expiry</strong></div><div><span>AUDIT LOG</span><strong>Workspace activity retained</strong></div></div></section></div>
      }

      function CreateModal({ type, projects, onClose, onCreate }) {
        const [saving, setSaving] = useState(false)
        const [error, setError] = useState('')
        const titles = { tasks: 'Create a task', projects: 'Create a project', meetings: 'Schedule a meeting', events: 'Plan an event', issues: 'Report an issue' }
        const submit = async (event) => {
          event.preventDefault()
          setSaving(true)
          setError('')
          const form = new FormData(event.currentTarget)
          const values = Object.fromEntries(form.entries())
          if (type === 'meetings') values.attendees = String(values.attendees || '').split(',').map((name) => name.trim()).filter(Boolean)
          if (type === 'projects') { values.budget = Number(values.budget || 0); values.progress = 0; values.color = '#d46e4f' }
          if (type === 'events') values.attendees = Number(values.attendees || 0)
          if (type === 'issues') values.impact = Number(values.impact || 0)
          if (type === 'meetings' || type === 'events') values.starts_at = new Date(values.starts_at).toISOString()
          try { await onCreate(type, values) } catch (requestError) { setError(requestError.message); setSaving(false) }
        }
        const dateDefault = tomorrowKey
        if (type === 'invitations') return <InvitationModal onClose={onClose} onCreate={onCreate} />
        return <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="panel-kicker">NORTHSTAR WORKSPACE</span><h2 id="modal-title">{titles[type]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div><form onSubmit={submit} className="create-form">{type === 'tasks' && <><label>Task name<input name="title" placeholder="e.g. Prepare launch review" required autoFocus /></label><div className="form-two"><label>Assignee<select name="assignee" defaultValue="Olivia Chen"><option>Olivia Chen</option><option>Marcus Lee</option><option>Priya Shah</option><option>Ava Patel</option><option>Jonah Kim</option></select></label><label>Priority<select name="priority" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></label></div><div className="form-two"><label>Due date<input name="due_date" type="date" defaultValue={dateDefault} required /></label><label>Project<select name="project_id" defaultValue="">{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div><input name="status" type="hidden" value="To do" /></>}{type === 'projects' && <><label>Project name<input name="name" placeholder="e.g. Customer onboarding refresh" required autoFocus /></label><div className="form-two"><label>Project lead<input name="owner" defaultValue="Olivia Chen" required /></label><label>Due date<input name="due_date" type="date" defaultValue={dateDefault} required /></label></div><label>Approved budget<input name="budget" type="number" min="0" step="100" placeholder="0" /></label><input name="status" type="hidden" value="On track" /></>}{type === 'meetings' && <><label>Meeting title<input name="title" placeholder="e.g. Weekly product sync" required autoFocus /></label><div className="form-two"><label>Date & time<input name="starts_at" type="datetime-local" defaultValue={`${dateDefault}T10:00`} required /></label><label>Duration<select name="duration" defaultValue="30"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option></select></label></div><label>Participants<input name="attendees" placeholder="Names separated by commas" /></label><div className="form-two"><label>Location<input name="location" defaultValue="Google Meet" /></label><label>Agenda<input name="agenda" placeholder="Topics to cover" /></label></div></>}{type === 'events' && <><label>Event name<input name="title" placeholder="e.g. Team offsite" required autoFocus /></label><div className="form-two"><label>Date & time<input name="starts_at" type="datetime-local" defaultValue={`${dateDefault}T09:00`} required /></label><label>Expected attendees<input name="attendees" type="number" min="0" defaultValue="0" /></label></div><label>Location<input name="location" placeholder="Venue or online" defaultValue="TBD" /></label><input name="status" type="hidden" value="Planning" /></>}{type === 'issues' && <><label>Issue summary<input name="title" placeholder="What needs attention?" required autoFocus /></label><label>Description<textarea name="description" placeholder="Add the relevant context" rows="3" /></label><div className="form-two"><label>Category<select name="category"><option>Operations</option><option>IT & security</option><option>Finance</option><option>Supply chain</option><option>People</option></select></label><label>Severity<select name="severity"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div><div className="form-two"><label>Owner<input name="owner" defaultValue="Olivia Chen" required /></label><label>Estimated impact ($)<input name="impact" type="number" min="0" step="1" defaultValue="0" /></label></div><label>Suggested next step<input name="recommendation" placeholder="Review details with the owner" /></label><input name="status" type="hidden" value="Open" /></>}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-foot"><span><ShieldAlert size={13} /> Changes are recorded in workspace activity.</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : titles[type]}{!saving && <ArrowRight size={15} />}</button></div></div></form></section></div>
      }

      function InvitationModal({ onClose, onCreate }) {
        const [saving, setSaving] = useState(false)
        const [error, setError] = useState('')
        async function submit(event) {
          event.preventDefault()
          setSaving(true)
          setError('')
          const form = new FormData(event.currentTarget)
          try {
            await onCreate('invitations', { email: form.get('email'), role: form.get('role') })
          } catch (requestError) {
            setError(requestError.message)
            setSaving(false)
          }
        }
        return <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="create-modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title"><div className="modal-head"><div><span className="panel-kicker">WORKSPACE ACCESS</span><h2 id="invite-title">Invite a teammate</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><form className="create-form" onSubmit={submit}><p className="invite-modal-copy">The person will receive a single-use activation link that expires in 48 hours. Choose the least privileged role they need.</p><label>Work email<input name="email" type="email" autoComplete="off" placeholder="name@company.com" required autoFocus /></label><label>Role<select name="role" defaultValue="member"><option value="member">Member · tasks, meetings, issues</option><option value="viewer">Viewer · read only</option><option value="manager">Manager · projects and team operations</option><option value="admin">Admin · full access and access management</option></select></label>{error && <div className="form-error" role="alert">{error}</div>}<div className="invite-security-note"><ShieldAlert size={14} /> The activation URL is shown only once and stored as a hash.</div><div className="modal-foot"><span>Invitation action is audited.</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Creating…' : 'Create invitation'}{!saving && <ArrowRight size={15} />}</button></div></div></form></section></div>
      }

      function ActivityDrawer({ onClose }) {
        const [items, setItems] = useState([])
        const [error, setError] = useState('')
        useEffect(() => { api('/activities').then(setItems).catch((requestError) => setError(requestError.message)) }, [])
        return <><button className="drawer-scrim" aria-label="Cerrar actividad" onClick={onClose} /><aside className="activity-drawer"><div className="drawer-head"><div><span className="panel-kicker">WORKSPACE LOG</span><h2>Recent activity</h2></div><button className="icon-button" aria-label="Cerrar actividad" onClick={onClose}><X size={17} /></button></div>{error && <p className="drawer-error">{error}</p>}<div className="drawer-activity-list">{items.map((item) => <article className="drawer-activity" key={item.id}><span className="drawer-activity-icon"><Activity size={14} /></span><div><strong>{item.actor || 'Workspace'}</strong><p>{item.summary}</p><time>{new Date(item.created_at).toLocaleString('es-ES')}</time>{item.reason && <small>Reason: {item.reason}</small>}</div></article>)}{!items.length && !error && <EmptyState title="No activity yet" text="Workspace changes will be listed here." />}</div><div className="drawer-foot"><ShieldAlert size={13} /> Activity is scoped to this workspace.</div></aside></>
      }

      function EmptyState({ title, text }) {
        return <div className="empty-state"><span><Compass size={18} /></span><strong>{title}</strong><p>{text}</p></div>
      }

      function statusClass(status = '') { return status.toLowerCase().replaceAll(' ', '-') }
      function automationTrigger(key) { return ({ overdue_tasks: 'Task becomes overdue', critical_issues: 'Critical issue is reported', meeting_followup: 'Meeting follow-up is requested' })[key] || key }
      function timeAgo(value) {
        const minutes = Math.max(0, Math.floor((currentTime - new Date(value).getTime()) / 60000))
        if (minutes < 1) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}h ago`
        return `${Math.floor(hours / 24)}d ago`
      }

      export default App
