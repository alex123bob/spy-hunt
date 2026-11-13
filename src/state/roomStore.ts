import { useSyncExternalStore } from 'react'
import type { Lang, Message, Player, RevealInfo, Role, ServerEvent, Snapshot, WordsByRole } from '../api/types'

export function clockOffset(serverDate: string | number, localNow: number): number {
  const ms = typeof serverDate === 'number' ? serverDate : Date.parse(serverDate)
  return Number.isNaN(ms) ? 0 : ms - localNow
}

export function remainingMs(deadline: number | null, offset: number, now: number): number {
  if (deadline == null) return 0
  return Math.max(0, deadline - (now + offset))
}

function viewerLang(s: Snapshot): Lang {
  return s.players.find((p) => p.seat === s.me.seat)?.lang ?? s.main_lang
}

function withMe(s: Snapshot): Snapshot {
  const me = s.players.find((p) => p.seat === s.me.seat)
  return me && me.is_host !== s.me.is_host ? { ...s, me: { ...s.me, is_host: me.is_host } } : s
}

function normalize(s: Snapshot, pending: Snapshot['pendingTranslations'] = {}): Snapshot {
  const vl = viewerLang(s)
  const messages = (s.messages ?? []).map((m) => {
    const tr: Partial<Record<Lang, string>> = { ...(m.translations ?? {}), ...(pending[m.id] ?? {}) }
    if (m.translation && m.lang !== vl) tr[vl] = m.translation
    return { ...m, translations: tr }
  })
  return { ...s, messages, locked: s.locked ?? [], reveal: s.reveal ?? null, tied: s.tied ?? null }
}

function upsertPlayer(players: Player[], p: Player): Player[] {
  const i = players.findIndex((x) => x.seat === p.seat)
  if (i < 0) return [...players, p].sort((a, b) => a.seat - b.seat)
  const next = players.slice()
  next[i] = { ...players[i], ...p }
  return next
}

type Data = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function reduce(s: Snapshot, ev: ServerEvent): Snapshot {
  const d = (ev.data ?? {}) as Data
  const seq = ev.id !== undefined && ev.id !== '' ? Number(ev.id) : NaN
  let n = apply(s, ev.event, d)
  if (n === s) return s
  if (!Number.isNaN(seq) && ev.event !== 'state' && seq > (n.last_seq ?? 0)) n = { ...n, last_seq: seq }
  return withMe(n)
}

