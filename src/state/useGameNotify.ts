import { useEffect, useRef } from 'react'
import { detectNotifyEvents } from './notifyEvents'
import { fireNotification, notificationsSupported } from './notify'
import { getNotifyPref } from './notifyPrefs'
import type { Snapshot } from '../api/types'
import { t } from '../i18n'

export function useGameNotify(state: Snapshot): void {
  const prevRef = useRef<Snapshot | null>(null)
  useEffect(() => {
    const prev = prevRef.current
    const events = detectNotifyEvents(prev, state)
    prevRef.current = state
    if (events.length === 0) return
    if (!notificationsSupported()) return
    if (document.hasFocus() || getNotifyPref() !== 'on') return
    for (const event of events) {
      const key = event.kind === 'started' ? 'notify.started' : 'notify.turn'
      fireNotification(t(key), { tag: `${state.code}:${event.kind}:${state.phase}:${state.game_no}:${state.round}` })
    }
  }, [state])
}
