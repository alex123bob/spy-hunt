import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BadgeCatalog, ClanBadge, ClanInfo, MyClan, Season } from '../api/types'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import { t, useLang } from '../i18n'
import { AuthModal } from '../components/AuthModal'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { useFlash } from '../components/useFlash'
import { useAccount } from '../state/accounts'
import { changeBadge, createClan, getBadges, getMyClan, joinClan, leaveClan, listOpenClans } from '../state/clans'
import { colorName, Pick, PickGroup } from '../looks/Picker'

const MAX_MEMBERS = 30
// A subset of the server's palette (looks.CLAN_EMOJIS × COLORS); used only if that request fails.
const FALLBACK_CATALOG: BadgeCatalog = {
  badges: [],
  emojis: ['🦊', '🐺', '🦉', '🐉', '🦁', '🐙', '🦅', '🐝', '🌵', '🚀', '⚡', '🔥'],
  colors: ['#ff6b6b', '#ffa94d', '#4cd08a', '#38c9d6', '#5b8cff', '#b07cff'],
}

/** Emoji × colour badge builder with a live preview. */
function BadgeBuilder({ catalog, value, onChange }: { catalog: BadgeCatalog; value: ClanBadge; onChange: (b: ClanBadge) => void }) {
  return (
    <div className="badge-builder">
      <div className="badge-preview" data-testid="badge-preview"><Badge badge={value} big /></div>
      <PickGroup label={t('clan.badge')}>
        {catalog.emojis.map((e) => (
          <Pick key={e} on={value.emoji === e} label={e} className="clan-pick" onPick={() => onChange({ ...value, emoji: e })}>{e}</Pick>
        ))}
      </PickGroup>
      <PickGroup label={t('clan.badgeColor')}>
        {catalog.colors.map((c) => (
          <Pick key={c} on={value.color === c} label={colorName(c)} className="swatch" style={{ background: c }}
            onPick={() => onChange({ ...value, color: c })}>{value.color === c ? '✓' : ''}</Pick>
        ))}
      </PickGroup>
    </div>
  )
}

function useBadgeCatalog(): BadgeCatalog | null {
  const [cat, setCat] = useState<BadgeCatalog | null>(null)
  useEffect(() => { getBadges().then(setCat, () => setCat(FALLBACK_CATALOG)) }, [])
  return cat
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: MyClan }

