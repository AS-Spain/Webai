import { t } from '../lib/i18n.js'
import { ArrowDownRight, CalendarDays, ChevronDown } from 'lucide-react'
import { useClock } from '../hooks/useClock.js'

function ReportsPage({ workspace }) {
  const { todayKey } = useClock()
  const { tasks, projects, issues } = workspace
  const complete = tasks.filter((task) => task.status === 'Done').length
  const overdue = tasks.filter((task) => task.status !== 'Done' && task.due_date < todayKey).length

  const exportCsv = () => {
    const rows = [
      [t("Type"), t("Title"), t("Status"), t("Owner"), t("Due date")],
      ...tasks.map((task) => [t("Task"), task.title, task.status, task.assignee, task.due_date]),
      ...projects.map((project) => [t("Project"), project.name, project.status, project.owner, project.due_date]),
      ...issues.map((issue) => [t("Issue"), issue.title, issue.status, issue.owner, issue.created_at?.slice(0, 10)]),
    ]

    const csv = rows
      .map((row) => row.map((value) => `"${String(/^[=+@\-\t\r\n]/.test(String(value ?? '')) ? `'${value}` : (value ?? '')).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'northstar-operations-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const taskBars = [
    ['To do', tasks.filter((task) => task.status === 'To do').length, '#d5a566'],
    ['In progress', tasks.filter((task) => task.status === 'In progress').length, '#668c83'],
    ['Done', complete, '#7c9a6a'],
  ]

  return (
    <>
      <div className="report-toolbar">
        <span className="report-period"><CalendarDays size={14} /> Todos los registros <ChevronDown size={14} /></span>
        <button className="button button-outline" onClick={exportCsv}><ArrowDownRight size={15} /> {t("Export CSV")} </button>
      </div>

      <div className="report-kpis">
        <article className="report-kpi">
          <span> {t("TASKS COMPLETED")} </span>
          <strong>{complete}<small> / {tasks.length}</small></strong>
          <div className="report-kpi-foot"><span> {t("Current workspace tasks")} </span><i className="report-kpi-green" /></div>
        </article>
        <article className="report-kpi">
          <span> {t("PROJECTS AT RISK")} </span>
          <strong>{projects.filter((project) => project.status === 'At risk' || project.status === 'Behind').length}</strong>
          <div className="report-kpi-foot"><span> {t("Owner status")} </span><i className="report-kpi-amber" /></div>
        </article>
        <article className="report-kpi">
          <span> {t("OVERDUE TASKS")} </span>
          <strong>{overdue}</strong>
          <div className="report-kpi-foot"><span> {t("Open and past due date")} </span><i className="report-kpi-red" /></div>
        </article>
        <article className="report-kpi">
          <span> {t("OPEN ISSUES")} </span>
          <strong>{issues.filter((issue) => issue.status !== 'Resolved').length}</strong>
          <div className="report-kpi-foot"><span> {t("Across all categories")} </span><i className="report-kpi-blue" /></div>
        </article>
      </div>

      <div className="report-charts">
        <section className="panel report-chart">
          <div className="panel-heading">
            <div><span className="panel-kicker"> {t("WORKLOAD SNAPSHOT")} </span><h2> {t("Task status")} </h2></div>
            <span className="chart-caption">{tasks.length} tareas en total</span>
          </div>

          <div className="bar-chart">
            {taskBars.map(([label, value, color]) => (
              <div className="bar-chart-row" key={t(label)}>
                <span>{t(label)}</span>
                <div className="bar-chart-track">
                  <i style={{
                    width: `${tasks.length ? Math.max(value / tasks.length * 100, value ? 7 : 0) : 0}%`,
                    backgroundColor: color,
                  }} />
                </div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="chart-footnote"> {t("Counts reflect records currently in the workspace.")} </p>
        </section>

        <section className="panel report-chart">
          <div className="panel-heading">
            <div><span className="panel-kicker"> {t("PROJECT PORTFOLIO")} </span><h2> {t("Progress by project")} </h2></div>
            <span className="chart-caption"> {t("Live status")} </span>
          </div>
          <div className="report-project-list">
            {projects.map((project) => (
              <div className="report-project-row" key={project.id}>
                <span>{project.name}</span>
                <div className="progress-track">
                  <i style={{ width: `${project.progress}%`, backgroundColor: project.color }} />
                </div>
                <strong>{project.progress}%</strong>
              </div>
            ))}
          </div>
          <p className="chart-footnote"> {t("Progress is team-maintained; no forecast model is connected.")} </p>
        </section>
      </div>
    </>
  )
}

export default ReportsPage
