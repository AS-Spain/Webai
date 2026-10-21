import { t } from '../lib/i18n.js'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

function Metric({ icon: Icon, label, value, detail, tone, trend }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon metric-${tone}`}><Icon size={17} /></span>
        <span className={`metric-trend ${trend === 'alert' ? 'trend-alert' : ''}`}>
          {trend === 'alert' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {trend === 'alert' ? 'Revisar' : 'Estable'}
        </span>
      </div>
      <p>{t(label)}</p>
      <div className="metric-bottom"><strong>{value}</strong><span>{t(detail)}</span></div>
    </article>
  )
}

export default Metric
