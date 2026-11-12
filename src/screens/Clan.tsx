import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ClanBadge, ClanInfo, MyClan, Season } from '../api/types'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import { t, useLang } from '../i18n'
import { useAccount } from '../state/accounts'
import { createClan, getBadges, getMyClan, joinClan, leaveClan, listOpenClans } from '../state/clans'

const MAX_MEMBERS = 30
// Same order as the server's list (clans.BADGES); used only if that request fails.
const FALLBACK_BADGES: ClanBadge[] = [
  ['🦊', '#ff6b6b'], ['🐺', '#ffa94d'], ['🦉', '#4cd08a'], ['🐉', '#38c9d6'], ['🦁', '#5b8cff'], ['🐙', '#b07cff'],
  ['🦅', '#ff6b6b'], ['🐝', '#ffa94d'], ['🌵', '#4cd08a'], ['🚀', '#38c9d6'], ['⚡', '#5b8cff'], ['🔥', '#b07cff'],
].map(([emoji, color]) => ({ emoji, color }))

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: MyClan }

function Badge({ badge, label }: { badge: ClanBadge | null | undefined; label?: string }) {
  if (!badge) return null
  return (
    <span className="clan-badge" style={{ background: badge.color }} aria-label={label} role={label ? 'img' : undefined}>
      {badge.emoji}
    </span>
  )
}

// re-render once a minute so the time-left label keeps counting down
function useTick(ms = 60_000) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

function timeLeft(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const h = Math.floor(ms / 3_600_000)
  return t('clan.timeLeft', { d: Math.floor(h / 24), h: h % 24 })
}

function NoClan({ onDone }: { onDone: () => void }) {
  const [badges, setBadges] = useState<ClanBadge[]>([])
  const [open, setOpen] = useState<ClanInfo[] | null>(null)
  const [name, setName] = useState('')
  const [badge, setBadge] = useState(0)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getBadges().then(setBadges, () => setBadges(FALLBACK_BADGES))
    listOpenClans().then(setOpen, () => setOpen([]))
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'bad_name' ? t('clan.nameRule') : errorText(e))
      setBusy(false)
    }
  }

  return (
    <>
      <p className="muted">{t('clan.pitch')}</p>
      {error && <p role="alert" className="error">{error}</p>}
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => createClan(name.trim(), badge)) }}>
        <h2>{t('clan.createTitle')}</h2>
        <label>
          <span>{t('clan.name')}</span>
          <input value={name} maxLength={20} aria-describedby="clan-name-hint" onChange={(e) => setName(e.target.value)} />
        </label>
        <span id="clan-name-hint" className="muted small">{t('clan.nameHint')}</span>
        <div role="radiogroup" aria-label={t('clan.badge')} className="badges">
          {badges.map((b, i) => (
            <button key={i} type="button" role="radio" aria-checked={badge === i} aria-label={b.emoji}
              className={`btn chip clan-pick${badge === i ? ' primary' : ''}`} onClick={() => setBadge(i)}>
              <Badge badge={b} />
            </button>
          ))}
        </div>
        <button type="submit" className="btn primary" disabled={busy || name.trim().length < 3}>{t('clan.create')}</button>
      </form>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => joinClan(code)) }}>
        <h2>{t('clan.joinTitle')}</h2>
        <label>
          <span>{t('clan.code')}</span>
          <input value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy || code.trim().length === 0}>{t('clan.join')}</button>
      </form>
      <section className="panel">
        <h2>{t('clan.openTitle')}</h2>
        {open === null && <p className="muted">{t('bots.loading')}</p>}
        {open?.length === 0 && <p className="muted">{t('clan.openEmpty')}</p>}
        {open?.map((c) => (
          <div key={c.id} className="row between">
            <Badge badge={c.badge} />
            <div className="grow">
              <strong>{c.name}</strong>
              <div className="muted">{t('clan.memberCount', { n: c.members, max: MAX_MEMBERS })}</div>
            </div>
            <button type="button" className="btn" disabled={busy} aria-label={t('clan.joinNamed', { name: c.name })}
              onClick={() => run(() => joinClan(c.code))}>{t('clan.join')}</button>
          </div>
        ))}
      </section>
    </>
  )
}

