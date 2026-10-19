import { t } from '../lib/i18n.js'
import { formatDate } from '../lib/format.js'
import { localDateKey } from '../lib/dates.js'
import { useClock } from '../hooks/useClock.js'

function CalendarPage({ meetings, events, tasks }) {
  const { todayKey, calendarDays } = useClock()
  const days = calendarDays
  const entries = [
    ...meetings.map((item) => ({ ...item, kind: 'meeting', date: item.starts_at })),
    ...events.map((item) => ({ ...item, kind: 'event', date: item.starts_at })),
    ...tasks.filter((item) => item.due_date).map((item) => ({ ...item, kind: 'task', date: item.due_date })),
  ]

  return (
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div>
          <span className="panel-kicker"> {t("THIS WEEK")} </span>
          <h2>{formatDate(days[0], { month: 'long', day: 'numeric' })} — {formatDate(days[6], { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
        </div>
        <span className="calendar-key">
          <i className="key-meeting" /> {t("Meeting")} <i className="key-task" /> {t("Task")} <i className="key-event" /> {t("Event")} </span>
      </div>
      <div className="calendar-week">
        {days.map((date) => {
          const key = localDateKey(date)
          const items = entries.filter((item) => (item.kind === 'task' ? item.date : localDateKey(new Date(item.date))) === key)

          return (
            <div className={`calendar-day ${key === todayKey ? 'calendar-today' : ''}`} key={key}>
              <div className="calendar-day-head">
                <span>{formatDate(date, { weekday: 'short' })}</span>
                <strong>{formatDate(date, { day: '2-digit' })}</strong>
              </div>
              <div className="calendar-day-items">
                {items.map((item) => (
                  <div className={`calendar-chip chip-${item.kind}`} key={`${item.kind}-${item.id}`}>
                    <small>{item.kind === 'task' ? 'VENCE' : formatDate(item.date, { hour: '2-digit', minute: '2-digit' })}</small>
                    <strong>{item.title}</strong>
                  </div>
                ))}
                {!items.length && <span className="empty-day">—</span>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default CalendarPage
