import { useState } from 'react'
import type { Lang } from '../api/types'
import { LangPicker } from './LangPicker'
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
      <LangPicker value={lang} onChange={pickLang} />
      {account.email ? (
        <div className="topbar-account">
          <span className="topbar-email">{account.email}</span>
          <button type="button" className="btn chip" onClick={signOut}>{t('auth.logout')}</button>
        </div>
      ) : (
        <button type="button" className="btn chip" onClick={() => setOpen(true)}>{t('auth.corner')}</button>
      )}
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </header>
  )
}
