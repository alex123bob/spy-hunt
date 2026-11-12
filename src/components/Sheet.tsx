import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Sheet({ label, onClose, children, dismissible = true }: { label: string; onClose: () => void; children: ReactNode; dismissible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => prev?.focus?.()
  }, [])
  useEffect(() => {
    if (!dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismissible])
  return (
    <div className="sheet-backdrop" onClick={(e) => { if (dismissible && e.target === e.currentTarget) onClose() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="sheet">
        {children}
      </div>
    </div>
  )
}
