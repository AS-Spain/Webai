import { formatDate } from './format.js'
import { t } from './i18n.js'

// Deliberately deterministic and read-only: this function never calls a provider or writes data.
export function answerQuestion(question, { tasks, projects, issues }, todayKey) {
  const query = question.toLowerCase()
  if (/proyect|project|plazo|deadline/.test(query)) {
    const atRisk = projects.filter((project) => project.status !== 'Complete' && (['At risk', 'Behind'].includes(project.status) || project.progress < 40))
    return atRisk.length
      ? `Hay ${atRisk.length} proyecto(s) que conviene revisar: ${atRisk.map((project) => `${project.name} (${project.progress}% completado, fecha límite ${formatDate(project.due_date)})`).join('; ')}. Es una señal sencilla de progreso, no una predicción.`
      : 'No hay proyectos con señales de riesgo según estas reglas. El estado lo mantiene tu equipo; no es una predicción de IA.'
  }
  if (/inciden|issue|problem/.test(query)) {
    const open = issues.filter((issue) => issue.status !== 'Resolved')
    return open.length
      ? `Hay ${open.length} incidencia(s) sin resolver: ${open.map((issue) => `${issue.title} (gravedad: ${t(issue.severity)}, responsable: ${issue.owner})`).join('; ')}. Las sugerencias se basan en reglas y requieren revisión humana.`
      : 'No hay incidencias sin resolver en el espacio.'
  }
  if (!/atenci[oó]n|attention|hoy|today|tarea|task|prioridad|resumen/.test(query)) {
    return 'Puedo resumir tareas vencidas, proyectos en riesgo e incidencias abiertas. Prueba una de las preguntas sugeridas. No utilizo IA generativa ni puedo modificar datos.'
  }
  const overdue = tasks.filter((task) => task.status !== 'Done' && task.due_date < todayKey).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const critical = issues.filter((issue) => issue.severity === 'Critical' && issue.status !== 'Resolved')
  return `Empieza por ${critical.length} incidencia(s) crítica(s) y ${overdue.length} tarea(s) vencida(s). ${critical[0] ? `La primera incidencia crítica es «${critical[0].title}», a cargo de ${critical[0].owner}.` : 'No hay incidencias críticas abiertas.'} ${overdue[0] ? `La tarea vencida más antigua es «${overdue[0].title}».` : 'No hay tareas vencidas.'}`
}
