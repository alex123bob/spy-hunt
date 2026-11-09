import { request, setCredentials } from '../api/client'
import type { Guest, Lang } from '../api/types'
import { detectLang } from '../i18n/detect'

export interface Session {
  playerId: string
  token: string
  lang: Lang
  name: string
}

const KEY = 'spy-hunt.session'
let memory: Partial<Session> | null = null

function readStore(): Partial<Session> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Session>) : {}
  } catch {
    return {}
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
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // storage blocked: the in-memory copy keeps the session alive
  }
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

export function setName(name: string): void {
  save({ name })
}

export function setSessionLang(lang: Lang): void {
  save({ lang })
}

export async function ensureGuest(): Promise<Session> {
  const s = getSession()
  if (s.playerId && s.token) return s
  setCredentials(null)
  const g = await request<Guest>('POST', '/guests')
  save({ playerId: g.player_id, token: g.token })
  setCredentials({ playerId: g.player_id, token: g.token })
  return getSession()
}

export function forgetGuest(): void {
  memory = { ...load(), playerId: undefined, token: undefined }
  setCredentials(null)
  try {
    localStorage.setItem(KEY, JSON.stringify({ lang: memory.lang, name: memory.name }))
  } catch {
    // ignore
  }
}

export function resetSessionForTests(): void {
  memory = null
  setCredentials(null)
}
