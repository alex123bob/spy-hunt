import { act, fireEvent, render, screen } from '@testing-library/react'
import { NudgeBanner } from './NudgeBanner'
import { setLang } from '../i18n'
import { recordStreakMilestone, recordWin, resetNudgesForTests } from '../state/nudges'
import { useAccount } from '../state/accounts'

vi.mock('../state/accounts', () => ({ useAccount: vi.fn() }))

beforeEach(() => {
  setLang('en')
  localStorage.clear()
  resetNudgesForTests()
  vi.mocked(useAccount).mockReturnValue({ email: null })
})

test('renders nothing when there is no pending nudge', () => {
  const { container } = render(<NudgeBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('renders nothing for a registered account even with a pending nudge', () => {
  recordWin()
  vi.mocked(useAccount).mockReturnValue({ email: 'a@b.com' })
  const { container } = render(<NudgeBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('shows the streak copy and dismisses without a remount', () => {
  vi.useFakeTimers()
  recordStreakMilestone(4)
  render(<NudgeBanner />)
  expect(screen.getByText(/4-day streak/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.getByText(/4-day streak/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveClass('closing')
  act(() => vi.advanceTimersByTime(300))
  expect(screen.queryByText(/4-day streak/)).toBeNull()
  vi.useRealTimers()
})

test('re-renders in the new language when the language switches', () => {
  recordStreakMilestone(4)
  render(<NudgeBanner />)
  expect(screen.getByText(/4-day streak/)).toBeInTheDocument()
  act(() => setLang('zh-Hans'))
  expect(screen.queryByText(/4-day streak/)).toBeNull()
  expect(screen.getByText(/连续 4 天/)).toBeInTheDocument()
  setLang('en')
})

test('dismissing streak reveals the pending win banner', () => {
  vi.useFakeTimers()
  recordWin()
  recordStreakMilestone(3)
  render(<NudgeBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  act(() => vi.advanceTimersByTime(300))
  expect(screen.getByText(/Nice win/)).toBeInTheDocument()
  vi.useRealTimers()
})

test('appears when a nudge is recorded after mount', async () => {
  const { act } = await import('@testing-library/react')
  render(<NudgeBanner />)
  expect(screen.queryByText(/Nice win/)).toBeNull()
  act(() => recordWin())
  expect(screen.getByText(/Nice win/)).toBeInTheDocument()
})

test('dismisses immediately under reduced motion, skipping the spin delay', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  recordStreakMilestone(4)
  render(<NudgeBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText(/4-day streak/)).toBeNull()
})
