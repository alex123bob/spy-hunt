import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { request } from '../api/client'
import { openRoomStream } from '../api/stream'
import type { Snapshot } from '../api/types'
import { t } from '../i18n'
import { reloadDelay } from '../state/backoff'
import { useMyRoom } from '../state/myRoom'
import { fireNotification, notificationsSupported } from '../state/notify'
import { detectNotifyEvents, type NotifyEvent } from '../state/notifyEvents'
import { getNotifyPref } from '../state/notifyPrefs'
import { RoomStore } from '../state/roomStore'
import { Toast } from './Toast'

export function RoomWatcher() {
  const room = useMyRoom()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const onOwnRoomPage = !!room && pathname.replace(/\/+$/, '').toUpperCase() === `/R/${room.code}`
  const active = room && !onOwnRoomPage ? room.code : null
  const lastKnownStatus = room?.status ?? null

  const [toast, setToast] = useState({ text: '', code: '', n: 0 })
  const [attempt, setAttempt] = useState(0)

  // A toast belongs to one away-from-room stint. Without clearing it, entering the room
  // unmounts <Toast> but keeps its text here, and leaving again remounts it with that stale
  // text, replaying e.g. "your turn to speak" for a turn the player already took.
  useEffect(() => () => setToast((c) => ({ ...c, text: '', code: '' })), [active])

  useEffect(() => {
    if (!active) return
    let closed = false
    let stream: { close(): void; reconnectNow(): void } | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const store = new RoomStore()
    const prevRef: { current: Snapshot | null } = { current: null }
    const handleEvents = (events: NotifyEvent[], state: Snapshot) => {
      for (const event of events) {
        const key = event.kind === 'started' ? 'notify.started' : state.phase === 'vote' || state.phase === 'revote' ? 'notify.turnVote' : 'notify.turnSpeak'
        if (document.hasFocus()) {
          setToast((c) => ({ text: t(key), code: state.code, n: c.n + 1 }))
        } else if (notificationsSupported() && getNotifyPref() === 'on') {
          fireNotification(t(key), {
            tag: `${state.code}:${event.kind}:${state.phase}:${state.game_no}:${state.round}`,
            onClick: () => navigateRef.current(`/r/${state.code}`),
          })
        }
      }
    }
    const unsubscribe = store.subscribe(() => {
      const state = store.state
      if (!state) return
      const events = detectNotifyEvents(prevRef.current, state)
      prevRef.current = state
      handleEvents(events, state)
    })
    void request<Snapshot>('GET', `/rooms/${active}`)
      .then((snap) => {
        if (closed) return
        // The bootstrap fetch can resolve after the game has already started server-side.
        // `myRoom`'s last known status is refreshed synchronously on every navigation, so it's
        // the only record of what the player actually saw before leaving; without this check,
        // a "lobby" -> "playing" transition that happened entirely before this fetch resolved
        // would have no earlier snapshot to diff against and would go unnoticed.
        if (lastKnownStatus === 'lobby' && snap.status === 'playing') handleEvents([{ kind: 'started' }], snap)
        store.setSnapshot(snap)
        stream = openRoomStream(
          active,
          (ev) => store.dispatch(ev),
          (st) => {
            if (st === 'failed') retry = setTimeout(() => setAttempt((a) => a + 1), reloadDelay(failures++))
          },
          { after: snap.last_seq },
        )
      })
      .catch(() => {
        if (closed) return
        retry = setTimeout(() => setAttempt((a) => a + 1), reloadDelay(failures++))
      })
    const onVisible = () => {
      if (document.visibilityState === 'visible') stream?.reconnectNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(retry)
      unsubscribe()
      stream?.close()
    }
  }, [active, attempt, lastKnownStatus])

  if (!active) return null
  return <Toast text={toast.text} nonce={toast.n} className="toast-top" onClick={() => navigate(`/r/${toast.code}`)} />
}