function Member({ clan, season, onLeft }: { clan: ClanInfo; season: Season | null | undefined; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useTick()
  const wk = season?.this_week
  const rivalName = (name: string | null | undefined, ghost: boolean) => (ghost ? t('clan.practiceRival') : name ?? '—')

  const leave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await leaveClan()
      onLeft()
    } catch (e) {
      setError(errorText(e))
      setLeaving(false)
    }
  }

  return (
    <>
      <h1 className="row clan-title"><Badge badge={clan.badge} /> {clan.name}</h1>
      <p className="muted">{t('clan.inviteCode')} <strong className="code">{clan.code}</strong> · {t('clan.memberCount', { n: clan.members, max: MAX_MEMBERS })}</p>
      {wk && (
        <section className="panel">
          <h2>{t('clan.thisWeek')}</h2>
          {wk.rival ? (
            <>
              <div className="row between clan-score">
                <strong className="grow">{wk.own}</strong>
                <span className="muted">{t('clan.vs', { name: rivalName(wk.rival.name, wk.ghost) })}</span>
                <strong>{wk.rival.score}</strong>
              </div>
            </>
          ) : (
            <>
              <strong className="clan-score">{wk.own}</strong>
              <p className="muted">{t('clan.noRival')}</p>
            </>
          )}
          <p className="muted">{timeLeft(wk.ends_at)} · {t('clan.streak', { n: season!.streak })}</p>
        </section>
      )}
      <section className="panel">
        <h2>{t('clan.members')}</h2>
        {season?.members.map((m, i) => (
          <div key={i} className="row between" data-testid="clan-member">
            <span className="grow">{m.name}{m.is_leader && <span className="tag">{t('clan.leader')}</span>}</span>
            <strong>{m.points}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{t('clan.history')}</h2>
        {season && season.history.length === 0 && <p className="muted">{t('clan.historyEmpty')}</p>}
        {season?.history.map((w) => (
          <div key={w.week} className="row between" data-testid="clan-week">
            <span className={`tag${w.result === 'won' ? ' ok' : ''}`}>{t(`clan.result.${w.result}`)}</span>
            <span className="grow">{w.own} – {w.rival_score} {t('clan.vs', { name: rivalName(w.rival_name, w.ghost) })}</span>
            <span className="muted">{w.week}</span>
          </div>
        ))}
      </section>
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="row">
          <span className="grow">{t('clan.leaveConfirm')}</span>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>{t('clan.cancel')}</button>
          <button type="button" className="btn primary" disabled={leaving} onClick={leave}>{t('clan.leaveYes')}</button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setConfirming(true)}>{t('clan.leave')}</button>
      )}
    </>
  )
}

export function Clan() {
  useLang()
  const account = useAccount()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const latest = useRef(0)

  const fetchMine = useCallback(() => {
    const mine = ++latest.current
    setLoad({ kind: 'loading' })
    getMyClan().then(
      (data) => latest.current === mine && setLoad({ kind: 'ok', data }),
      () => latest.current === mine && setLoad({ kind: 'error' }),
    )
  }, [])

  useEffect(() => {
    if (!account.email) return
    fetchMine()
    return () => { latest.current++ }
  }, [account.email, fetchMine])

  return (
    <main className="screen" data-testid="screen-Clan">
      {!account.email ? (
        <>
          <h1>{t('clan.title')}</h1>
          <p>{t('clan.registerFirst')}</p>
        </>
      ) : load.kind === 'loading' ? (
        <p className="muted">{t('bots.loading')}</p>
      ) : load.kind === 'error' ? (
        <>
          <p role="alert" className="error">{t('clan.loadError')}</p>
          <button type="button" className="btn" onClick={fetchMine}>{t('room.retry')}</button>
        </>
      ) : load.data.clan ? (
        <Member clan={load.data.clan} season={load.data.season} onLeft={fetchMine} />
      ) : (
        <>
          <h1>{t('clan.title')}</h1>
          <NoClan onDone={fetchMine} />
        </>
      )}
      <Link to="/" className="muted center">{t('bots.home')}</Link>
    </main>
  )
}
