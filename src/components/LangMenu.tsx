import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { LANGS, type Lang } from '../api/types'

/** Language dropdown. `short` shows a globe + code (top bar); `room` shows "{prefix} {language name}". */
export function LangMenu({ value, onChange, label, variant = 'short', prefix = '' }:
  { value: Lang; onChange: (l: Lang) => void; label: string; variant?: 'short' | 'room'; prefix?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const onDown = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const text = variant === 'short' ? `🌐 ${t(`lang.short.${value}`)}` : `${prefix} ${t(`lang.${value}`)}`.trim()
  return (
    <div className="langmenu" ref={root}>
      <button type="button" className="pill langmenu-btn" ref={trigger} aria-haspopup="listbox" aria-expanded={open}
        aria-label={label} onClick={() => setOpen(o => !o)}>{text} ▾</button>
      {open && (
        <div className="langmenu-list" role="listbox" aria-label={label}>
          {LANGS.map(code => (
            <button key={code} type="button" role="option" className="langmenu-opt" aria-selected={code === value}
              onClick={() => { setOpen(false); onChange(code); trigger.current?.focus() }}>
              {t(`lang.${code}`)}{code === value ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
