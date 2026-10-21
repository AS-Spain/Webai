import { t } from '../lib/i18n.js'
import { Activity, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, FolderKanban, ListTodo, Plus, ShieldAlert } from 'lucide-react'
import { formatDate, initials, statusClass, timeAgo } from '../lib/format.js'
import { useClock } from '../hooks/useClock.js'
import Metric from '../components/Metric.jsx'
import EmptyState from '../components/EmptyState.jsx'

function Dashboard({ workspace, onNavigate, onCreate }) {
  const { todayKey } = useClock()
  const overview = workspace.overview || {}
  const counts = overview.counts || {
    tasks: 0, overdue: 0, projects: 0, meetings: 0, issues: 0, critical: 0,
  }
  const projects = overview.projects || workspace.projects || []
  const tasks = overview.tasks || workspace.tasks || []
  const meetings = overview.meetings || workspace.meetings || []
  const issues = overview.issues || workspace.issues || []
  const activities = overview.activities || []
  const urgent = issues
    .filter((issue) => issue.severity === 'Critical' || issue.severity === 'High')
    .slice(0, 3)

  return (
    <div className="dashboard-content">
      <div className="metric-grid">
        <Metric icon={FolderKanban} label={t("Active projects")} value={counts.projects} detail={t("Across your workspace")} tone="green" trend="steady" />
        <Metric icon={ListTodo} label={t("Open tasks")} value={counts.tasks} detail={counts.overdue ? `${counts.overdue} fuera de plazo` : t("No overdue tasks")} tone="orange" trend={counts.overdue ? 'alert' : 'steady'} />
        <Metric icon={CalendarDays} label={t("Upcoming meetings")} value={counts.meetings} detail={t("Next 7 days")} tone="blue" trend="steady" />
        <Metric icon={ShieldAlert} label={t("Open issues")} value={counts.issues} detail={counts.critical ? `${counts.critical} críticas por revisar` : t("No critical incidents")} tone="red" trend={counts.critical ? 'alert' : 'steady'} />
      </div>

      <div className="dashboard-grid dashboard-main-grid">
        <section className="panel projects-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker"> {t("DELIVERY")} </span>
              <h2> {t("Projects in motion")} </h2>
            </div>
            <button className="text-action" onClick={() => onNavigate('projects')}> {t("All projects")} <ArrowRight size={14} />
            </button>
          </div>

          <div className="project-list">
            {projects.slice(0, 3).map((project, index) => (
              <div className="project-row" key={project.id}>
                <div className={`project-symbol symbol-${index + 1}`}><FolderKanban size={16} /></div>
                <div className="project-info">
                  <div className="project-title-row">
                    <strong>{project.name}</strong>
                    <span className={`status-pill ${statusClass(project.status)}`}>{t(project.status)}</span>
                  </div>
                  <div className="project-subline">
                    <span>{project.owner}</span>
                    <span>Vence el {formatDate(project.due_date)}</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${project.progress}%`, backgroundColor: project.color }} />
                  </div>
                </div>
                <span className="progress-label">{project.progress}%</span>
              </div>
            ))}
          </div>

          {!projects.length && <EmptyState title={t("No projects yet")} text={t("Create a project to get your team moving.")} />}

          <div className="project-panel-footer">
            <span><i className="legend-green" /> {t("On track")} <i className="legend-amber" /> {t("At risk")} </span>
            <button className="quiet-button" onClick={() => onNavigate('projects')}> {t("View portfolio")} </button>
          </div>
        </section>

        <section className="attention-panel">
          <div className="attention-topline">
            <span className="attention-symbol"><Activity size={16} /></span>
            <span> {t("ATTENTION NEEDED")} </span>
            <span className="attention-count">{urgent.length}</span>
          </div>
          <h2> {t("A few things")} <br /> {t("need a closer look.")} </h2>
          <p> {t("Your team can keep momentum with a quick check-in on these items.")} </p>

          <div className="attention-list">
            {urgent.map((issue) => (
              <button className="attention-item" key={issue.id} onClick={() => onNavigate('issues')}>
                <span className={`severity-pin severity-${issue.severity.toLowerCase()}`} />
                <span>
                  <strong>{issue.title}</strong>
                  <small>{t(issue.category)} · {issue.owner}</small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
            {!urgent.length && (
              <div className="attention-clear">
                <CheckCircle2 size={17} /> Nothing urgent is waiting.
              </div>
            )}
          </div>

          <button className="attention-link" onClick={() => onNavigate('issues')}>
            Ver incidencias <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <div className="dashboard-grid dashboard-lower-grid">
        <section className="panel task-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker"> {t("YOUR FOCUS")} </span>
              <h2> {t("Tasks to keep moving")} </h2>
            </div>
            <button className="icon-button small-icon" title={t("Create a task")} aria-label={t("Create a task")} onClick={onCreate}>
              <Plus size={17} />
            </button>
          </div>

          <div className="compact-task-list">
            {tasks.slice(0, 5).map((task) => (
              <div className="compact-task" key={task.id}>
                <span className={`task-check ${task.status === 'Done' ? 'checked' : ''}`}>
                  {task.status === 'Done' && <Check size={11} />}
                </span>
                <span className="compact-task-title">
                  {task.title}<small>{task.assignee}</small>
                </span>
                <span className={`priority-label priority-${task.priority.toLowerCase()}`}>{t(task.priority)}</span>
                <span className={`task-due ${task.due_date < todayKey && task.status !== 'Done' ? 'due-late' : ''}`}>
                  {formatDate(task.due_date)}
                </span>
              </div>
            ))}
          </div>
          <button className="panel-bottom-action" onClick={() => onNavigate('tasks')}> {t("View all tasks")} <ArrowRight size={14} />
          </button>
        </section>

        <section className="panel agenda-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker"> {t("ON THE CALENDAR")} </span>
              <h2> {t("Coming up")} </h2>
            </div>
            <button className="text-action" onClick={() => onNavigate('calendar')}> {t("Open calendar")} <ArrowRight size={14} />
            </button>
          </div>

          <div className="agenda-list">
            {meetings.slice(0, 3).map((meeting) => (
              <div className="agenda-item" key={meeting.id}>
                <div className="agenda-date">
                  <strong>{formatDate(meeting.starts_at, { day: '2-digit' })}</strong>
                  <small>{formatDate(meeting.starts_at, { month: 'short' })}</small>
                </div>
                <div className="agenda-detail">
                  <strong>{meeting.title}</strong>
                  <span>
                    <Clock3 size={12} />
                    {formatDate(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })} · {meeting.duration} min · {meeting.location}
                  </span>
                </div>
                <div className="avatar-stack">
                  {(meeting.attendees || []).slice(0, 3).map((person, index) => (
                    <span className={`avatar avatar-tiny avatar-${index}`} key={person}>
                      {initials(person)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!meetings.length && <EmptyState title={t("Calendar is clear")} text={t("Schedule a meeting to get started.")} />}
          <button className="panel-bottom-action" onClick={() => onNavigate('meetings')}>
            Ver reuniones <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker"> {t("TEAM PULSE")} </span>
            <h2> {t("Recent activity")} </h2>
          </div>
          <span className="activity-live"><i /> {t("LIVE")} </span>
        </div>

        <div className="activity-strip">
          {activities.slice(0, 4).map((activity, index) => (
            <div className="activity-entry" key={activity.id}>
              <span className={`activity-avatar activity-${index}`}>{initials(activity.actor || 'NW')}</span>
              <span>
                <strong>{activity.actor || t("Workspace")}</strong>
                <small>{activity.summary}</small>
              </span>
              <time>{timeAgo(activity.created_at)}</time>
            </div>
          ))}
          {!activities.length && <span className="muted-copy"> {t("No recent activity.")} </span>}
        </div>
      </section>
    </div>
  )
}

export default Dashboard
