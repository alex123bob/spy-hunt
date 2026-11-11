import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { request } from '../api/client'
import type { Snapshot } from '../api/types'
import { getRecaps } from '../bots/api'
import { t, useLang } from '../i18n'
import { getDailyStreak } from '../daily/api'
import { recordPageLoadVisit } from '../state/nudges'
import { ensureGuest, getSession, setName as saveName } from '../state/session'

export function Landing() {
  const nav = useNavigate()
  const lang = useLang()
  const [name, setName] = useState(getSession().name)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [unseen, setUnseen] = useState(0)
  const [daily, setDaily] = useState({ streak: 0, played: false })
  const { streak, played } = daily

  useEffect(() => recordPageLoadVisit(), [])

  useEffect(() => {
    if (!getSession().playerId) return
    let live = true
    getRecaps().then((r) => live && setUnseen(r.unseen), () => {})
    getDailyStreak().then((d) => live && setDaily({ streak: d.streak, played: d.played_today }), () => {})
    return () => {
      live = false
    }
  }, [])

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
      <h1>{t('app.title')}</h1>
      <p className="muted">{t('landing.tagline')}</p>
      <button type="button" className="btn daily-card" onClick={() => nav('/daily')}>
        <strong>{t('daily.card')}</strong>
        <span className="muted">{played ? t('daily.doneToday') : t('daily.play')}</span>
        {streak >= 1 && <span>{t('daily.streak', { n: streak })}</span>}
      </button>
      <button type="button" className="btn daily-card" onClick={() => nav('/bots')}>
        <strong>{t('bots.card')}</strong>
        {unseen > 0 && <span>{t('arena.new', { n: unseen })}</span>}
      </button>
      <button type="button" className="btn daily-card" onClick={() => nav('/top')}>
        <strong>{t('top.card')}</strong>
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
