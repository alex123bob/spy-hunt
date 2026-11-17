import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../api/types'
import { t } from '../i18n'

/**
 * Toast text for a host handover seen while watching the room; `n` bumps on each one so identical text re-shows.
 *
 * The server sends a leave as `player_left` and then a separate `player_updated` naming the new host, so a frame
 * with no host sits in between: the last known host survives such frames. The host is tracked by name, not seat,
 * because game start reshuffles every seat.
 */
export function useHostChange(state: Snapshot): { text: string; n: number } {
  const lastHost = useRef<{ code: string; name: string } | null>(null)
  const [note, setNote] = useState({ text: '', n: 0 })
  useEffect(() => {
    const host = state.players.find((p) => p.is_host)
    if (!host) return
    const before = lastHost.current
    lastHost.current = { code: state.code, name: host.name }
    if (!before || before.code !== state.code || before.name === host.name) return
    // A leaver mid-game stays listed as a bot under the same name, so "still here" means a connected human.
    const left = !state.players.some((p) => p.name === before.name && !p.is_bot && p.connected)
    const you = host.seat === state.me.seat
    const params = { old: before.name, new: host.name }
    const key = left ? (you ? 'host.nowYou' : 'host.nowOther') : (you ? 'host.nowYouNoLeft' : 'host.nowOtherNoLeft')
    setNote((c) => ({ text: t(key, params), n: c.n + 1 }))
  }, [state])
  return note
}
