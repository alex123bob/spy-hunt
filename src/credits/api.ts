import { request } from '../api/client'
import type { CreditSummary } from '../api/types'
import { ensureGuest } from '../state/session'

export async function getCredits(): Promise<CreditSummary> {
  await ensureGuest()
  return request<CreditSummary>('GET', '/credits')
}
