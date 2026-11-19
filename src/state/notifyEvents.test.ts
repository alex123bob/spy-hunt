import { detectNotifyEvents } from './notifyEvents'
import type { Player, Snapshot } from '../api/types'

const p = (seat: number, overrides: Partial<Player> = {}): Player =>
  ({ seat, name: `P${seat}`, lang: 'en', is_bot: false, alive: true, connected: true, is_host: seat === 0, ...overrides }) as Player

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'lobby', phase: null, phase_deadline: null, round: 0, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0, players: [p(0), p(1)], messages: [], current_speaker: null,
    me: { seat: 0, is_host: true, my_word: null }, winner: null, last_seq: 1, server_time: Date.now(), locked: [],
    ...overrides,
  } as Snapshot
}

test('no prev snapshot: no events', () => {
  expect(detectNotifyEvents(null, snap())).toEqual([])
})

test('status lobby -> playing: started', () => {
  const prev = snap({ status: 'lobby' })
  const next = snap({ status: 'playing', current_speaker: 1 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'started' }])
})

test('rematch playing -> lobby -> playing again: started fires each time', () => {
  const a = snap({ status: 'playing', game_no: 1 })
  const b = snap({ status: 'lobby', game_no: 2 })
  const c = snap({ status: 'playing', game_no: 2, current_speaker: 1 })
  expect(detectNotifyEvents(a, b)).toEqual([])
  expect(detectNotifyEvents(b, c)).toEqual([{ kind: 'started' }])
})

test('current_speaker becomes my seat: turn', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 1 })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'turn' }])
})

test('current_speaker becomes my seat but I am eliminated: no turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 1, players: [p(0, { alive: false }), p(1)] })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0, players: [p(0, { alive: false }), p(1)] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('entering an unlocked vote phase while alive and not locked: turn', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [] })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'turn' }])
})

test('entering vote phase already locked (e.g. reconnect mid-phase): no turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [0] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('host who also speaks first: started and turn both fire from one transition', () => {
  const prev = snap({ status: 'lobby', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'started' }, { kind: 'turn' }])
})

test('different room code: no events even if the shape looks like a turn change', () => {
  const prev = snap({ code: 'ABCD', status: 'playing', phase: 'describe', current_speaker: 1 })
  const next = snap({ code: 'WXYZ', status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('current_speaker unchanged: no repeated turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0, messages: [{ id: 1 } as never] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('entering a revote while tied myself: no turn event (tied players cannot vote)', () => {
  const prev = snap({ status: 'playing', phase: 'reveal', current_speaker: null, locked: [] })
  const next = snap({ status: 'playing', phase: 'revote', current_speaker: null, locked: [], tied: [0, 1] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('entering a revote while not tied: turn', () => {
  const prev = snap({ status: 'playing', phase: 'reveal', current_speaker: null, locked: [] })
  const next = snap({ status: 'playing', phase: 'revote', current_speaker: null, locked: [], tied: [1, 2] })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'turn' }])
})
