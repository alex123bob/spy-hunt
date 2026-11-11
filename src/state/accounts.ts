import { useEffect, useState } from 'react'
import { request } from '../api/client'
import type { Account } from '../api/types'
import { ensureGuest, forgetGuest, getSession, setAccountSession } from './session'

export async function register(email: string, password: string): Promise<Account> {
  await ensureGuest()
  return request<Account>('POST', '/register', { email, password })
}

export async function login(email: string, password: string): Promise<void> {
  const r = await request<{ player_id: string; token: string }>('POST', '/login', { email, password })
  setAccountSession({ playerId: r.player_id, token: r.token })
}

export async function logout(): Promise<void> {
  try {
    await request('POST', '/logout')
  } catch {
    // the device is signed out locally either way
  }
  forgetGuest()
}

let inflight: Promise<Account> | null = null

// TopBar and NudgeBanner both mount at once; share one request instead of sending two
export function getAccount(): Promise<Account> {
  if (!inflight) {
    inflight = (async () => {
      try {
        await ensureGuest()
        const r = await request<Account>('GET', '/me')
        return { email: typeof r?.email === 'string' ? r.email : null }
      } catch {
        return { email: null }
      }
    })().finally(() => {
      inflight = null
    })
  }
  return inflight
}

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ email: null })
  useEffect(() => {
    if (!getSession().playerId) return
    let live = true
    getAccount().then((a) => live && setAccount(a))
    return () => {
      live = false
    }
  }, [])
  return account
}
