import type { Lang } from '../api/types'

export function detectLang(navigatorLang: string): Lang {
  return (navigatorLang || '').toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}
