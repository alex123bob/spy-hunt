export function Loader({ label }: { label: string }) {
  return (
    <div className="loader" role="status">
      <span className="eye" aria-hidden />
      <span className="dots" aria-hidden><i /><i /><i /></span>
      <span className="muted">{label}</span>
    </div>
  )
}
