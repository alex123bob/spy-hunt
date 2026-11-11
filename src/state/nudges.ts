export type NudgeTrigger = 'streak' | 'win' | 'return'

export const STREAK_MILESTONE = 3
export const RETURN_VISIT_AT = 3

interface NudgeState {
  visits: number
  lastStreak?: number
  lastWinKey?: string
  pending: { streak?: number; win?: true; return?: true }
}

const KEY = 'spy-hunt.nudges'
const ORDER: NudgeTrigger[] = ['streak', 'win', 'return']
let memory: NudgeState | null = null

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

function load(): NudgeState {
  if (memory) return memory
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY)
      if (raw) {
        const v = JSON.parse(raw) as NudgeState
        if (v && typeof v.visits === 'number' && v.pending && typeof v.pending === 'object') {
          memory = v
          return memory
        }
      }
    } catch {
      // try the next storage
    }
  }
  memory = { visits: 0, pending: {} }
  return memory
}

const listeners = new Set<() => void>()

export function subscribeNudges(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function save(s: NudgeState): void {
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

export function recordStreakMilestone(streak: number): void {
  const s = load()
  // arm only on crossing the milestone, so reopening the result screen can't resurrect a dismissed banner
  const crossed = streak >= STREAK_MILESTONE && (s.lastStreak ?? 0) < STREAK_MILESTONE
  save({ ...s, lastStreak: streak, pending: crossed ? { ...s.pending, streak } : s.pending })
}

// `gameKey` (room code + game number) makes a win count once: remounting the same finished game
// must not bring a dismissed banner back.
export function recordWin(gameKey?: string): void {
  const s = load()
  if (gameKey !== undefined && s.lastWinKey === gameKey) return
  save({ ...s, lastWinKey: gameKey ?? s.lastWinKey, pending: { ...s.pending, win: true } })
}

export function recordVisit(): void {
  const s = load()
  const visits = s.visits + 1
  // arms only when the count first reaches the threshold, so a dismissed nudge stays gone
  save({ visits, pending: visits === RETURN_VISIT_AT ? { ...s.pending, return: true } : s.pending })
}

let countedThisLoad = false

// Landing remounts on every in-app trip home; only the first mount of a page load is a visit.
export function recordPageLoadVisit(): void {
  if (countedThisLoad) return
  countedThisLoad = true
  recordVisit()
}

export function pendingNudge(): NudgeTrigger | null {
  const p = load().pending
  return ORDER.find((k) => p[k] !== undefined) ?? null
}

export function pendingStreak(): number {
  return load().pending.streak ?? 0
}

export function dismiss(trigger: NudgeTrigger): void {
  const s = load()
  const pending = { ...s.pending }
  delete pending[trigger]
  save({ ...s, pending })
}

export function resetNudgesForTests(clearStorage = true): void {
  memory = null
  countedThisLoad = false
  if (!clearStorage) return
  for (const st of stores()) {
    try {
      st.removeItem(KEY)
    } catch {
      // ignore
    }
  }
}
