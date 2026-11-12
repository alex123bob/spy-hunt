import { Logo } from './Logo'

export function Loader({ label }: { label: string }) {
  return (
    <div className="loader" role="status">
      <Logo size="s" withText={false} />
      <span className="dots" aria-hidden><i /><i /><i /></span>
      <span className="muted">{label}</span>
    </div>
  )
}
