import { useEffect, useState } from 'react'
import { ApiError, request } from '../api/client'
import { setLang } from '../i18n'
import type { Account, Lang } from '../api/types'
import { ensureGuest, forgetGuest, getCachedEmail, getSession, setAccountSession, setCachedEmail, setSessionLang } from './session'

export async function register(email: string, password: string): Promise<Account> {
  await ensureGuest()
  const acct = await request<Account>('POST', '/register', { email, password })
  setCachedEmail(acct.email)
  return acct
}

export async function login(email: string, password: string): Promise<void> {
  const r = await request<{ player_id: string; token: string; email?: string; preferred_lang?: Lang | null }>(
    'POST', '/login', { email, password },
  )
  setAccountSession({ playerId: r.player_id, token: r.token })
  setCachedEmail(r.email ?? null)
  if (r.preferred_lang) {
    setLang(r.preferred_lang)
    setSessionLang(r.preferred_lang)
  }
}

export async function patchMyLang(lang: Lang): Promise<void> {
  if (!getSession().playerId) return
  try {
    await request('PATCH', '/me', { lang })
  } catch {
    // best-effort; a language pick must not surface an error to the player
  }
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
        const email = typeof r?.email === 'string' ? r.email : null
        setCachedEmail(email)
        // accounts made before language persistence have none: adopt this device's language once
        if (r && r.preferred_lang === null) void patchMyLang(getSession().lang)
        return { email }
      } catch (e) {
        // a transient failure keeps what we last knew; only a rejected token means signed out
        if (e instanceof ApiError && e.status === 401) {
          setCachedEmail(null)
          return { email: null }
        }
        return { email: getCachedEmail() }
      }
    })().finally(() => {
      inflight = null
    })
  }
  return inflight
}

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>(() => ({ email: getCachedEmail() }))
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