function Badge({ badge, label, big }: { badge: ClanBadge | null | undefined; label?: string; big?: boolean }) {
  if (!badge) return null
  return (
    <span className={`clan-badge${big ? ' big' : ''}`} style={{ background: badge.color }} aria-label={label} role={label ? 'img' : undefined}>
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
  const catalog = useBadgeCatalog()
  const [open, setOpen] = useState<ClanInfo[] | null>(null)
  const [name, setName] = useState('')
  const [badge, setBadge] = useState<ClanBadge | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listOpenClans().then(setOpen, () => setOpen([]))
  }, [])
  useEffect(() => {
    if (catalog && !badge) setBadge({ emoji: catalog.emojis[0], color: catalog.colors[0] })
  }, [catalog])

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
      <form className="card clan-card" onSubmit={(e) => { e.preventDefault(); if (badge) run(() => createClan(name.trim(), badge)) }}>
        <h2>{t('clan.createTitle')}</h2>
        <label>
          <span>{t('clan.name')}</span>
          <input value={name} maxLength={20} aria-describedby="clan-name-hint" onChange={(e) => setName(e.target.value)} />
        </label>
        <span id="clan-name-hint" className="muted small">{t('clan.nameHint')}</span>
        {catalog && badge && <BadgeBuilder catalog={catalog} value={badge} onChange={setBadge} />}
        <button type="submit" className="btn primary" disabled={busy || !badge || name.trim().length < 3}>{t('clan.create')}</button>
      </form>
      <form className="card clan-card" onSubmit={(e) => { e.preventDefault(); run(() => joinClan(code)) }}>
        <h2>{t('clan.joinTitle')}</h2>
        <label>
          <span>{t('clan.code')}</span>
          <input className="clan-code-input" value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
        </label>
        <button type="submit" className="btn secondary" disabled={busy || code.trim().length === 0}>{t('clan.join')}</button>
      </form>
      <section className="card clan-card">
        <h2>{t('clan.openTitle')}</h2>
        {open === null && <Loader label={t('bots.loading')} />}
        {open?.length === 0 && <p className="muted">{t('clan.openEmpty')}</p>}
        <div className="stagger clan-open">
          {open?.map((c, i) => (
            <div key={c.id} className="row between clan-open-row" style={{ '--i': i } as React.CSSProperties}>
              <Badge badge={c.badge} />
              <div className="grow">
                <strong>{c.name}</strong>
                <div className="muted">{t('clan.memberCount', { n: c.members, max: MAX_MEMBERS })}</div>
              </div>
              <button type="button" className="btn secondary" disabled={busy} aria-label={t('clan.joinNamed', { name: c.name })}
                onClick={() => run(() => joinClan(c.code))}>{t('clan.join')}</button>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function EditBadge({ clan, onSaved, onCancel }: { clan: ClanInfo; onSaved: (c: ClanInfo) => void; onCancel: () => void }) {
  const catalog = useBadgeCatalog()
  const [badge, setBadge] = useState<ClanBadge>(clan.badge)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    try {
      onSaved(await changeBadge(badge))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }
  if (!catalog) return <Loader label={t('bots.loading')} />
  return (
    <section className="card clan-card">
      {error && <p role="alert" className="error">{error}</p>}
      <BadgeBuilder catalog={catalog} value={badge} onChange={setBadge} />
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={save}>{t('clan.saveBadge')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('clan.cancel')}</button>
      </div>
    </section>
  )
}

function Member({ clan: initial, season, onLeft }: { clan: ClanInfo; season: Season | null | undefined; onLeft: () => void }) {
  const [clan, setClan] = useState(initial)
  useEffect(() => setClan(initial), [initial])
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const copied = useFlash()
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clan.code)
      copied.flash(t('clan.copied'))
    } catch {
      // clipboard blocked: the code is selectable text
    }
  }
  const rivalScore = wk?.rival?.score ?? 0
  const share = wk && wk.own + rivalScore > 0 ? wk.own / (wk.own + rivalScore) : 0.5

  return (
    <>
      <header className="clan-crest">
        <Badge badge={clan.badge} big />
        <h1 className="clan-title">{clan.name}</h1>
        {clan.is_leader && !editing && (
          <button type="button" className="pill" onClick={() => setEditing(true)}>{t('clan.changeBadge')}</button>
        )}
      </header>
      {editing && <EditBadge clan={clan} onCancel={() => setEditing(false)}
        onSaved={(c) => { setClan({ ...clan, ...c }); setEditing(false) }} />}
      <div className="ticket clan-invite">
        <div>
          <p className="muted">{t('clan.inviteCode')}</p>
          <strong className="code">{clan.code}</strong>
          <p className="muted">{t('clan.memberCount', { n: clan.members, max: MAX_MEMBERS })}</p>
        </div>
        <button ref={copied.ref} type="button" className="pill clan-copy" onClick={copy}>{t('clan.copy')}</button>
      </div>
      {copied.node}
      {wk && (
        <section className="card clan-card">
          <h2>{t('clan.thisWeek')}</h2>
          {wk.rival ? (
            <>
              <div className="row between clan-score">
                <strong className="grow">{wk.own}</strong>
                <span className="muted">{t('clan.vs', { name: rivalName(wk.rival.name, wk.ghost) })}</span>
                <strong>{wk.rival.score}</strong>
              </div>
              <div className="tug" aria-hidden>
                <div className="tug-own" data-testid="tug-own" style={{ width: `${share * 100}%` }} />
                <div className="tug-rival" />
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
      <section className="card clan-card">
        <h2>{t('clan.members')}</h2>
        {season?.members.map((m, i) => (
          <div key={i} className="row between clan-member" data-testid="clan-member">
            <span className="grow">{m.name}{m.is_leader && <span className="tag clan-leader">👑 {t('clan.leader')}</span>}</span>
            <strong>{m.points}</strong>
          </div>
        ))}
      </section>
      <section className="card clan-card">
        <h2>{t('clan.history')}</h2>
        {season && season.history.length === 0 && <p className="muted">{t('clan.historyEmpty')}</p>}
        {season?.history.map((w) => (
          <div key={w.week} className="clan-week" data-testid="clan-week">
            <span className={`tag res-${w.result}`}>{t(`clan.result.${w.result}`)}</span>
            <span className="grow">{w.own} – {w.rival_score} {t('clan.vs', { name: rivalName(w.rival_name, w.ghost) })}</span>
            <span className="muted">{w.week}</span>
          </div>
        ))}
      </section>
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="card clan-card clan-confirm">
          <span>{t('clan.leaveConfirm')}</span>
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setConfirming(false)}>{t('clan.cancel')}</button>
            <button type="button" className="btn primary" disabled={leaving} onClick={leave}>{t('clan.leaveYes')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setConfirming(true)}>{t('clan.leave')}</button>
      )}
    </>
  )
}

export function Clan() {
  useLang()
  const [authOpen, setAuthOpen] = useState(false)
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
          <EmptyState emoji="🔒" title={t('clan.title')} body={t('clan.registerFirst')}>
            <button type="button" className="btn primary" onClick={() => setAuthOpen(true)}>{t('auth.corner')}</button>
          </EmptyState>
          {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        </>
      ) : load.kind === 'loading' ? (
        <Loader label={t('bots.loading')} />
      ) : load.kind === 'error' ? (
        <EmptyState emoji="😵" title={t('clan.title')} body={t('clan.loadError')} role="alert">
          <button type="button" className="btn primary" onClick={fetchMine}>{t('room.retry')}</button>
        </EmptyState>
      ) : load.data.clan ? (
        <Member clan={load.data.clan} season={load.data.season} onLeft={fetchMine} />
      ) : (
        <>
          <h1>{t('clan.title')}</h1>
          <NoClan onDone={fetchMine} />
        </>
      )}
      <Link to="/" className="btn">{t('bots.home')}</Link>
    </main>
  )
}
