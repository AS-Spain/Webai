import { Compass } from 'lucide-react'

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <span><Compass size={18} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

export default EmptyState
