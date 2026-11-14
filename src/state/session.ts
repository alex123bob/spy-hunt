import { request, setCredentials } from '../api/client'
import type { Guest, Lang } from '../api/types'
import { detectLang } from '../i18n/detect'

export interface Session {
  playerId: string
  token: string
  lang: Lang
  name: string
  email?: string
}

const KEY = 'spy-hunt.session'
let memory: Partial<Session> | null = null

// Monotonic write stamp. Date.now() is enough: a write made in a later page
// life always outranks the value a frozen store kept from an earlier one. The
// counter guards against two writes within the same millisecond.
let lastV = 0
function nextVersion(): number {
  lastV = Math.max(lastV + 1, Date.now())
  return lastV
}

// localStorage first; sessionStorage keeps the identity across reloads when it is blocked
const stores = (): Storage[] => {
  const out: Storage[] = []
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      out.push(globalThis[name])
    } catch {
      // access itself can throw
    }
  }
  return out
}

function readStore(): Partial<Session> {
  // Pick the freshest entry across stores by its write stamp `v`, not just the
  // first store that holds anything. On a device whose localStorage is frozen
  // with a stale value it can neither overwrite nor delete, a working
  // sessionStorage still carries a higher `v`, so the fresh value wins.
  let best: (Partial<Session> & { v?: number }) | null = null
  let bestV = -Infinity
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<Session> & { v?: number }
      const v = typeof parsed.v === 'number' ? parsed.v : 0
      if (best === null || v > bestV) {
        best = parsed
        bestV = v
      }
    } catch {
      // try the next storage
    }
  }
  if (best === null) return {}
  // Seed the in-process version so the next write outranks whatever we just
  // read, then drop the stamp so it never leaks into the Session shape.
  if (typeof best.v === 'number') lastV = Math.max(lastV, best.v)
  const { v: _v, ...session } = best
  return session
}

function writeStore(value: Partial<Session>): void {
  // Stamp each write with a monotonic version so readStore can pick the
  // freshest entry even when a store is frozen with an older value it can
  // neither overwrite nor delete. Clear the key from any store that rejects
  // the write, as a best effort when the store is writable at all.
  const stamped = { ...value, v: nextVersion() }
  const json = JSON.stringify(stamped)
  for (const st of stores()) {
    try {
      st.setItem(KEY, json)
    } catch {
      try {
        st.removeItem(KEY)
      } catch {
        // nothing more we can do with this store
      }
    }
  }
}

function load(): Partial<Session> {
  if (!memory) {
    memory = readStore()
    if (memory.playerId && memory.token) {
      setCredentials({ playerId: memory.playerId, token: memory.token })
    }
  }
  return memory
}

function save(patch: Partial<Session>): void {
  memory = { ...load(), ...patch }
  writeStore(memory)
}

export function getSession(): Session {
  const s = load()
  return {
    playerId: s.playerId ?? '',
    token: s.token ?? '',
    lang: s.lang ?? detectLang(typeof navigator !== 'undefined' ? navigator.language : 'en'),
    name: s.name ?? '',
  }
}

export function getCachedEmail(): string | null {
  return load().email ?? null
}

export function setCachedEmail(email: string | null): void {
  save({ email: email ?? undefined })
}

export function setName(name: string): void {
  save({ name })
}

export function setSessionLang(lang: Lang): void {
  save({ lang })
}

let inflight: Promise<Session> | null = null

export function ensureGuest(): Promise<Session> {
  const s = getSession()
  if (s.playerId && s.token) return Promise.resolve(s)
  if (!inflight) {
    setCredentials(null)
    const sent = getSession().lang
    inflight = request<Guest>('POST', '/guests', { lang: sent })
      .then(async (g) => {
        setAccountSession({ playerId: g.player_id, token: g.token })
        const now = getSession().lang
        // a pick made while this request was in flight never reached the server (no session yet)
        if (now !== sent) await request('PATCH', '/me', { lang: now }).catch(() => {})
        return getSession()
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function setAccountSession({ playerId, token }: { playerId: string; token: string }): void {
  save({ playerId, token })
  setCredentials({ playerId, token })
}

export function forgetGuest(): void {
  memory = { ...load(), playerId: undefined, token: undefined, email: undefined }
  setCredentials(null)
  writeStore({ lang: memory.lang, name: memory.name })
}

export function resetSessionForTests(): void {
  memory = null
  inflight = null
  setCredentials(null)
}
