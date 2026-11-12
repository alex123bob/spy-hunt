import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lang } from '../api/types'
import { LangPicker } from './LangPicker'
import { Logo } from './Logo'
import { AccountMenu } from './AccountMenu'
import { AuthModal } from './AuthModal'
import { setLang, t, useLang } from '../i18n'
import { logout, useAccount } from '../state/accounts'
import { setSessionLang } from '../state/session'

export function TopBar() {
  const lang = useLang()
  const account = useAccount()
  const [open, setOpen] = useState(false)

  const pickLang = (l: Lang) => {
    setLang(l)
    setSessionLang(l)
  }
  const signOut = async () => {
    await logout()
    window.location.reload()
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" aria-label={t('app.title')}><Logo /></Link>
      <div className="topbar-right">
        <LangPicker value={lang} onChange={pickLang} />
        {account.email ? (
          <>
            <Link className="pill" to="/clan">{t('clan.topbar')}</Link>
            <AccountMenu email={account.email} onLogout={signOut} />
          </>
        ) : (
          <button type="button" className="pill" onClick={() => setOpen(true)}>{t('auth.corner')}</button>
        )}
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </header>
  )
}
