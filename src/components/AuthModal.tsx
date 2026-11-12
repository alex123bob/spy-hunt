import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import { t } from '../i18n'
import { Sheet } from './Sheet'
import { login, register } from '../state/accounts'

type Tab = 'register' | 'login'

function failureText(e: unknown, tab: Tab): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return t('auth.emailTaken')
    if (e.status === 400 && e.code === 'bad_password') return t('auth.passwordTooShort')
    if (e.status === 400 && e.code === 'bad_email') return t('auth.badEmail')
    if (e.status === 401 && tab === 'login') return t('auth.loginFailed')
  }
  return errorText(e)
}

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [errCount, setErrCount] = useState(0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      if (tab === 'register') await register(email, password)
      else await login(email, password)
      setDone(true)
      setTimeout(() => window.location.reload(), 400)
    } catch (x) {
      setErr(failureText(x, tab))
      setErrCount((n) => n + 1)
      setBusy(false)
    }
  }

  return (
    <Sheet label={t(tab === 'register' ? 'auth.registerTab' : 'auth.loginTab')} onClose={onClose} dismissible={!done}
      adornment={<div className="auth-avatar" aria-hidden="true">🕵️</div>}
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="segmented" role="tablist">
          {(['register', 'login'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => { setTab(k); setErr('') }}
            >
              {t(k === 'register' ? 'auth.registerTab' : 'auth.loginTab')}
            </button>
          ))}
        </div>
        {tab === 'register' && (
          <>
            <p>{t('auth.registerPitch')}</p>
            <p className="muted">{t('auth.registerNote')}</p>
          </>
        )}
        <label>
          <span className="muted">{t('auth.email')}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          <span className="muted">{t('auth.password')}</span>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
          />
        </label>
        {err && <p key={errCount} role="alert" className="error auth-error">{err}</p>}
        {done && (
          <p role="status" className="auth-done">
            <span className="auth-check" aria-hidden="true">✓</span> {t('auth.signedIn')}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {t(tab === 'register' ? 'auth.submitRegister' : 'auth.submitLogin')}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={done}>{t('auth.close')}</button>
      </form>
    </Sheet>
  )
}
