import { request } from '../api/client'
import type { DailyResult, DailyState, GuessResult, WordResult } from '../api/types'
import { ensureGuest } from '../state/session'

export async function getDaily(): Promise<DailyState> {
  await ensureGuest()
  return request<DailyState>('GET', '/daily')
}

export async function guessSpy(seat: number, day: string): Promise<GuessResult> {
  await ensureGuest()
  return request<GuessResult>('POST', '/daily/guess', { spy_seat: seat, day })
}

export async function guessWord(option: number | null, day: string): Promise<WordResult> {
  await ensureGuest()
  return request<WordResult>('POST', '/daily/word', { option, day })
}

export async function getResult(day: string): Promise<DailyResult> {
  await ensureGuest()
  return request<DailyResult>('GET', `/daily/result?day=${day}`)
}
