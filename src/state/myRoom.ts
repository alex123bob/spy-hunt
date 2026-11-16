import { useSyncExternalStore } from 'react'
import { request } from '../api/client'
import { getSession } from './session'

// The room this player currently holds a seat in (lobby or playing), or null.
export type MyRoom = { code: string; status: 'lobby' | 'playing' } | null

let current: MyRoom = null
const listeners = new Set<() => void>()

export function setMyRoom(r: MyRoom): void {
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
  try {
    const r = await request<{ room: MyRoom }>('GET', '/me/room')
    setMyRoom(r.room)
  } catch {
    setMyRoom(null)
  }
}

export async function leaveRoom(code: string): Promise<void> {
  await request('POST', `/rooms/${code}/leave`)
  setMyRoom(null)
}
