export function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return 'Sin fecha'

  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return new Intl.DateTimeFormat('es-ES', options).format(date)
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function statusClass(status = '') {
  return status.toLowerCase().replaceAll(' ', '-')
}

export function automationTrigger(key) {
  return ({
    overdue_tasks: 'Una tarea vence',
    critical_issues: 'Se comunica una incidencia crítica',
    meeting_followup: 'Se solicita seguimiento de una reunión',
  })[key] || key
}

export function timeAgo(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))

  if (minutes < 1) return 'Ahora mismo'
  if (minutes < 60) return `Hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`

  return `Hace ${Math.floor(hours / 24)} días`
}
