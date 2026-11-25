import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { getAdminStatus, getAdminStats, startRefill, type AdminStats, type AdminStatus } from '../admin/api'
import { clearToken, getToken, setToken } from '../admin/token'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { Sparkline } from '../admin/Sparkline'

type Phase = 'prompt' | 'loading' | 'ready' | 'error'
type View = 'queue' | 'stats'

export function Admin() {
  const [phase, setPhase] = useState<Phase>(() => (getToken() ? 'loading' : 'prompt'))
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [promptMsg, setPromptMsg] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [count, setCount] = useState('3')
  const [view, setView] = useState<View>('queue')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const pollRef = useRef<number | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const onError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      clearToken()
      stopPoll()
      setPromptMsg('Invalid token.')
      setPhase('prompt')
    } else {
      setPhase('error')
    }
  }, [stopPoll])

  const load = useCallback(() => {
    setPhase('loading')
    getAdminStatus()
      .then((s) => {
        setStatus(s)
        setPhase('ready')
      })
      .catch(onError)
  }, [onError])

  useEffect(() => {
    if (getToken()) load()
    return stopPoll
  }, [load, stopPoll])

  useEffect(() => {
    if (status?.refilling && pollRef.current === null) {
      pollRef.current = window.setInterval(load, 3000)
    } else if (!status?.refilling) {
      stopPoll()
    }
  }, [status?.refilling, load, stopPoll])

  const submitToken = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!tokenInput) return
    setToken(tokenInput)
    setPromptMsg(null)
    load()
  }

  const refill = () => {
    const n = Math.max(1, Math.min(50, Math.floor(Number(count)) || 1))
    startRefill(n).then(load).catch(onError)
  }

  const loadStats = useCallback(() => {
    getAdminStats().then(setStats).catch(onError)
  }, [onError])

  const openTab = (v: View) => {
    setView(v)
    if (v === 'stats' && !stats) loadStats()
  }

  const refreshStats = () => {
    loadStats()
  }

  if (phase === 'prompt') {
    return (
      <main className="screen">
        <form className="admin-prompt" onSubmit={submitToken}>
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            autoComplete="off"
          />
          {promptMsg && <p className="muted" role="alert">{promptMsg}</p>}
          <button type="submit" className="btn primary">Enter</button>
        </form>
      </main>
    )
  }

  if (phase === 'loading' && !status) {
    return <main className="screen"><Loader label="Loading" /></main>
  }

  if (phase === 'error') {
    return (
      <main className="screen">
        <EmptyState emoji="🙈" title="Something went wrong" role="alert">
          <button type="button" className="btn primary" onClick={load}>Retry</button>
        </EmptyState>
      </main>
    )
  }

  return (
    <main className="screen">
      <h1>Admin</h1>
      <div className="row">
        <button
          type="button"
          className={view === 'queue' ? 'btn primary' : 'btn'}
          onClick={() => openTab('queue')}
        >
          Puzzle queue
        </button>
        <button
          type="button"
          className={view === 'stats' ? 'btn primary' : 'btn'}
          onClick={() => openTab('stats')}
        >
          Stats
        </button>
      </div>

      {view === 'queue' && (
        <section className="admin-card">
          <h2>Daily puzzle queue</h2>
          <p>Ready: {status?.ready_count} / {status?.total_count} total</p>
          {status?.refilling && <p className="muted">Refilling…</p>}
          <div className="actions">
            <label htmlFor="refill-count">How many to generate</label>
            <input
              id="refill-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              disabled={status?.refilling}
            />
            <button type="button" className="btn primary" onClick={refill} disabled={status?.refilling}>
              Refill
            </button>
            <button type="button" className="btn" onClick={load}>Refresh</button>
          </div>
        </section>
      )}

      {view === 'stats' && (
        <>
          <div className="row">
            <button type="button" className="btn" onClick={refreshStats}>Refresh</button>
          </div>
          {!stats && <Loader label="Loading stats" />}
          {stats && (
            <>
              <section className="card">
                <h2>Rooms</h2>
                <p>Active lobby: {stats.rooms.active_lobby} · Active playing: {stats.rooms.active_playing}</p>
                <p>Created today: {stats.rooms.rooms_created_today} · Games finished today: {stats.rooms.games_finished_today}</p>
                <p className="muted small">Rooms created (14d)</p>
                <Sparkline values={stats.rooms.trend.map((t) => t.rooms_created)} />
                <p className="muted small">Games finished (14d)</p>
                <Sparkline values={stats.rooms.trend.map((t) => t.games_finished)} />
              </section>

              <section className="card">
                <h2>Puzzles</h2>
                <p>Ready: {stats.puzzles.ready_count} / {stats.puzzles.total_count} total</p>
                <p>Attempts today: {stats.puzzles.attempts_today} · Solved today: {stats.puzzles.solved_today}</p>
                <p className="muted small">Attempts (14d)</p>
                <Sparkline values={stats.puzzles.trend.map((t) => t.attempts)} />
                <p className="muted small">Solved (14d)</p>
                <Sparkline values={stats.puzzles.trend.map((t) => t.solved)} />
              </section>

              <section className="card">
                <h2>Accounts</h2>
                <p>Total guests: {stats.accounts.total_guests} · New today: {stats.accounts.new_today}</p>
                <p className="muted small">New guests (14d)</p>
                <Sparkline values={stats.accounts.trend.map((t) => t.new)} />
              </section>

              <section className="card">
                <h2>Economy</h2>
                <p>Credits issued today: {stats.economy.credits_issued_today}</p>
                <p className="muted small">Credits issued (14d)</p>
                <Sparkline values={stats.economy.trend.map((t) => t.credits)} />
              </section>

              <section className="card">
                <h2>Bots &amp; Arena</h2>
                <p>Custom bots: {stats.bots.total_custom_bots} · Arena matches today: {stats.bots.arena_matches_today}</p>
                <p className="muted small">Arena matches (14d)</p>
                <Sparkline values={stats.bots.trend.map((t) => t.matches)} />
              </section>

              <section className="card">
                <h2>Clans</h2>
                <p>Total clans: {stats.clans.total_clans} · Total members: {stats.clans.total_members}</p>
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}
