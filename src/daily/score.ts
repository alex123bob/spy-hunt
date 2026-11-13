import type { DailyResult } from '../api/types'

export type ScorePart = { kind: 'find' | 'speed' | 'word'; n: number }

// Mirrors the server's puzzles.score: find (100 on try 1, 60 on try 2) + speed (0-20) + word (20).
export const FIND_POINTS = { 1: 100, 2: 60 } as const
export const WORD_POINTS = 20

/** Split a daily score into its parts; speed is whatever the score has beyond find and word. */
export function scoreParts(r: Pick<DailyResult, 'solved' | 'tries' | 'word_correct' | 'score'>): ScorePart[] {
  if (!r.solved) return []
  const find = r.tries === 1 ? FIND_POINTS[1] : FIND_POINTS[2]
  const word = r.word_correct === true ? WORD_POINTS : 0
  const speed = Math.max(0, r.score - find - word)
  const parts: ScorePart[] = [{ kind: 'find', n: find }]
  if (speed > 0) parts.push({ kind: 'speed', n: speed })
  if (word > 0) parts.push({ kind: 'word', n: word })
  return parts
}
