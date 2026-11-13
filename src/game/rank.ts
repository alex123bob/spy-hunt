export interface RankInfo {
  key: string
  min: number
  hero: string
}

// Must mirror backend credits.py RANKS (ascending by min).
export const RANKS: RankInfo[] = [
  { key: 'rookie', min: 0, hero: '🐣' },
  { key: 'sleuth', min: 250, hero: '🦊' },
  { key: 'hunter', min: 750, hero: '🕵️' },
  { key: 'senior', min: 2000, hero: '🦉' },
  { key: 'mastermind', min: 5000, hero: '🧠' },
  { key: 'legend', min: 12000, hero: '👑' },
]

export function rankByIndex(i: number): RankInfo {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, i))]
}

export function rankTitleKey(i: number): string {
  return `rank.${rankByIndex(i).key}`
}
