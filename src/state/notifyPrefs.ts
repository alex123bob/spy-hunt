import { useSyncExternalStore } from 'react'

export type NotifyPref = 'on' | 'off'

interface PrefState {
  pref: NotifyPref
}

const KEY = 'spy-hunt.notify-pref'
let memory: PrefState | null = null

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

function load(): PrefState {
  if (memory) return memory
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY)
      if (raw) {
        const v = JSON.parse(raw) as PrefState
        if (v && (v.pref === 'on' || v.pref === 'off')) {
          memory = v
          return memory
        }
      }
    } catch {
      // try the next storage
    }
  }
  memory = { pref: 'on' }
  return memory
}

const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function save(s: PrefState): void {
  memory = s
  listeners.forEach((l) => l())
  const json = JSON.stringify(s)
  for (const st of stores()) {
    try {
      st.setItem(KEY, json)
      return
    } catch {
      // try the next storage
    }
  }
}

export function getNotifyPref(): NotifyPref {
  return load().pref
}

export function setNotifyPref(p: NotifyPref): void {
  save({ pref: p })
}

export function useNotifyPref(): NotifyPref {
  return useSyncExternalStore(subscribe, getNotifyPref)
}

export function resetNotifyPrefForTests(): void {
  memory = null
}
