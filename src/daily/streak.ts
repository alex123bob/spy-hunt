export interface StreakState {
  lastDay: string | null
  lastSolvedDay: string | null
  streak: number
  best: number
  history: Record<string, { solved: boolean; score: number }>
}

const KEY = 'spy-hunt.daily'
const EMPTY: StreakState = { lastDay: null, lastSolvedDay: null, streak: 0, best: 0, history: {} }
let memory: StreakState | null = null

function valid(v: unknown): v is StreakState {
  const s = v as StreakState
  return (
    !!s && typeof s === 'object' && typeof s.streak === 'number' && typeof s.best === 'number' &&
    (s.lastDay === null || typeof s.lastDay === 'string') &&
    (s.lastSolvedDay === null || typeof s.lastSolvedDay === 'string') &&
    !!s.history && typeof s.history === 'object'
  )
}

export function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (valid(parsed)) return parsed
    }
  } catch {
    // corrupt or blocked: fall through to memory
  }
  return memory ?? { ...EMPTY, history: {} }
}

function save(s: StreakState): void {
  memory = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage blocked: memory keeps it for this tab
  }
}

export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function recordResult(day: string, solved: boolean, score: number): StreakState {
  const s = loadStreak()
  if (s.history[day]) return s
  const next: StreakState = { ...s, history: { ...s.history, [day]: { solved, score } }, lastDay: day }
  if (solved) {
    next.streak = s.lastSolvedDay === previousDay(day) ? s.streak + 1 : 1
    next.lastSolvedDay = day
  } else {
    next.streak = 0
  }
  next.best = Math.max(s.best, next.streak)
  save(next)
  return next
}

export function playedToday(day: string): boolean {
  return !!loadStreak().history[day]
}

export function currentStreak(today: string): number {
  const s = loadStreak()
  return s.lastSolvedDay === today || s.lastSolvedDay === previousDay(today) ? s.streak : 0
}

export function resetStreakForTests(): void {
  memory = null
}
