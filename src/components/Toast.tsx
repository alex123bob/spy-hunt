import { useEffect, useState } from 'react'

/** How long a toast stays up before hiding itself. */
export const TOAST_MS = 2500

/**
 * A short confirmation at the bottom of the screen. It hides itself after `ms`; setting
 * `text` again (or bumping `nonce` for the same text) shows it again.
 */
export function Toast({ text, nonce, ms = TOAST_MS }: { text: string; nonce?: number; ms?: number }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    setShown(text)
    if (!text) return
    const id = setTimeout(() => setShown(''), ms)
    return () => clearTimeout(id)
  }, [text, nonce, ms])
  if (!shown) return null
  return <p role="status" className="toast">{shown}</p>
}
