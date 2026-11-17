import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../api/types'
import { t } from '../i18n'

/** Toast text for a host handover seen while watching the room; `n` bumps on each one so identical text re-shows. */
export function useHostChange(state: Snapshot): { text: string; n: number } {
  const prev = useRef<Snapshot | null>(null)
  const [note, setNote] = useState({ text: '', n: 0 })
  useEffect(() => {
    const before = prev.current
    prev.current = state
    if (!before || before.code !== state.code) return
    const oldHost = before.players.find((p) => p.is_host)
    const newHost = state.players.find((p) => p.is_host)
    if (!oldHost || !newHost || oldHost.seat === newHost.seat) return
    const still = state.players.find((p) => p.seat === oldHost.seat)
    const left = !still || !still.connected
    const you = newHost.seat === state.me.seat
    const params = { old: oldHost.name, new: newHost.name }
    const key = left ? (you ? 'host.nowYou' : 'host.nowOther') : (you ? 'host.nowYouNoLeft' : 'host.nowOtherNoLeft')
    setNote((c) => ({ text: t(key, params), n: c.n + 1 }))
  }, [state])
  return note
}
