import { request } from '../api/client'
import type { GameDetail, GameReplay, GameSummary } from '../api/types'
import { ensureGuest } from '../state/session'

export async function getMyGames(): Promise<GameSummary[]> {
  await ensureGuest()
  return request<GameSummary[]>('GET', '/me/games')
}

export async function getMyGameDetail(roomId: string, gameNo: number): Promise<GameDetail> {
  await ensureGuest()
  return request<GameDetail>('GET', `/me/games/${roomId}/${gameNo}`)
}

export async function getMyGameReplay(roomId: string, gameNo: number): Promise<GameReplay> {
  await ensureGuest()
  return request<GameReplay>('GET', `/me/games/${roomId}/${gameNo}/replay`)
}
