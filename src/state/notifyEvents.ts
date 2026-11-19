import type { Snapshot } from '../api/types'

export type NotifyEvent = { kind: 'started' } | { kind: 'turn' }

function isMyTurn(s: Snapshot): boolean {
  if (s.status !== 'playing') return false
  const me = s.players.find((p) => p.seat === s.me.seat)
  if (!me?.alive) return false
  if (s.phase === 'describe' || s.phase === 'tiebreak_describe') return s.current_speaker === s.me.seat
  if (s.phase === 'vote' || s.phase === 'revote') {
    if (s.phase === 'revote' && (s.tied ?? []).includes(s.me.seat)) return false
    return !(s.locked ?? []).includes(s.me.seat)
  }
  return false
}

export function detectNotifyEvents(prev: Snapshot | null, next: Snapshot): NotifyEvent[] {
  if (!prev || prev.code !== next.code) return []
  const events: NotifyEvent[] = []
  if (prev.status !== 'playing' && next.status === 'playing') events.push({ kind: 'started' })
  if (!isMyTurn(prev) && isMyTurn(next)) events.push({ kind: 'turn' })
  return events
}
