import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export function AccountMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="account-menu" ref={root}>
      <button type="button" className="pill account-btn" ref={trigger} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>{t('auth.account')}</button>
      {open && (
        <div className="account-pop">
          <span className="wrap">{email}</span>
          <button type="button" className="btn secondary" onClick={() => { setOpen(false); onLogout() }}>{t('auth.logout')}</button>
        </div>
      )}
    </div>
  )
}
