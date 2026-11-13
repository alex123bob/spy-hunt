import { useRef, useState, type ReactNode } from 'react'
import { Bubble } from '../components/Bubble'
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

/**
 * One radio chip. A `locked` chip stays focusable but unpickable; tapping it pops its `hint`
 * in a bubble above it (phones have no hover).
 */
export function Pick({ on, label, onPick, locked, hint, className, style, children }: {
  on: boolean; label: string; onPick: () => void; locked?: boolean; hint?: string
  className?: string; style?: React.CSSProperties; children?: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState(false)
  return (
    <>
      <button
        ref={ref} type="button" role="radio" aria-checked={on} aria-disabled={locked || undefined}
        aria-label={locked && hint ? `${label} — ${hint}` : label}
        className={`btn chip ${on ? 'primary pick' : ''}${locked ? ' locked' : ''} ${className ?? ''}`}
        style={style} onClick={locked ? () => setTip((v) => !v) : onPick}
      >
        {children}
        {locked && <span className="lock" aria-hidden="true">🔒</span>}
      </button>
      {tip && locked && hint && <Bubble anchor={ref} text={`🔒 ${hint}`} onClose={() => setTip(false)} />}
    </>
  )
}
