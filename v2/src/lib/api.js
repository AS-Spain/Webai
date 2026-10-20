// Demo sessions remain only in memory, including Vite hot updates. Keeping a
// shared object also keeps old callback closures on the same session generation.
// Normal authentication still uses only the server's HttpOnly cookie.
const state = import.meta.hot?.data.demoSessionState || { demoSession: null, renewal: null, generation: 0 }
if (import.meta.hot) {
  // Dependency updates can re-evaluate this module without invoking dispose.
  import.meta.hot.data.demoSessionState = state
}
const demoRoles = new Set(['admin', 'manager', 'member', 'viewer'])
const demoRoleKey = 'northstar-v2-demo-role'
export function getDemoRoleHint() {
  try {
    const role = typeof window !== 'undefined' && window.sessionStorage?.getItem(demoRoleKey)
    return demoRoles.has(role) ? role : null
  } catch { return null }
}
export function getDemoSessionResult() { return state.demoSession?.result || null }
export function setDemoSession(result) {
  state.generation += 1
  state.demoSession = result?.sessionToken ? { token: result.sessionToken, role: result.user.role, result } : null
  // Only the public profile name survives a reload; never store a session token.
  try {
    if (typeof window !== 'undefined') {
      if (state.demoSession && demoRoles.has(state.demoSession.role)) window.sessionStorage?.setItem(demoRoleKey, state.demoSession.role)
      else window.sessionStorage?.removeItem(demoRoleKey)
    }
  } catch { /* Cookie-based restoration still works when storage is unavailable. */ }
}
export function startDemoSession(role) {
  if (state.entry?.generation === state.generation && state.entry.role === role) return state.entry.promise
  const entry = { generation: state.generation, role, promise: null }
  state.entry = entry
  entry.promise = api('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) }).then((result) => {
    if (entry.generation !== state.generation) throw new Error('El perfil demo ha cambiado. Vuelve a intentar la acción.')
    if (!result.sessionToken || result.user?.role !== role) throw new Error('La sesión demo no es válida. Elige de nuevo un perfil.')
    setDemoSession(result)
    return result
  }).finally(() => { if (state.entry === entry) state.entry = null })
  return entry.promise
}
export async function confirmPrivateSession(expectedUserId) {
  setDemoSession(null)
  try {
    const result = await api('/auth/me')
    if (result.user?.id !== expectedUserId) throw Object.assign(new Error('Cookie no actualizada'), { status: 401 })
    return result
  } catch (error) {
    if (error.status === 401) throw new Error('El servidor ha validado tus datos, pero no se ha podido confirmar la cookie de sesión. Permite las cookies de esta aplicación o ábrela en una pestaña propia. En producción utiliza HTTPS.')
    throw error
  }
}
function send(path, options = {}) {
  return fetch(`/api${path}`, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.demoSession ? { Authorization: `Bearer ${state.demoSession.token}` } : {}),
      ...options.headers,
    },
  })
}
async function renewDemo() {
  const startingGeneration = state.generation
  if (!state.renewal || state.renewal.generation !== startingGeneration) {
    const role = state.demoSession.role
    const attempt = { generation: startingGeneration, promise: null }
    state.renewal = attempt
    attempt.promise = (async () => {
      const response = await send('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) })
      if (!response.ok) throw new Error('No se pudo renovar la demo. Vuelve a entrar con un perfil de prueba.')
      const result = await response.json()
      if (state.generation !== startingGeneration) {
        const error = new Error('El perfil demo ha cambiado. Vuelve a intentar la acción.')
        error.code = 'DEMO_PROFILE_CHANGED'
        throw error
      }
      if (!result.sessionToken || result.user?.role !== role) throw new Error('La sesión demo no es válida. Vuelve a entrar con un perfil de prueba.')
      setDemoSession(result)
    })().finally(() => { if (state.renewal === attempt) state.renewal = null })
  }
  return state.renewal.promise
}
export async function api(path, options = {}, retry = true) {
  const sentGeneration = state.generation
  const sentToken = state.demoSession?.token
  const sentRole = state.demoSession?.role
  const response = await send(path, options)
  const protectedRequest = !/^\/(auth|setup|invitations\/(validate|accept))(\/|\?|$)/.test(path)
  if (response.status === 401 && state.demoSession && protectedRequest && retry && !options.signal?.aborted) {
    if (state.demoSession.role !== sentRole) throw new Error('El perfil demo ha cambiado. Vuelve a intentar la acción.')
    try { if (state.demoSession.token === sentToken) await renewDemo() } catch (error) {
      if (error.code !== 'DEMO_PROFILE_CHANGED' && state.generation === sentGeneration) {
        setDemoSession(null)
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('northstar:session-expired', { detail: error.message }))
      }
      throw error
    }
    return api(path, options, false)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(body.error || 'No se pudo completar la solicitud.')
    error.status = response.status
    if (response.status === 401 && protectedRequest && state.generation === sentGeneration && !options.signal?.aborted) {
      // A permanently rejected session must stop here, not renew on every new request.
      setDemoSession(null)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('northstar:session-expired', { detail: error.message }))
    }
    throw error
  }
  return response.status === 204 ? null : response.json()
}

// Aggregate screens and selectors explicitly read every bounded page. Lists do not.
export async function allRecords(resource, signal) {
  const items = []
  let page = 1
  let result
  do {
    result = await api(`/${resource}?page=${page}&pageSize=100`, { signal })
    items.push(...result.items)
    page += 1
  } while (page <= result.totalPages)
  return items
}
