import { request } from '../api/client'
import type { BotCard, BotCatalog, BotDraft, MatchView, Recap, TopBot, TopKind } from '../api/types'
import { ensureGuest } from '../state/session'

export async function getCatalog(): Promise<BotCatalog> {
  await ensureGuest()
  return request<BotCatalog>('GET', '/bots/catalog')
}

export async function listMyBots(): Promise<BotCard[]> {
  await ensureGuest()
  const r = await request<{ bots?: BotCard[] }>('GET', '/bots')
  return Array.isArray(r?.bots) ? r.bots : []
}

export async function createBot(d: BotDraft): Promise<BotCard> {
  await ensureGuest()
  return request<BotCard>('POST', '/bots', d)
}

export async function updateBot(id: string, d: Partial<BotDraft>): Promise<BotCard> {
  await ensureGuest()
  return request<BotCard>('PATCH', `/bots/${encodeURIComponent(id)}`, d)
}

export async function deleteBot(id: string): Promise<void> {
  await ensureGuest()
  await request('DELETE', `/bots/${encodeURIComponent(id)}`)
}

export async function getBotCard(id: string): Promise<BotCard> {
  return request<BotCard>('GET', `/bots/${encodeURIComponent(id)}`)
}

export async function getTopBots(kind: TopKind): Promise<TopBot[]> {
  const r = await request<{ bots?: TopBot[] }>('GET', `/bots/top?kind=${kind}`)
  return Array.isArray(r?.bots) ? r.bots : []
}

export async function getRecaps(): Promise<{ recaps: Recap[]; unseen: number }> {
  await ensureGuest()
  const r = await request<{ recaps?: Recap[]; unseen?: number }>('GET', '/bots/recaps')
  return { recaps: Array.isArray(r?.recaps) ? r.recaps : [], unseen: typeof r?.unseen === 'number' ? r.unseen : 0 }
}

export async function markRecapsSeen(): Promise<void> {
  await ensureGuest()
  await request('POST', '/bots/recaps/seen')
}

export async function getMatch(id: string): Promise<MatchView> {
  return request<MatchView>('GET', `/arena/matches/${encodeURIComponent(id)}`)
}
