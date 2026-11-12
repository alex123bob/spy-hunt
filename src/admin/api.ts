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

export async function startRefill(): Promise<{ started: boolean; refilling?: boolean }> {
  return request<{ started: boolean; refilling?: boolean }>('POST', '/admin/refill', undefined, adminHeaders())
}
