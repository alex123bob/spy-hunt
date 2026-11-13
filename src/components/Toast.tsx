export function Toast({ text }: { text: string }) {
  if (!text) return null
  return <p role="status" className="toast">{text}</p>
}
