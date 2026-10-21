import { t } from '../lib/i18n.js'
import { CalendarDays, Compass, MoreHorizontal, Users } from 'lucide-react'
import { formatDate, statusClass } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function EventsPage({ events, canDelete, onDelete }) {
  return (
    <div className="event-grid">
      {events.map((event, index) => (
        <article className={`event-card event-card-${index % 2}`} key={event.id}>
          <div className="event-card-art">
            <span className="event-date-chip"><CalendarDays size={13} />{formatDate(event.starts_at, { month: 'short', day: 'numeric' })}</span>
            <span className="event-art-code">{String(index + 1).padStart(2, '0')} / 24</span>
            <div className="event-art-lines" />
          </div>
          <div className="event-card-body">
            <div className="event-heading">
              <h2>{event.title}</h2>
              <button
                className="more-button"
                title={canDelete ? 'Eliminar evento' : 'Solo admin y manager pueden eliminar eventos'}
                disabled={!canDelete}
                onClick={() => onDelete(event)}
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
            <div className="event-details">
              <span><Compass size={14} />{event.location}</span>
              <span><Users size={14} />{event.attendees} attending</span>
            </div>
            <div className="event-foot">
              <span className={`status-pill ${statusClass(event.status)}`}>{t(event.status)}</span>
              <span>{formatDate(event.starts_at, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </article>
      ))}
      {!events.length && <EmptyState title={t("No events planned")} text={t("Create an event to coordinate a workshop or team gathering.")} />}
    </div>
  )
}

export default EventsPage
