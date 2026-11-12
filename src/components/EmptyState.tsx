import type { ReactNode } from 'react'

export function EmptyState({ emoji, title, body, role, children }: { emoji: string; title: string; body?: string; role?: string; children?: ReactNode }) {
  return (
    <div className="empty-state" role={role}>
      <span className="spot" aria-hidden>{emoji}</span>
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {children && <div className="actions">{children}</div>}
    </div>
  )
}
