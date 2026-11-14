import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lang } from '../api/types'
import { LangMenu } from './LangMenu'
import { Logo } from './Logo'
import { AccountMenu } from './AccountMenu'
import { AuthModal } from './AuthModal'
import { setLang, t, useLang } from '../i18n'
import { logout, patchMyLang, useAccount } from '../state/accounts'
import { setSessionLang } from '../state/session'

export function TopBar() {
  const lang = useLang()
  const account = useAccount()
  const [open, setOpen] = useState(false)

  const pickLang = (l: Lang) => {
    setLang(l)
    setSessionLang(l)
    void patchMyLang(l)
  }
  const signOut = async () => {
    await logout()
    window.location.reload()
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" aria-label={t('app.title')}><Logo /></Link>
      <div className="topbar-right">
        <LangMenu variant="short" label={t('lang.menuLabel')} value={lang} onChange={pickLang} />
        <AccountMenu email={account.email} onLogout={signOut} onSignIn={() => setOpen(true)} />
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </header>
  )
}
