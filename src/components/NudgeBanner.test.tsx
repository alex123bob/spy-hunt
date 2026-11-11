import { fireEvent, render, screen } from '@testing-library/react'
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
  recordStreakMilestone(4)
  render(<NudgeBanner />)
  expect(screen.getByText(/4-day streak/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText(/4-day streak/)).toBeNull()
})

test('dismissing streak reveals the pending win banner', () => {
  recordWin()
  recordStreakMilestone(3)
  render(<NudgeBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.getByText(/Nice win/)).toBeInTheDocument()
})

test('appears when a nudge is recorded after mount', async () => {
  const { act } = await import('@testing-library/react')
  render(<NudgeBanner />)
  expect(screen.queryByText(/Nice win/)).toBeNull()
  act(() => recordWin())
  expect(screen.getByText(/Nice win/)).toBeInTheDocument()
})
