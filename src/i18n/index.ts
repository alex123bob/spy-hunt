import { useSyncExternalStore } from 'react'
import type { Lang } from '../api/types'
import en from './en.json'
import zhHans from './zh-Hans.json'
import { detectLang } from './detect'

export { detectLang }

const dicts: Record<Lang, Record<string, string>> = { en, 'zh-Hans': zhHans }

let current: Lang = detectLang(typeof navigator !== 'undefined' ? navigator.language : 'en')
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  listeners.forEach((l) => l())
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}
