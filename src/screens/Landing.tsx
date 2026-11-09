import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { request } from '../api/client'
import type { Lang, Snapshot } from '../api/types'
import { LangPicker } from '../components/LangPicker'
import { setLang, t, useLang } from '../i18n'
import { currentStreak, playedToday, todayUtc } from '../daily/streak'
import { ensureGuest, getSession, setName as saveName, setSessionLang } from '../state/session'

export function Landing() {
  const nav = useNavigate()
  const lang = useLang()
  const [name, setName] = useState(getSession().name)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const today = todayUtc()
  const played = playedToday(today)
  const streak = currentStreak(today)

  const pickLang = (l: Lang) => {
    setLang(l)
    setSessionLang(l)
  }

  const needName = () => {
    const n = name.trim()
    if (!n) {
      setErr(t('landing.nameRequired'))
      return null
    }
    saveName(n)
    setErr('')
    return n
  }

  const create = async () => {
    const n = needName()
    if (!n) return
    setBusy(true)
    try {
      await ensureGuest()
      const snap = await request<Snapshot>('POST', '/rooms', { name: n, lang })
      nav(`/r/${snap.code}`)
    } catch (e) {
      setErr((e as { status?: number }).status === 0 ? t('error.network') : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const join = () => {
    if (!needName()) return
    const c = code.trim().toUpperCase()
    if (c) nav(`/r/${c}`)
  }

  return (
    <main className="screen">
      <LangPicker value={lang} onChange={pickLang} />
      <h1>{t('app.title')}</h1>
      <p className="muted">{t('landing.tagline')}</p>
      <button type="button" className="btn daily-card" onClick={() => nav('/daily')}>
        <strong>{t('daily.card')}</strong>
        <span className="muted">{played ? t('daily.doneToday') : t('daily.play')}</span>
        {streak >= 1 && <span>{t('daily.streak', { n: streak })}</span>}
      </button>
      <label>
        <span className="muted">{t('landing.name')}</span>
        <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      {err && <p role="alert" className="error">{err}</p>}
      <button type="button" className="btn primary" disabled={busy} onClick={create}>
        {t('landing.create')}
      </button>
      <p className="muted center">{t('landing.or')}</p>
      <label>
        <span className="muted">{t('landing.code')}</span>
        <input value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
      </label>
      <button type="button" className="btn" onClick={join}>
        {t('landing.join')}
      </button>
    </main>
  )
}