function apply(s: Snapshot, type: string, d: Data): Snapshot {
  switch (type) {
    case 'state': {
      const snap = d as unknown as Snapshot
      if (!snap || !snap.code) return s
      if (s.last_seq && snap.last_seq < s.last_seq) return s // stale poll
      const same = snap.game_no === s.game_no && snap.round === s.round
      return normalize(
        {
          ...snap,
          locked: s.locked && snap.phase === s.phase ? s.locked : [],
          reveal: same ? s.reveal : null,
          tied: same ? s.tied : null,
        },
        s.pendingTranslations,
      )
    }
    case 'statement': {
      const m = d.message as Message | undefined
      if (!m || s.messages.some((x) => x.id === m.id)) return s
      const pend = s.pendingTranslations?.[m.id]
      const { [m.id]: _used, ...rest } = s.pendingTranslations ?? {}
      void _used
      return {
        ...s,
        messages: [...s.messages, { ...m, translations: { ...(m.translations ?? {}), ...(pend ?? {}) } }],
        pendingTranslations: rest,
      }
    }
    case 'translation': {
      const id = d.message_id as number
      const lang = d.target_lang as Lang
      const text = d.text as string
      if (typeof id !== 'number' || !lang || typeof text !== 'string') return s
      if (s.messages.some((m) => m.id === id)) {
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, translations: { ...(m.translations ?? {}), [lang]: text } } : m,
          ),
        }
      }
      return { ...s, pendingTranslations: { ...(s.pendingTranslations ?? {}), [id]: { ...(s.pendingTranslations?.[id] ?? {}), [lang]: text } } }
    }
    case 'turn':
      return { ...s, current_speaker: d.seat ?? null, phase: d.phase ?? s.phase, phase_deadline: d.deadline ?? null, round: d.round ?? s.round, locked: [] }
    case 'phase':
      return {
        ...s,
        phase: d.phase ?? null,
        phase_deadline: d.deadline ?? null,
        round: d.round ?? s.round,
        current_speaker: null,
        locked: [],
      }
    case 'roster':
      return { ...s, players: (d.players as Player[]) ?? s.players }
    case 'game_started':
      return {
        ...s,
        status: 'playing',
        game_no: d.game_no ?? s.game_no,
        me: { ...s.me, seat: d.seat ?? s.me.seat, my_word: d.my_word ?? null },
        messages: [],
        winner: null,
        words: undefined,
        reveal: null,
        tied: null,
        locked: [],
        round: 1,
        players: s.players.map((p) => ({ ...p, alive: true, role: undefined })),
      }
    case 'vote_locked':
      return typeof d.seat === 'number' && !(s.locked ?? []).includes(d.seat)
        ? { ...s, locked: [...(s.locked ?? []), d.seat] }
        : s
    case 'reveal': {
      const info = d as unknown as RevealInfo
      const elim = info.eliminated
      return {
        ...s,
        reveal: info,
        tied: info.outcome === 'tiebreak' ? info.tied : null,
        locked: [],
        players:
          elim == null
            ? s.players
            : s.players.map((p) => (p.seat === elim ? { ...p, alive: false, role: info.role as Role | undefined } : p)),
      }
    }
    case 'game_over': {
      const roles = (d.roles as { seat: number; role: Role }[]) ?? []
      return {
        ...s,
        status: 'finished',
        phase: null,
        phase_deadline: null,
        current_speaker: null,
        winner: d.winner ?? null,
        words: d.words as WordsByRole,
        credits: (d.credits as Record<string, number> | undefined) ?? undefined,
        credit_parts: (d.credit_parts as Snapshot['credit_parts']) ?? undefined,
        players: s.players.map((p) => ({ ...p, role: roles.find((r) => r.seat === p.seat)?.role ?? p.role })),
      }
    }
    case 'player_joined':
    case 'player_updated':
      return d.player ? { ...s, players: upsertPlayer(s.players, d.player as Player) } : s
    case 'player_left': {
      const p = d.player as Player | undefined
      if (!p) return s
      return s.status === 'playing'
        ? { ...s, players: upsertPlayer(s.players, p) }
        : { ...s, players: s.players.filter((x) => x.seat !== p.seat) }
    }
    case 'settings':
      return { ...s, main_lang: d.main_lang ?? s.main_lang, config: { ...s.config, bot_fill: d.bot_fill ?? s.config.bot_fill } }
    case 'rematch':
      return {
        ...s,
        status: 'lobby',
        phase: null,
        phase_deadline: null,
        round: 0,
        game_no: d.game_no ?? s.game_no + 1,
        players: (d.players as Player[]) ?? s.players.map((p) => ({ ...p, role: undefined, alive: true })),
        messages: [],
        winner: null,
        words: undefined,
        reveal: null,
        tied: null,
        locked: [],
        current_speaker: null,
        me: { ...s.me, my_word: null },
      }
    case 'closed':
      return { ...s, status: 'closed' }
    default:
      return s // unknown event types are ignored
  }
}

// ---- observable store ----

export class RoomStore {
  state: Snapshot | null = null
  offset = 0
  streamStatus: string = 'connecting'
  private listeners = new Set<() => void>()
  private version = 0

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getVersion = () => this.version
  private emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }
  setSnapshot(snap: Snapshot) {
    this.state = normalize(snap)
    this.offset = clockOffset(snap.server_time, Date.now())
    this.emit()
  }
  dispatch(ev: ServerEvent) {
    if (!this.state) {
      if (ev.event === 'state') {
        const snap = ev.data as Snapshot
        if (snap?.code) this.setSnapshot(snap)
      }
      return
    }
    const next = reduce(this.state, ev)
    if (ev.event === 'state' && next !== this.state) {
      const st = (ev.data as Snapshot).server_time
      if (st) this.offset = clockOffset(st, Date.now())
    }
    if (next !== this.state) {
      this.state = next
      this.emit()
    }
  }
  setStatus(s: string) {
    this.streamStatus = s
    this.emit()
  }
}

export function useRoomStore(store: RoomStore): { state: Snapshot | null; status: string; offset: number } {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
  return { state: store.state, status: store.streamStatus, offset: store.offset }
}
