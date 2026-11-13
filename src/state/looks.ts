import { request } from '../api/client'
import type { Look, LooksCatalog } from '../api/types'
import { ensureGuest } from './session'

export async function getLooks(): Promise<LooksCatalog> {
  await ensureGuest()
  return request<LooksCatalog>('GET', '/looks')
}

export async function saveLook(look: Look): Promise<LooksCatalog> {
  await ensureGuest()
  return request<LooksCatalog>('PUT', '/looks', look)
}
