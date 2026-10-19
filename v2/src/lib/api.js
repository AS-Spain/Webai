export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(body.error || 'No se pudo completar la solicitud.')
    error.status = response.status
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
