import { request } from '../api/client'
import type { BadgeCatalog, ClanBadge, ClanInfo, MyClan } from '../api/types'
import { ensureGuest } from './session'

export async function getMyClan(): Promise<MyClan> {
  await ensureGuest()
  return request<MyClan>('GET', '/clans/mine')
}

export async function getBadges(): Promise<BadgeCatalog> {
  return request<BadgeCatalog>('GET', '/clans/badges')
}

export async function changeBadge(badge: ClanBadge): Promise<ClanInfo> {
  return request<ClanInfo>('PUT', '/clans/badge', { badge })
}

export async function createClan(name: string, badge: ClanBadge): Promise<ClanInfo> {
  return request<ClanInfo>('POST', '/clans', { name, badge })
}

export async function joinClan(code: string): Promise<ClanInfo> {
  return request<ClanInfo>('POST', '/clans/join', { code: code.trim().toUpperCase() })
}

export async function leaveClan(): Promise<void> {
  await request('POST', '/clans/leave')
}

export async function listOpenClans(): Promise<ClanInfo[]> {
  await ensureGuest()
  return (await request<{ clans: ClanInfo[] }>('GET', '/clans/open')).clans
}
