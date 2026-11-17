import { renderHook } from '@testing-library/react'
import { useHostChange } from './useHostChange'
import type { Player, Snapshot } from '../api/types'

const p = (seat: number, name: string, is_host: boolean, connected = true): Player =>
  ({ seat, name, lang: 'en', is_bot: false, alive: true, connected, is_host }) as Player

function snap(players: Player[], meSeat: number, code = 'ABCD'): Snapshot {
  const host = players.find((x) => x.is_host)
  return {
    code, status: 'lobby', phase: null, phase_deadline: null, round: 0, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: host?.seat ?? null, players, messages: [], current_speaker: null,
    me: { seat: meSeat, is_host: !!host && host.seat === meSeat, my_word: null },
    winner: null, last_seq: 1, server_time: Date.now(),
  } as Snapshot
}

const setup = (s: Snapshot) => renderHook(({ s }: { s: Snapshot }) => useHostChange(s), { initialProps: { s } })

test('no toast on first render', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  expect(h.result.current.text).toBe('')
})

test('no toast while the host stays the same', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  h.rerender({ s: snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 1) })
  expect(h.result.current.text).toBe('')
})

test('the new host is told they are the host after the old host is removed', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  h.rerender({ s: snap([p(1, 'Sam', true)], 1) })
  expect(h.result.current.text).toBe("Alex left. You're now the host.")
})

test('others are told who took over', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 2))
  h.rerender({ s: snap([p(1, 'Sam', true), p(2, 'Kim', false)], 2) })
  expect(h.result.current.text).toBe('Alex left. Sam is now the host.')
})

test('a host who leaves mid-game becomes a bot with the same name: still "left"', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 2))
  const bot = { ...p(0, 'Alex', false), is_bot: true } as Player
  h.rerender({ s: snap([bot, p(1, 'Sam', false), p(2, 'Kim', false)], 2) })
  expect(h.result.current.text).toBe('')
  h.rerender({ s: snap([bot, p(1, 'Sam', true), p(2, 'Kim', false)], 2) })
  expect(h.result.current.text).toBe('Alex left. Sam is now the host.')
})

test('the real leave sends a hostless frame before the new host: the toast still shows', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 2))
  h.rerender({ s: snap([p(1, 'Sam', false), p(2, 'Kim', false)], 2) })
  expect(h.result.current.text).toBe('')
  h.rerender({ s: snap([p(1, 'Sam', true), p(2, 'Kim', false)], 2) })
  expect(h.result.current.text).toBe('Alex left. Sam is now the host.')
})

test('a game-start reseat keeps the same host in a new seat: no toast', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false), p(3, 'Bo', false)], 1))
  h.rerender({ s: snap([p(0, 'Sam', false), p(1, 'Kim', false), p(2, 'Alex', true), p(3, 'Bo', false)], 1) })
  expect(h.result.current.text).toBe('')
  expect(h.result.current.n).toBe(0)
})

test('old host still listed and connected: no "left" wording', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  h.rerender({ s: snap([p(0, 'Alex', false), p(1, 'Sam', true)], 1) })
  expect(h.result.current.text).toBe("You're now the host.")
  const o = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 2))
  o.rerender({ s: snap([p(0, 'Alex', false), p(1, 'Sam', true), p(2, 'Kim', false)], 2) })
  expect(o.result.current.text).toBe('Sam is now the host.')
})

test('two handovers in a row both show, with a fresh nonce each time', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false), p(2, 'Kim', false)], 2))
  const n0 = h.result.current.n
  h.rerender({ s: snap([p(1, 'Sam', true), p(2, 'Kim', false)], 2) })
  expect(h.result.current.n).toBe(n0 + 1)
  expect(h.result.current.text).toBe('Alex left. Sam is now the host.')
  h.rerender({ s: snap([p(2, 'Kim', true)], 2) })
  expect(h.result.current.n).toBe(n0 + 2)
  expect(h.result.current.text).toBe("Sam left. You're now the host.")
})

test('no host in the new state: no toast and no crash', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  h.rerender({ s: snap([p(1, 'Sam', false)], 1) })
  expect(h.result.current.text).toBe('')
})

test('a different room code does not toast', () => {
  const h = setup(snap([p(0, 'Alex', true), p(1, 'Sam', false)], 1))
  h.rerender({ s: snap([p(5, 'Zed', true), p(1, 'Sam', false)], 1, 'WXYZ') })
  expect(h.result.current.text).toBe('')
})
