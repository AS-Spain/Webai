import { t } from '../lib/i18n.js'
import { Check, MoreHorizontal } from 'lucide-react'
import { formatDate, initials, statusClass } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function TasksPage({ tasks, filter, onFilterChange, projects, canUpdate, canDelete, onStatus, onDelete }) {
  const filtered = tasks

  return (
    <section className="panel data-panel">
      <div className="list-toolbar">
        <div className="segmented-control">
          {['All tasks', 'To do', 'In progress', 'Done'].map((option) => (
            <button
              className={filter === option ? 'selected' : ''}
              key={t(option)}
              onClick={() => onFilterChange(option)}
            >
              {t(option)}
            </button>
          ))}
        </div>
        <span className="record-count">{filtered.length} registros</span>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th> {t("Task")} </th><th> {t("Project")} </th><th> {t("Assignee")} </th><th> {t("Priority")} </th>
              <th> {t("Due date")} </th><th> {t("Status")} </th><th aria-label={t("Actions")} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr key={task.id}>
                <td>
                  <span className={`task-check table-check ${task.status === 'Done' ? 'checked' : ''}`}>
                    {task.status === 'Done' && <Check size={11} />}
                  </span>
                  <strong>{task.title}</strong>
                </td>
                <td>{projects.find((project) => project.id === task.project_id)?.name || '—'}</td>
                <td>
                  <span className="table-person">
                    <span className="avatar avatar-mini">{initials(task.assignee)}</span>
                    {task.assignee}
                  </span>
                </td>
                <td><span className={`priority-label priority-${task.priority.toLowerCase()}`}>{t(task.priority)}</span></td>
                <td>{formatDate(task.due_date)}</td>
                <td>
                  <select
                    className={`inline-select status-${statusClass(task.status)}`}
                    value={t(task.status)}
                    onChange={(event) => onStatus(task, event.target.value)}
                    aria-label={`Estado de ${task.title}`}
                    disabled={!canUpdate}
                  >
                    <option value="To do"> {t("To do")} </option>
                    <option value="In progress"> {t("In progress")} </option>
                    <option value="Done"> {t("Done")} </option>
                  </select>
                </td>
                <td>
                  <button
                    className="row-action"
                    aria-label={`Eliminar ${task.title}`}
                    title={canDelete ? 'Eliminar tarea' : 'Solo admin y manager pueden eliminar tareas'}
                    disabled={!canDelete}
                    onClick={() => onDelete(task)}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <EmptyState title={t("Nothing here yet")} text={t("Try another filter or create a task.")} />}
      </div>
    </section>
  )
}

export default TasksPage
