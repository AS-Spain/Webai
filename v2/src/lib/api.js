// Demo tokens live only in this module's memory, never local/sessionStorage.
// The normal application never receives a bearer session token.
let demoSession = null
let renewal = null
let generation = 0
export function setDemoSession(result) {
  generation += 1
  demoSession = result?.sessionToken ? { token: result.sessionToken, role: result.user.role } : null
}
function send(path, options = {}) {
  return fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(demoSession ? { Authorization: `Bearer ${demoSession.token}` } : {}),
      ...options.headers,
    },
  })
}
async function renewDemo() {
  const startingGeneration = generation
  if (!renewal || renewal.generation !== startingGeneration) {
    const role = demoSession.role
    const attempt = { generation: startingGeneration, promise: null }
    renewal = attempt
    attempt.promise = (async () => {
      const response = await send('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) })
      if (!response.ok) throw new Error('No se pudo renovar la demo. Vuelve a entrar con un perfil de prueba.')
      const result = await response.json()
      if (generation !== startingGeneration) {
        const error = new Error('El perfil demo ha cambiado. Vuelve a intentar la acción.')
        error.code = 'DEMO_PROFILE_CHANGED'
        throw error
      }
      if (!result.sessionToken || result.user?.role !== role) throw new Error('La sesión demo no es válida. Vuelve a entrar con un perfil de prueba.')
      setDemoSession(result)
    })().finally(() => { if (renewal === attempt) renewal = null })
  }
  return renewal.promise
}
export async function api(path, options = {}, retry = true) {
  const sentGeneration = generation
  const sentToken = demoSession?.token
  const sentRole = demoSession?.role
  const response = await send(path, options)
  const protectedRequest = !/^\/(auth|setup|invitations\/(validate|accept))(\/|\?|$)/.test(path)
  if (response.status === 401 && demoSession && protectedRequest && retry && !options.signal?.aborted) {
    if (demoSession.role !== sentRole) throw new Error('El perfil demo ha cambiado. Vuelve a intentar la acción.')
    try { if (demoSession.token === sentToken) await renewDemo() } catch (error) {
      if (error.code !== 'DEMO_PROFILE_CHANGED' && generation === sentGeneration) {
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
    if (response.status === 401 && protectedRequest && generation === sentGeneration && !options.signal?.aborted) {
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
