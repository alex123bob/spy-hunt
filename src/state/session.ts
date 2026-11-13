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
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY)
      if (raw) return JSON.parse(raw) as Partial<Session>
    } catch {
      // try the next storage
    }
  }
  return {}
}

function writeStore(value: unknown): void {
  const json = JSON.stringify(value)
  for (const st of stores()) {
    try {
      st.setItem(KEY, json)
      return
    } catch {
      // try the next storage
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
    inflight = request<Guest>('POST', '/guests', { lang: getSession().lang })
      .then((g) => {
        setAccountSession({ playerId: g.player_id, token: g.token })
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
