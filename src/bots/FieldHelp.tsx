import { useRef, useState } from 'react'
import { Bubble } from '../components/Bubble'
import { t } from '../i18n'

/** A small "i" button next to a setting's label: tap it to read what the setting does. */
export function FieldHelp({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <span className="tip">
      <button
        ref={btn} type="button" className="tip-btn help-btn" aria-label={t('bots.help.about', { label })}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && <Bubble anchor={btn} text={text} ms={10000} onClose={() => setOpen(false)} />}
    </span>
  )
}
