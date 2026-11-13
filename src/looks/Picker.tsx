import type { ReactNode } from 'react'
import { t } from '../i18n'

export function colorName(c: string): string {
  const key = `bots.color.${c.replace('#', '').toLowerCase()}`
  return t(key) !== key ? t(key) : c
}

export function PickGroup({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div role="radiogroup" aria-label={label} className="picker">{children}</div>
      <p className="pick-note" role="status" aria-live="polite">{note ? <>🔒 {note}</> : null}</p>
    </div>
  )
}

/**
 * One radio chip. A `locked` chip stays focusable but unpickable; tapping it calls `onLocked`
 * with its hint so the screen can show why (phones have no hover).
 */
export function Pick({ on, label, onPick, locked, hint, onLocked, className, style, children }: {
  on: boolean; label: string; onPick: () => void; locked?: boolean; hint?: string
  onLocked?: (hint: string) => void
  className?: string; style?: React.CSSProperties; children?: ReactNode
}) {
  return (
    <button
      type="button" role="radio" aria-checked={on} aria-disabled={locked || undefined}
      aria-label={locked && hint ? `${label} — ${hint}` : label} title={locked ? hint : undefined}
      className={`btn chip ${on ? 'primary pick' : ''}${locked ? ' locked' : ''} ${className ?? ''}`}
      style={style} onClick={locked ? () => hint && onLocked?.(hint) : onPick}
    >
      {children}
      {locked && <span className="lock" aria-hidden="true">🔒</span>}
    </button>
  )
}
