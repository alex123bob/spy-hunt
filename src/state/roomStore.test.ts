import { clockOffset, reduce, remainingMs } from './roomStore'
import type { Snapshot } from '../api/types'

function base(): Snapshot {
  return {
    code: 'ABCD', status: 'playing', phase: 'describe', phase_deadline: 1000, round: 1, game_no: 1, version: 1,
    main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0,
    players: [
      { seat: 0, name: 'A', lang: 'en', is_bot: false, alive: true, connected: true, is_host: true },
      { seat: 1, name: 'B', lang: 'zh-Hans', is_bot: false, alive: true, connected: true, is_host: false },
    ],
    messages: [], current_speaker: 0, me: { seat: 1, is_host: false, my_word: '灯塔' },
    winner: null, last_seq: 5, server_time: 0,
  }
}
const msg = (id: number) => ({ id, round: 1, stage: 0, seat: 0, kind: 'statement', text: 'hi', lang: 'en', created_at: 1 })
const ev = (event: string, data: unknown, id?: string) => ({ event, data, id })

test('duplicate statement id (replay after resume) is appended once', () => {
  let s = reduce(base(), ev('statement', { message: msg(1) }, '6'))
  s = reduce(s, ev('statement', { message: msg(1) }, '6'))
  expect(s.messages).toHaveLength(1)
  expect(s.last_seq).toBe(6)
})

test('translation for a not-yet-seen message is held then applied', () => {
  let s = reduce(base(), ev('translation', { message_id: 2, target_lang: 'zh-Hans', text: '你好' }))
  expect(s.messages).toHaveLength(0)
  s = reduce(s, ev('statement', { message: msg(2) }))
  expect(s.messages[0].translations).toEqual({ 'zh-Hans': '你好' })
})

test('translation attaches to an existing message', () => {
  let s = reduce(base(), ev('statement', { message: msg(3) }))
  s = reduce(s, ev('translation', { message_id: 3, target_lang: 'zh-Hans', text: '嗨' }))
  expect(s.messages[0].translations?.['zh-Hans']).toBe('嗨')
})

test('unknown event leaves state unchanged', () => {
  const s = base()
  expect(reduce(s, ev('from_the_future', { x: 1 }, '9'))).toBe(s)
})

test('state event replaces the snapshot and maps snapshot translation to the viewer language', () => {
  const snap = { ...base(), last_seq: 20, messages: [{ ...msg(1), translation: '你好' }] }
  const s = reduce(base(), ev('state', snap, '20'))
  expect(s.last_seq).toBe(20)
  expect(s.messages[0].translations).toEqual({ 'zh-Hans': '你好' })
})

test('stale polled state is ignored', () => {
  const s = base()
  expect(reduce(s, ev('state', { ...base(), last_seq: 1 }))).toBe(s)
})

test('reveal marks the eliminated player and a tiebreak records tied seats', () => {
  let s = reduce(base(), ev('reveal', { round: 1, stage: 0, outcome: 'eliminated', eliminated: 0, tied: null, role: 'spy', votes: [] }))
  expect(s.players[0]).toMatchObject({ alive: false, role: 'spy' })
  s = reduce(s, ev('reveal', { round: 1, stage: 0, outcome: 'tiebreak', eliminated: null, tied: [0, 1], votes: [] }))
  expect(s.tied).toEqual([0, 1])
})

test('game_over reveals roles and words', () => {
  const s = reduce(base(), ev('game_over', { winner: 'spies', roles: [{ seat: 0, role: 'spy' }, { seat: 1, role: 'civilian' }], words: { spy: { en: 'a' }, civilian: { en: 'b' } } }))
  expect(s.status).toBe('finished')
  expect(s.players[1].role).toBe('civilian')
  expect(s.words?.spy.en).toBe('a')
})

test('game_over keeps the per-seat credit breakdown', () => {
  const parts = { '1': [{ kind: 'played', n: 10 }] }
  const s = reduce(base(), ev('game_over', { winner: 'spies', roles: [], words: {}, credits: { '1': 10 }, credit_parts: parts }))
  expect(s.credit_parts).toEqual(parts)
})

test('with a clock 10 minutes fast, remainingMs is still the true remainder', () => {
  const serverNow = 1_000_000
  const localNow = serverNow + 10 * 60 * 1000
  const offset = clockOffset(new Date(serverNow).toUTCString(), localNow)
  expect(Math.abs(offset + 10 * 60 * 1000)).toBeLessThan(1000)
  expect(remainingMs(serverNow + 30_000, clockOffset(serverNow, localNow), localNow)).toBe(30_000)
  expect(remainingMs(serverNow - 5, clockOffset(serverNow, localNow), localNow)).toBe(0)
})

test('a state event keeps reveal and tied for the same game and round', () => {
  const info = { round: 1, stage: 0, outcome: 'tiebreak', eliminated: null, tied: [0, 1], votes: [] }
  let s = reduce(base(), ev('reveal', info, '6'))
  s = reduce(s, ev('state', { ...base(), phase: 'revote', last_seq: 8 }, '8'))
  expect(s.tied).toEqual([0, 1])
  expect(s.reveal).toMatchObject({ outcome: 'tiebreak' })
  const next = reduce(s, ev('state', { ...base(), round: 2, last_seq: 12 }, '12'))
  expect(next.tied).toBeNull()
  expect(next.reveal).toBeNull()
})

test('player_left after game over removes the player; mid-game keeps the seat', () => {
  const gone = { ...base().players[0], seat: 1 }
  const over = reduce({ ...base(), status: 'finished' }, ev('player_left', { player: gone }))
  expect(over.players.map((p) => p.seat)).toEqual([0])
  const mid = reduce(base(), ev('player_left', { player: { ...gone, is_bot: true } }))
  expect(mid.players.find((p) => p.seat === 1)?.is_bot).toBe(true)
})
