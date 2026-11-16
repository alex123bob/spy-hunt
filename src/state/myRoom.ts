import { useSyncExternalStore } from 'react'
import { ApiError, request } from '../api/client'
import { getSession } from './session'

// The room this player currently holds a seat in (lobby or playing), or null.
export type MyRoom = { code: string; status: 'lobby' | 'playing' } | null

let current: MyRoom = null
const listeners = new Set<() => void>()

// Every write bumps the stamp, so a /me/room answer that was already in flight when a
// newer value landed (a later refresh, or leaving the room) is dropped when it arrives.
let stamp = 0

export function setMyRoom(r: MyRoom): void {
  stamp++
  current = r
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useMyRoom(): MyRoom {
  return useSyncExternalStore(subscribe, () => current)
}

export async function refreshMyRoom(): Promise<void> {
  const s = getSession()
  if (!s.playerId || !s.token) return
  const mine = ++stamp
  try {
    const r = await request<{ room: MyRoom }>('GET', '/me/room')
    if (mine === stamp) setMyRoom(r.room)
  } catch (e) {
    // a network blip keeps what we knew; only a lost identity means "no room"
    if (mine === stamp && e instanceof ApiError && e.status === 401) setMyRoom(null)
  }
}

export async function leaveRoom(code: string): Promise<void> {
  await request('POST', `/rooms/${code}/leave`)
  setMyRoom(null)
}
