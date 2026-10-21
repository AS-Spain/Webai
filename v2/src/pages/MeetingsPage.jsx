import { t } from '../lib/i18n.js'
import { Compass, MoreHorizontal, Users } from 'lucide-react'
import { formatDate, initials } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function MeetingsPage({ meetings, canDelete, onDelete }) {
  return (
    <div className="meeting-list">
      {meetings.map((meeting) => (
        <article className="meeting-row panel" key={meeting.id}>
          <div className="meeting-date-block">
            <span>{formatDate(meeting.starts_at, { month: 'short' })}</span>
            <strong>{formatDate(meeting.starts_at, { day: '2-digit' })}</strong>
            <small>{formatDate(meeting.starts_at, { weekday: 'short' })}</small>
          </div>
          <div className="meeting-main">
            <span className="panel-kicker">{formatDate(meeting.starts_at, { hour: '2-digit', minute: '2-digit' })} · {meeting.duration} MIN</span>
            <h2>{meeting.title}</h2>
            <p>{meeting.agenda || 'Sin agenda'}</p>
            <div className="meeting-meta">
              <span><Users size={13} />{(meeting.attendees || []).length} participants</span>
              <span><Compass size={13} />{meeting.location}</span>
            </div>
          </div>
          <div className="meeting-attendees">
            <div className="avatar-stack">
              {(meeting.attendees || []).map((person, index) => (
                <span className={`avatar avatar-${index % 3}`} key={person} title={person}>
                  {initials(person)}
                </span>
              ))}
            </div>
            <span>{(meeting.attendees || []).join(', ')}</span>
          </div>
          <button
            className="row-action"
            aria-label={`Eliminar ${meeting.title}`}
            title={canDelete ? 'Eliminar reunión' : 'Solo admin y manager pueden eliminar reuniones'}
            disabled={!canDelete}
            onClick={() => onDelete(meeting)}
          >
            <MoreHorizontal size={17} />
          </button>
        </article>
      ))}
      {!meetings.length && <EmptyState title={t("No meetings scheduled")} text={t("Add a meeting to bring the team together.")} />}
    </div>
  )
}

export default MeetingsPage
