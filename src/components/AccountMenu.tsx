import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'

/** One top-bar menu for everyone: guests get Profile + sign-in; accounts get Profile, Clan and Log out. */
export function AccountMenu({ email, onLogout, onSignIn }: { email: string | null; onLogout: () => void; onSignIn: () => void }) {
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

  const close = () => setOpen(false)
  return (
    <div className="account-menu" ref={root}>
      <button type="button" className="pill account-btn" ref={trigger} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>{t('auth.account')}</button>
      {open && (
        <div className="account-pop">
          {email && <span className="wrap">{email}</span>}
          <Link className="btn secondary" to="/me" onClick={close}>{t('credits.profile')}</Link>
          {email && <Link className="btn secondary" to="/clan" onClick={close}>{t('clan.topbar')}</Link>}
          {email
            ? <button type="button" className="btn secondary" onClick={() => { close(); onLogout() }}>{t('auth.logout')}</button>
            : <button type="button" className="btn primary" onClick={() => { close(); onSignIn() }}>{t('auth.corner')}</button>}
        </div>
      )}
    </div>
  )
}
