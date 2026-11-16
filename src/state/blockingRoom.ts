import { ApiError } from '../api/client'

export type BlockingRoom = { code: string; status: 'lobby' | 'playing' }

// The room behind an `already_in_room` refusal, or null for any other error.
export function blockingRoom(e: unknown): BlockingRoom | null {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== 'already_in_room') return null
  const { code, status } = e.data
  if (typeof code !== 'string' || !code) return null
  return { code, status: status === 'playing' ? 'playing' : 'lobby' }
}
