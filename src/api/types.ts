export type Lang = 'en' | 'zh-Hans'
export const LANGS: Lang[] = ['en', 'zh-Hans']

export type Role = 'spy' | 'civilian'
export type Phase = 'describe' | 'tiebreak_describe' | 'vote' | 'revote' | 'reveal' | null
export type Status = 'lobby' | 'playing' | 'finished' | 'closed'

export interface Player {
  seat: number
  name: string
  lang: Lang
  is_bot: boolean
  alive: boolean
  connected: boolean
  is_host: boolean
  role?: Role
}

export interface Message {
  id: number
  round: number
  stage: number
  seat: number | null
  kind: 'statement' | 'skipped' | 'host'
  text: string | null
  lang: Lang | null
  translation?: string | null
  translations?: Partial<Record<Lang, string>>
  created_at: number
}

export interface RoomConfig {
  bot_fill: boolean
  max_players: number
  min_players: number
  turn_seconds: number
  vote_seconds: number
  statement_max_chars: number
  [k: string]: unknown
}

export interface RevealInfo {
  round: number
  stage: number
  outcome: string
  eliminated: number | null
  tied: number[] | null
  role?: Role
  votes: { voter: number; target: number | null }[]
}

export type WordsByRole = Record<Role, Partial<Record<Lang, string>>>

export interface Snapshot {
  code: string
  status: Status
  phase: Phase
  phase_deadline: number | null
  round: number
  game_no: number
  version: number
  main_lang: Lang
  config: RoomConfig
  host_seat: number | null
  players: Player[]
  messages: Message[]
  current_speaker: number | null
  me: { seat: number; is_host: boolean; my_word: string | null }
  winner: 'civilians' | 'spies' | null
  last_seq: number
  server_time: number
  words?: WordsByRole
  // client-side extras maintained by the reducer
  locked?: number[]
  reveal?: RevealInfo | null
  tied?: number[] | null
  pendingTranslations?: Record<number, Partial<Record<Lang, string>>>
}

export interface ServerEvent {
  id?: string
  event: string
  data: unknown
}

export interface Guest {
  player_id: string
  token: string
}

export type DailyStage = 'spy' | 'word' | 'done'
export type WordPair = Record<Lang, string>

export interface DailyPuzzle {
  number: number
  day: string
  difficulty: 1 | 2 | 3
  origin_lang: Lang
  civilian_word: WordPair
  players: { seat: number; name: string }[]
  statements: Message[]
  options: WordPair[]
}

export interface DailyMe {
  stage: DailyStage
  tries: number
  tries_left: number
}

export interface DailyState {
  puzzle: DailyPuzzle
  me: DailyMe
}

export interface GuessResult {
  correct: boolean
  stage: DailyStage
  tries: number
  tries_left: number
}

export interface WordResult {
  correct: boolean | null
  stage: 'done'
}

export interface DailyResult {
  solved: boolean
  tries: number
  word_correct: boolean | null
  elapsed_ms: number
  score: number
  answer: { spy_seat: number; spy_word: WordPair; civilian_word: WordPair }
  stats: { players: number; solved_pct: number }
}
