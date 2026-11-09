import { act, renderHook } from '@testing-library/react'
import { REVEAL_MS, TABLE_TO_VOTE_MS, useHeldScreen, type Screen } from './useHeldScreen'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(initial: Screen, reveal: unknown = null) {
  return renderHook((p: { t: Screen; r: unknown }) => useHeldScreen(p.t, p.r), {
    initialProps: { t: initial, r: reveal },
  })
}

test('the table stays briefly after the last statement before the vote screen', () => {
  const h = setup('table')
  h.rerender({ t: 'vote', r: null })
  expect(h.result.current.screen).toBe('table')
  act(() => { vi.advanceTimersByTime(TABLE_TO_VOTE_MS + 50) })
  expect(h.result.current.screen).toBe('vote')
})

test('a vote result that ends the game stays up before the result screen', () => {
  const h = setup('vote')
  const reveal = { eliminated: 2 }
  h.rerender({ t: 'result', r: reveal })
  expect(h.result.current.screen).toBe('reveal')
  act(() => { vi.advanceTimersByTime(REVEAL_MS - 100) })
  expect(h.result.current.screen).toBe('reveal')
  act(() => { vi.advanceTimersByTime(200) })
  expect(h.result.current.screen).toBe('result')
})

test('a tie-break result stays up before the next describe round', () => {
  const h = setup('vote')
  h.rerender({ t: 'table', r: { outcome: 'tiebreak' } })
  expect(h.result.current.screen).toBe('reveal')
  act(() => { vi.advanceTimersByTime(REVEAL_MS + 50) })
  expect(h.result.current.screen).toBe('table')
})

test('no hold on first render or reload with an existing reveal', () => {
  const h = setup('result', { eliminated: 2 })
  expect(h.result.current.screen).toBe('result')
})

test('a rematch (lobby) is never held back', () => {
  const h = setup('vote')
  h.rerender({ t: 'result', r: { e: 1 } })
  h.rerender({ t: 'lobby', r: null })
  expect(h.result.current.screen).toBe('lobby')
})

test('exposes when the hold ends so screens can show a countdown', () => {
  const h = setup('vote')
  h.rerender({ t: 'result', r: { eliminated: 2 } })
  expect(h.result.current.holdUntil).toBeGreaterThan(Date.now())
  act(() => { vi.advanceTimersByTime(REVEAL_MS + 50) })
  expect(h.result.current.holdUntil).toBeNull()
})
