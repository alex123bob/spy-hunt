import type { Message, Player, Snapshot } from '../api/types'

export function player(seat: number, over: Partial<Player> = {}): Player {
  return { seat, name: `P${seat}`, lang: 'en', is_bot: false, alive: true, connected: true, is_host: seat === 0, ...over }
}

export function msg(id: number, over: Partial<Message> = {}): Message {
  return { id, round: 1, stage: 0, seat: 0, kind: 'statement', text: 'hello', lang: 'en', created_at: 1, translations: {}, ...over }
}

export function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'playing', phase: 'describe', phase_deadline: Date.now() + 30000, round: 1, game_no: 1, version: 1,
    main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0,
    players: [player(0), player(1), player(2), player(3, { is_bot: true })],
    messages: [], current_speaker: 1, me: { seat: 1, is_host: false, my_word: 'river' },
    winner: null, last_seq: 1, server_time: Date.now(), locked: [], reveal: null, tied: null,
    ...over,
  }
}
