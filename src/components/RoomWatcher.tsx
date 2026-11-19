import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { request } from '../api/client'
import { openRoomStream } from '../api/stream'
import type { Snapshot } from '../api/types'
import { t } from '../i18n'
import { useMyRoom } from '../state/myRoom'
import { fireNotification, notificationsSupported } from '../state/notify'
import { detectNotifyEvents } from '../state/notifyEvents'
import { getNotifyPref } from '../state/notifyPrefs'
import { RoomStore } from '../state/roomStore'
import { Toast } from './Toast'

export function RoomWatcher() {
  const room = useMyRoom()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onOwnRoomPage = !!room && pathname.toUpperCase() === `/R/${room.code}`
  const active = room && !onOwnRoomPage ? room.code : null

  const [toast, setToast] = useState({ text: '', n: 0 })

  useEffect(() => {
    if (!active) return
    let closed = false
    let stream: { close(): void; reconnectNow(): void } | null = null
    const store = new RoomStore()
    const prevRef: { current: Snapshot | null } = { current: null }
    const unsubscribe = store.subscribe(() => {
      const state = store.state
      if (!state) return
      const events = detectNotifyEvents(prevRef.current, state)
      prevRef.current = state
      for (const event of events) {
        const key = event.kind === 'started' ? 'notify.started' : 'notify.turn'
        if (document.hasFocus()) {
          setToast((c) => ({ text: t(key), n: c.n + 1 }))
        } else if (notificationsSupported() && getNotifyPref() === 'on') {
          fireNotification(t(key), {
            tag: `${state.code}:${event.kind}:${state.game_no}:${state.round}`,
            onClick: () => navigate(`/r/${state.code}`),
          })
        }
      }
    })
    void request<Snapshot>('GET', `/rooms/${active}`).then((snap) => {
      if (closed) return
      store.setSnapshot(snap)
      stream = openRoomStream(active, (ev) => store.dispatch(ev), () => {}, { after: snap.last_seq })
    })
    return () => {
      closed = true
      unsubscribe()
      stream?.close()
    }
  }, [active, navigate])

  if (!active) return null
  return <Toast text={toast.text} nonce={toast.n} className="toast-top" />
}
