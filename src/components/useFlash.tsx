import { useCallback, useRef, useState } from 'react'
import { Bubble } from './Bubble'

/**
 * A short confirmation ("Copied", "Look saved") that pops in a bubble above the button that
 * triggered it and fades out on its own. Attach `ref` to the button; call `flash(text)`.
 * Calling again with new text restarts the timer.
 */
export function useFlash<T extends HTMLElement = HTMLButtonElement>(ms = 2200) {
  const ref = useRef<T>(null)
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null)
  const flash = useCallback((text: string) => setMsg((m) => ({ text, n: (m?.n ?? 0) + 1 })), [])
  const node = msg
    ? <Bubble key={msg.n} anchor={ref} text={msg.text} ms={ms} live onClose={() => setMsg(null)} />
    : null
  return { ref, flash, node, text: msg?.text ?? '' }
}
