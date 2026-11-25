import { request } from '../api/client'
import { getToken } from './token'

export interface AdminStatus {
  ready_count: number
  total_count: number
  refilling: boolean
}

function adminHeaders(): Record<string, string> {
  return { 'X-Admin-Token': getToken() ?? '' }
}

export async function getAdminStatus(): Promise<AdminStatus> {
  return request<AdminStatus>('GET', '/admin/status', undefined, adminHeaders())
}

export interface AdminStats {
  day: string
  rooms: {
    active_lobby: number
    active_playing: number
    rooms_created_today: number
    games_finished_today: number
    trend: Array<{ day: string; rooms_created: number; games_finished: number }>
  }
  puzzles: {
    ready_count: number
    total_count: number
    attempts_today: number
    solved_today: number
    trend: Array<{ day: string; attempts: number; solved: number }>
  }
  accounts: {
    total_guests: number
    new_today: number
    trend: Array<{ day: string; new: number }>
  }
  economy: {
    credits_issued_today: number
    trend: Array<{ day: string; credits: number }>
  }
  bots: {
    total_custom_bots: number
    arena_matches_today: number
    trend: Array<{ day: string; matches: number }>
  }
  clans: {
    total_clans: number
    total_members: number
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  return request<AdminStats>('GET', '/admin/stats', undefined, adminHeaders())
}

export async function startRefill(count: number): Promise<{ started: boolean; refilling?: boolean }> {
  return request<{ started: boolean; refilling?: boolean }>('POST', '/admin/refill', { count }, adminHeaders())
}
