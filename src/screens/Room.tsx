import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, request } from '../api/client'
import { openRoomStream } from '../api/stream'
import type { Snapshot } from '../api/types'
import { setLang, t, useLang } from '../i18n'
import { reloadDelay } from '../state/backoff'
import { RoomStore, useRoomStore } from '../state/roomStore'
import { useHeldScreen, type Screen } from '../state/useHeldScreen'
import { ensureGuest, forgetGuest, getSession, setName as saveName } from '../state/session'
import { leaveRoom } from '../state/myRoom'
import { blockingRoom, type BlockingRoom } from '../state/blockingRoom'
import { AlreadyInRoomSheet } from '../components/AlreadyInRoomSheet'
import { Loader } from '../components/Loader'
import { Toast } from '../components/Toast'
import { useGameNotify } from '../state/useGameNotify'
import { useHostChange } from '../state/useHostChange'
import { Lobby } from './Lobby'
import { Reveal } from './Reveal'
import { Result } from './Result'
import { RoomError, type RoomErrorKind } from './RoomError'
import { Table } from './Table'
import { Vote } from './Vote'

type Boot =
  | { kind: 'loading' }
  | { kind: 'error'; error: RoomErrorKind }
  | { kind: 'needName' }
  | { kind: 'blocked'; room: BlockingRoom }
  | { kind: 'ready' }

function errorKind(e: unknown): RoomErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'notFound'
    if (e.status === 409) {
      if (e.code === 'room_full') return 'full'
      if (e.code === 'already_in_room') return 'inRoom'
      return 'started'
    }
  }
  return 'network'
}

export function Room() {
  const { code: rawCode = '' } = useParams()
  const nav = useNavigate()
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
  const failedStreams = useRef(0)
  const leaving = useRef(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // `joinRetried`: a join already retried after leaving the blocking room; a second
  // already_in_room is then a plain failure, not another dialog
  const load = useCallback(async (retried = false, myGen = ++gen.current, joinRetried = false): Promise<void> => {
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
          try {
            snap = await request<Snapshot>('POST', `/rooms/${code}/join`, { name: s.name.trim(), lang: s.lang })
          } catch (je) {
            const other = joinRetried ? null : blockingRoom(je)
            if (other) {
              if (!stale()) setBoot({ kind: 'blocked', room: other })
              return
            }
            throw je
          }
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
    let reload: ReturnType<typeof setTimeout> | undefined
    const s = openRoomStream(
      code,
      (ev) => store.dispatch(ev),
      (st) => {
        store.setStatus(st)
        if (st === 'open') failedStreams.current = 0
        if (st === 'failed') {
          reload = setTimeout(() => setAttempt((a) => a + 1), reloadDelay(failedStreams.current))
          failedStreams.current += 1
        }
      },
      { after: store.state?.last_seq },
    )
    const onVisible = () => {
      if (document.visibilityState === 'visible') s.reconnectNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(reload)
      s.close()
    }
  }, [ready, code, store])

  if (boot.kind === 'loading') return <main className="screen center"><Loader label={t('room.loading')} /></main>
  if (boot.kind === 'error') {
    return <RoomError kind={boot.error} onRetry={() => setAttempt((a) => a + 1)} />
  }
  if (boot.kind === 'blocked') {
    const old = boot.room
    return (
      <main className="screen center">
        <AlreadyInRoomSheet
          code={old.code}
          status={old.status}
          onReturn={() => nav(`/r/${old.code}`)}
          onLeaveAndContinue={() => {
            if (leaving.current) return // a double tap must not send a second leave
            leaving.current = true
            void (async () => {
              try {
                await leaveRoom(old.code)
              } catch {
                leaving.current = false
                setBoot({ kind: 'error', error: 'network' })
                return
              }
              leaving.current = false
              void load(false, ++gen.current, true)
            })()
          }}
          onClose={() => nav('/')}
        />
      </main>
    )
  }
  if (boot.kind === 'needName') {
    return (
      <main className="screen">
        <div className="ticket need-name-code"><span className="lobby-code">{code}</span></div>
        <label>
          <span className="muted">{t('landing.name')}</span>
          <input ref={nameInputRef} value={nameInput} maxLength={16} onChange={(e) => setNameInput(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={!nameInput.trim()}
          onClick={() => {
            nameInputRef.current?.blur()
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
  const { screen, holdUntil } = useHeldScreen(targetScreen(state), state.reveal)
  const hostNote = useHostChange(state)
  useGameNotify(state)
  const banner = status === 'reconnecting' || status === 'polling' ? <div className="banner" role="status"><i className="dot" aria-hidden />{t('room.reconnecting')}</div> : null
  let body
  if (screen === 'lobby') body = <Lobby state={state} />
  else if (screen === 'closed') body = <RoomError kind="closed" />
  else if (screen === 'result') body = <Result state={state} />
  else if (screen === 'vote') body = <Vote state={state} offset={offset} />
  else if (screen === 'reveal') body = <Reveal state={state} offset={offset} holdUntil={holdUntil} />
  else body = <Table state={state} offset={offset} holdUntil={holdUntil} />
  return <>{banner}<Toast text={hostNote.text} nonce={hostNote.n} /><div key={screen} className="phase">{body}</div></>
}
