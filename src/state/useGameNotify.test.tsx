import { renderHook } from '@testing-library/react'
import { useGameNotify } from './useGameNotify'
import { fireNotification } from './notify'
import { getNotifyPref } from './notifyPrefs'
import type { Player, Snapshot } from '../api/types'

vi.mock('./notify', () => ({ fireNotification: vi.fn(), notificationsSupported: () => true }))
vi.mock('./notifyPrefs', () => ({ getNotifyPref: vi.fn(() => 'on') }))

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

beforeEach(() => {
  vi.mocked(fireNotification).mockClear()
  vi.mocked(getNotifyPref).mockReturnValue('on')
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
})

afterEach(() => vi.restoreAllMocks())

const setup = (s: Snapshot) => renderHook(({ s }: { s: Snapshot }) => useGameNotify(s), { initialProps: { s } })

test('no notification on first render', () => {
  setup(snap())
  expect(fireNotification).not.toHaveBeenCalled()
})

test('fires a notification when the game starts, while unfocused', () => {
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).toHaveBeenCalledTimes(1)
})

test('fires a notification when it becomes my turn, while unfocused', () => {
  const h = setup(snap({ status: 'playing', phase: 'describe', current_speaker: 1 }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0 }) })
  expect(fireNotification).toHaveBeenCalledTimes(1)
})

test('says "speak" for a describe-phase turn, "vote" for a vote-phase turn', () => {
  const h = setup(snap({ status: 'playing', phase: 'describe', current_speaker: 1 }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0 }) })
  expect(fireNotification).toHaveBeenCalledWith('Your turn to speak', expect.anything())
  vi.mocked(fireNotification).mockClear()
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 1 }) })
  h.rerender({ s: snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [] }) })
  expect(fireNotification).toHaveBeenCalledWith('Your turn to vote', expect.anything())
})

test('does nothing while the tab is focused', () => {
  vi.mocked(document.hasFocus).mockReturnValue(true)
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).not.toHaveBeenCalled()
})

test('does nothing when the pref is off, even unfocused', () => {
  vi.mocked(getNotifyPref).mockReturnValue('off')
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).not.toHaveBeenCalled()
})

test('fires twice, in order, when started and turn both land in one transition', () => {
  const h = setup(snap({ status: 'lobby', current_speaker: null }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0 }) })
  expect(fireNotification).toHaveBeenCalledTimes(2)
})

test('a describe-turn alert and a vote-turn alert in the same round use different tags (must not collapse into one)', () => {
  const h = setup(snap({ status: 'playing', phase: 'describe', current_speaker: 1, round: 2 }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0, round: 2 }) })
  const describeTag = vi.mocked(fireNotification).mock.calls[0][1]?.tag
  vi.mocked(fireNotification).mockClear()
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 1, round: 2 }) })
  h.rerender({ s: snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [], round: 2 }) })
  const voteTag = vi.mocked(fireNotification).mock.calls[0][1]?.tag
  expect(describeTag).not.toBe(voteTag)
})
