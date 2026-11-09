import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, request } from '../api/client'
import { openRoomStream } from '../api/stream'
import type { Snapshot } from '../api/types'
import { setLang, t, useLang } from '../i18n'
import { RoomStore, useRoomStore } from '../state/roomStore'
import { useHeldScreen, type Screen } from '../state/useHeldScreen'
import { ensureGuest, forgetGuest, getSession, setName as saveName } from '../state/session'
import { Lobby } from './Lobby'
import { Reveal } from './Reveal'
import { Result } from './Result'
import { RoomError, type RoomErrorKind } from './RoomError'
import { Table } from './Table'
import { Vote } from './Vote'

type Boot = { kind: 'loading' } | { kind: 'error'; error: RoomErrorKind } | { kind: 'needName' } | { kind: 'ready' }

function errorKind(e: unknown): RoomErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'notFound'
    if (e.status === 409) return e.code === 'room_full' ? 'full' : 'started'
  }
  return 'network'
}

export function Room() {
  const { code: rawCode = '' } = useParams()
  const code = rawCode.trim().toUpperCase()
  useLang()
  const storeRef = useRef<RoomStore | null>(null)
  if (!storeRef.current) storeRef.current = new RoomStore()
  const store = storeRef.current
  const { state, status, offset } = useRoomStore(store)
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' })
  const [nameInput, setNameInput] = useState(getSession().name)
  const [attempt, setAttempt] = useState(0)
  const gen = useRef(0)

  const load = useCallback(async (retried = false, myGen = ++gen.current): Promise<void> => {
    const stale = () => myGen !== gen.current
    setBoot({ kind: 'loading' })
    try {
      await ensureGuest()
      let snap: Snapshot
      try {
        snap = await request<Snapshot>('GET', `/rooms/${code}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && !retried) {
          forgetGuest()
          return load(true, myGen)
        }
        if (e instanceof ApiError && e.status === 403) {
          const s = getSession()
          if (!s.name.trim()) {
            if (!stale()) setBoot({ kind: 'needName' })
            return
          }
          snap = await request<Snapshot>('POST', `/rooms/${code}/join`, { name: s.name.trim(), lang: s.lang })
        } else {
          throw e
        }
      }
      if (stale()) return
      store.setSnapshot(snap)
      const me = snap.players.find((p) => p.seat === snap.me.seat)
      if (me) setLang(me.lang)
      setBoot({ kind: 'ready' })
    } catch (e) {
      if (stale()) return
      setBoot({ kind: 'error', error: errorKind(e) })
    }
  }, [code, store])

  useEffect(() => {
    void load()
    return () => {
      gen.current++ // cancel any in-flight load for this effect run
    }
  }, [load, attempt])

  const ready = boot.kind === 'ready'
  useEffect(() => {
    if (!ready) return
    const s = openRoomStream(
      code,
      (ev) => store.dispatch(ev),
      (st) => {
        store.setStatus(st)
        if (st === 'failed') setAttempt((a) => a + 1)
      },
      { after: store.state?.last_seq },
    )
    const onVisible = () => {
      if (document.visibilityState === 'visible') s.reconnectNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      s.close()
    }
  }, [ready, code, store])

  if (boot.kind === 'loading') return <main className="screen center"><p>{t('room.loading')}</p></main>
  if (boot.kind === 'error') {
    return <RoomError kind={boot.error} onRetry={() => setAttempt((a) => a + 1)} />
  }
  if (boot.kind === 'needName') {
    return (
      <main className="screen">
        <h2>{code}</h2>
        <label>
          <span className="muted">{t('landing.name')}</span>
          <input value={nameInput} maxLength={16} onChange={(e) => setNameInput(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={!nameInput.trim()}
          onClick={() => {
            saveName(nameInput.trim())
            setAttempt((a) => a + 1)
          }}
        >
          {t('landing.join')}
        </button>
      </main>
    )
  }
  if (!state) return null
  return <RoomView state={state} status={status} offset={offset} />
}

function targetScreen(state: Snapshot): Screen {
  if (state.status === 'lobby') return 'lobby'
  if (state.status === 'closed') return 'closed'
  if (state.status === 'finished') return 'result'
  if (state.phase === 'vote' || state.phase === 'revote') return 'vote'
  if (state.phase === 'reveal') return 'reveal'
  return 'table'
}

function RoomView({ state, status, offset }: { state: Snapshot; status: string; offset: number }) {
  const screen = useHeldScreen(targetScreen(state), state.reveal)
  const banner = status === 'reconnecting' || status === 'polling' ? <div className="banner">{t('room.reconnecting')}</div> : null
  let body
  if (screen === 'lobby') body = <Lobby state={state} />
  else if (screen === 'closed') body = <RoomError kind="closed" />
  else if (screen === 'result') body = <Result state={state} />
  else if (screen === 'vote') body = <Vote state={state} offset={offset} />
  else if (screen === 'reveal') body = <Reveal state={state} offset={offset} />
  else body = <Table state={state} offset={offset} />
  return <>{banner}{body}</>
}
