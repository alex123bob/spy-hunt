import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { getAdminStatus, startRefill, type AdminStatus } from '../admin/api'
import { clearToken, getToken, setToken } from '../admin/token'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'

type Phase = 'prompt' | 'loading' | 'ready' | 'error'

export function Admin() {
  const [phase, setPhase] = useState<Phase>(() => (getToken() ? 'loading' : 'prompt'))
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [promptMsg, setPromptMsg] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [count, setCount] = useState('3')
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
    </main>
  )
}
