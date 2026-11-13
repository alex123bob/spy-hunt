import type { ReactNode } from 'react'
import { t } from '../i18n'

export function colorName(c: string): string {
  const key = `bots.color.${c.replace('#', '').toLowerCase()}`
  return t(key) !== key ? t(key) : c
}

export function PickGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div role="radiogroup" aria-label={label} className="picker">{children}</div>
    </div>
  )
}

/** One radio chip. `locked` keeps it focusable but unpickable, with the unlock hint as its title. */
export function Pick({ on, label, onPick, locked, hint, className, style, children }: {
  on: boolean; label: string; onPick: () => void; locked?: boolean; hint?: string
  className?: string; style?: React.CSSProperties; children?: ReactNode
}) {
  return (
    <button
      type="button" role="radio" aria-checked={on} aria-disabled={locked || undefined}
      aria-label={locked && hint ? `${label} — ${hint}` : label} title={locked ? hint : undefined}
      className={`btn chip ${on ? 'primary pick' : ''}${locked ? ' locked' : ''} ${className ?? ''}`}
      style={style} onClick={locked ? undefined : onPick}
    >
      {children}
      {locked && <span className="lock" aria-hidden="true">🔒</span>}
    </button>
  )
}
