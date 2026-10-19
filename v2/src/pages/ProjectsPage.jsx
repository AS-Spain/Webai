import { t } from '../lib/i18n.js'
import { FolderKanban, MoreHorizontal, Trash2 } from 'lucide-react'
import { formatDate, statusClass } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function ProjectsPage({ projects, tasks, canManage, onStatus, onDelete }) {
  return (
    <div className="project-card-grid">
      {projects.map((project, index) => {
        const projectTasks = tasks.filter((task) => task.project_id === project.id)
        const done = projectTasks.filter((task) => task.status === 'Done').length

        return (
          <article className="project-card" key={project.id}>
            <div className="project-card-top">
              <span className={`project-symbol symbol-${index + 1}`}><FolderKanban size={17} /></span>
              <div className="project-card-actions">
                <button
                  className="more-button"
                  title={canManage ? 'Cambiar estado' : 'Solo admin y manager pueden modificar proyectos'}
                  disabled={!canManage}
                  onClick={() => onStatus(project, project.status === 'At risk' ? 'On track' : 'At risk')}
                >
                  <MoreHorizontal size={17} />
                </button>
                <button
                  className="more-button"
                  title={canManage ? 'Eliminar proyecto' : 'Solo admin y manager pueden eliminar proyectos'}
                  aria-label={`Eliminar ${project.name}`}
                  disabled={!canManage}
                  onClick={() => onDelete(project)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="project-card-title">
              <h2>{project.name}</h2>
              <span className={`status-pill ${statusClass(project.status)}`}>{t(project.status)}</span>
            </div>
            <p className="project-card-owner"> {t("Led by")} <strong>{project.owner}</strong></p>
            <div className="project-progress-heading"><span> {t("Progress")} </span><strong>{project.progress}%</strong></div>
            <div className="progress-track project-large-progress">
              <span style={{ width: `${project.progress}%`, backgroundColor: project.color }} />
            </div>
            <div className="project-card-foot">
              <span>{done}/{projectTasks.length} tareas completadas</span>
              <span>Vence el {formatDate(project.due_date)}</span>
            </div>
          </article>
        )
      })}
      {!projects.length && <EmptyState title={t("No projects yet")} text={t("Create a project to organize the work.")} />}
    </div>
  )
}

export default ProjectsPage
