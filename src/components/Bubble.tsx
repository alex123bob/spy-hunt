import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8 // space between the anchor and the bubble's tail
const EDGE = 8 // keep this far from the screen edges

/**
 * A small speech bubble pinned above `anchor` (below it if there's no room), rendered into
 * <body> so no card clips it, and nudged sideways to stay on screen. The tail keeps pointing
 * at the anchor. Closes on an outside tap, Escape, scroll, or after `ms`.
 */
export function Bubble({ anchor, text, onClose, ms = 3000 }: {
  anchor: RefObject<HTMLElement | null>; text: string; onClose: () => void; ms?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; tail: number; below: boolean } | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect()
    const b = ref.current?.getBoundingClientRect()
    if (!a || !b) return
    const vw = document.documentElement.clientWidth
    const mid = a.left + a.width / 2
    const left = Math.min(Math.max(EDGE, mid - b.width / 2), Math.max(EDGE, vw - EDGE - b.width))
    const below = a.top - GAP - b.height < EDGE
    const top = below ? a.bottom + GAP : a.top - GAP - b.height
    setPos({ left, top, tail: Math.min(Math.max(12, mid - left), b.width - 12), below })
  }, [anchor, text])

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) close.current()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    const away = () => close.current()
    const timer = setTimeout(away, ms)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', away, { capture: true, passive: true })
    window.addEventListener('resize', away)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', away, { capture: true })
      window.removeEventListener('resize', away)
    }
  }, [anchor, ms, text])

  return createPortal(
    <span
      ref={ref} role="tooltip" className={`hint-bubble${pos?.below ? ' below' : ''}`}
      style={pos
        ? { left: pos.left, top: pos.top, '--tail': `${pos.tail}px` } as React.CSSProperties
        : { left: 0, top: 0, visibility: 'hidden' }}
    >
      {text}
    </span>,
    document.body,
  )
}
