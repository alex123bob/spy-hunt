import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { request } from '../api/client'
import type { Snapshot } from '../api/types'
import { getRecaps } from '../bots/api'
import { t, useLang } from '../i18n'
import { getDailyStreak } from '../daily/api'
import { recordPageLoadVisit, recordStreakMilestone } from '../state/nudges'
import { ensureGuest, getSession, setName as saveName } from '../state/session'

const MASCOTS = [['🦊', 'sky'], ['🐸', 'pink'], ['🕵️', 'sun'], ['🐼', 'mint'], ['🐙', 'lilac']] as const

export function Landing() {
  const nav = useNavigate()
  const lang = useLang()
  const [name, setName] = useState(getSession().name)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [unseen, setUnseen] = useState(0)
  // null until the server answers, so the card never flashes a status it hasn't confirmed
  const [daily, setDaily] = useState<{ streak: number; played: boolean } | null>(null)
  const hasSession = !!getSession().playerId
  const streak = daily?.streak ?? 0
  const played = daily?.played ?? false
  const statusKnown = daily !== null || !hasSession

  useEffect(() => recordPageLoadVisit(), [])

  useEffect(() => {
    if (!getSession().playerId) return
    let live = true
    getRecaps().then((r) => live && setUnseen(r.unseen), () => {})
    getDailyStreak().then((d) => {
      if (!live) return
      setDaily({ streak: d.streak, played: d.played_today })
      recordStreakMilestone(d.streak)
    }, () => live && setDaily({ streak: 0, played: false }))
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
    <main className="screen landing">
      <div className="hero">
        <span className="tape">{t('app.trust')}</span>
        <h1 className="title">
          {t('landing.hero').split('{spy}').flatMap((part, i, arr) =>
            i < arr.length - 1
              ? [part, <span key={i} className="spy">{t('landing.heroSpy')}</span>]
              : [part],
          )}
        </h1>
        <p className="muted">{t('landing.tagline')}</p>
        <div className="mascots" aria-hidden="true">
          {MASCOTS.map(([emoji, c]) => (
            <div key={emoji} className={`m c-${c}`}>{emoji}</div>
          ))}
        </div>
      </div>
      <div className="tiles">
        <button type="button" className="tile c-sun" onClick={() => nav('/daily')}>
          <b aria-hidden="true">📅</b>
          <strong>{t('daily.card')}</strong>
          <small>{!statusKnown ? '\u00a0' : played ? t('daily.doneToday') : t('daily.play')}</small>
          {streak >= 1 && (
            <small>
              <span aria-hidden="true">🔥 </span>
              {t('daily.streak', { n: streak })}
            </small>
          )}
        </button>
        <button type="button" className="tile c-sky" onClick={() => nav('/bots')}>
          <b aria-hidden="true">🤖</b>
          <strong>{t('bots.card')}</strong>
          {unseen > 0 && <small className="badge">{t('arena.new', { n: unseen })}</small>}
        </button>
        <button type="button" className="tile c-pink" onClick={() => nav('/top')}>
          <b aria-hidden="true">🏆</b>
          <strong>{t('top.card')}</strong>
        </button>
      </div>
      <label className="field-label">
        <span className="muted">{t('landing.name')}</span>
        <input className="field" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      {err && <p role="alert" className="error">{err}</p>}
      <button type="button" className="btn primary" disabled={busy} onClick={create}>
        {t('landing.create')}
      </button>
      <p className="or">{t('landing.or')}</p>
      <div className="join-row">
        <label className="field-label">
          <span className="muted">{t('landing.code')}</span>
          <input className="field ticket" value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
        </label>
        <button type="button" className="btn secondary" onClick={join}>
          {t('landing.join')}
        </button>
      </div>
    </main>
  )
}
