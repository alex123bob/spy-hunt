import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Bubble } from './Bubble'

/**
 * A small icon that explains itself in a bubble on tap (phones have no hover), on mouse
 * hover, or on keyboard focus + Enter.
 */
export function TapTip({ label, children, className, style }: {
  label: string; children: ReactNode; className?: string; style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)

  return (
    <span className="tip">
      <button
        ref={btn} type="button" className={`tip-btn ${className ?? ''}`} style={style} aria-label={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false) }}
      >
        {children}
      </button>
      {open && <Bubble anchor={btn} text={label} onClose={() => setOpen(false)} />}
    </span>
  )
}
