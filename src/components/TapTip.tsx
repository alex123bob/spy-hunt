import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * A small icon that explains itself on tap (phones have no hover), on mouse hover, or on
 * keyboard focus + Enter. The bubble closes on an outside tap, Escape, or after a few seconds.
 */
export function TapTip({ label, children, className, style }: {
  label: string; children: ReactNode; className?: string; style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const timer = setTimeout(() => setOpen(false), 3000)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <span className="tip" ref={root}>
      <button
        type="button" className={`tip-btn ${className ?? ''}`} style={style} aria-label={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false) }}
      >
        {children}
      </button>
      {open && <span role="tooltip" className="tip-bubble">{label}</span>}
    </span>
  )
}
