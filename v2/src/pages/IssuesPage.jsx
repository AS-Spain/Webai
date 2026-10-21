import { t } from '../lib/i18n.js'
import { CheckCircle2, Clock3, ShieldAlert, Sparkles } from 'lucide-react'
import { initials, statusClass } from '../lib/format.js'
import EmptyState from '../components/EmptyState.jsx'

function IssuesPage({ issues, filter, onFilterChange, summary, canUpdate, onStatus }) {
  const visible = issues

  return (
    <>
      <div className="issue-summary-strip">
        <div>
          <span className="issue-summary-icon issue-red"><ShieldAlert size={16} /></span>
          <strong>{summary?.critical || 0}</strong>
          <small> {t("Critical")} </small>
        </div>
        <div>
          <span className="issue-summary-icon issue-amber"><Clock3 size={16} /></span>
          <strong>{summary?.investigating || 0}</strong>
          <small> {t("Investigating")} </small>
        </div>
        <div>
          <span className="issue-summary-icon issue-green"><CheckCircle2 size={16} /></span>
          <strong>{summary?.resolved || 0}</strong>
          <small> {t("Resolved")} </small>
        </div>
        <div className="issue-summary-note">
          <Sparkles size={15} /> {t("Suggested next steps are rule-based. Review before acting.")} </div>
      </div>

      <section className="panel data-panel">
        <div className="list-toolbar">
          <div className="segmented-control">
            {['Open', 'Investigating', 'Resolved', 'All'].map((option) => (
              <button
                className={filter === option ? 'selected' : ''}
                key={t(option)}
                onClick={() => onFilterChange(option)}
              >
                {t(option)}
              </button>
            ))}
          </div>
          <span className="record-count">{visible.length} issues</span>
        </div>

        <div className="issue-list">
          {visible.map((issue) => (
            <article className="issue-row" key={issue.id}>
              <span className={`issue-severity-bar severity-bar-${issue.severity.toLowerCase()}`} />
              <div className="issue-main">
                <div className="issue-title-line">
                  <span className={`severity-label severity-${issue.severity.toLowerCase()}`}>{t(issue.severity)}</span>
                  <span className="issue-category">{t(issue.category)}</span>
                </div>
                <h3>{issue.title}</h3>
                <p>{issue.description}</p>
                <div className="issue-suggestion">
                  <Sparkles size={14} />
                  <span><strong> {t("Suggested next step")} </strong> {issue.recommendation || 'Review the available context with the issue owner.'}</span>
                </div>
              </div>
              <div className="issue-owner">
                <span className="avatar avatar-mini">{initials(issue.owner)}</span>
                <span><small> {t("OWNER")} </small><strong>{issue.owner}</strong></span>
              </div>
              <div className="issue-impact">
                <small> {t("EST. IMPACT")} </small>
                <strong>{issue.impact ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(issue.impact) : 'Unestimated'}</strong>
              </div>
              <select
                className={`inline-select status-${statusClass(issue.status)}`}
                value={t(issue.status)}
                onChange={(event) => onStatus(issue, event.target.value)}
                aria-label={`Estado de ${issue.title}`}
                disabled={!canUpdate}
              >
                <option value="Open"> {t("Open")} </option>
                <option value="Investigating"> {t("Investigating")} </option>
                <option value="Resolved"> {t("Resolved")} </option>
              </select>
            </article>
          ))}
          {!visible.length && <EmptyState title={t("No issues in this view")} text={t("Switch the filter to review other incidents.")} />}
        </div>
      </section>
    </>
  )
}

export default IssuesPage
