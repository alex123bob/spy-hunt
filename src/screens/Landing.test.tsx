import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Landing } from './Landing'
import { setLang } from '../i18n'
import { getSession } from '../state/session'
import { getRecaps } from '../bots/api'
import { getDailyStreak } from '../daily/api'
import { recordPageLoadVisit } from '../state/nudges'

vi.mock('../bots/api', () => ({ getRecaps: vi.fn() }))

vi.mock('../state/session', async () => {
  let name = ''
  return {
    getSession: vi.fn(() => ({ playerId: 'p', token: 't', lang: 'en', name })),
    setName: (n: string) => { name = n },
    setSessionLang: () => {},
    ensureGuest: vi.fn().mockResolvedValue({}),
  }
})

vi.mock('../state/nudges', () => ({ recordPageLoadVisit: vi.fn() }))
vi.mock('../daily/api', () => ({ getDailyStreak: vi.fn() }))

function Where() { return <div data-testid="loc">{useLocation().pathname}</div> }

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={<Landing />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setLang('en')
  vi.mocked(getDailyStreak).mockReset().mockResolvedValue({ streak: 0, best: 0, played_today: false })
  vi.mocked(getSession).mockImplementation(() => ({ playerId: 'p', token: 't', lang: 'en', name: '' }))
  vi.mocked(getRecaps).mockReset().mockResolvedValue({ recaps: [], unseen: 0 })
})

test('Landing records a page-load visit on mount', () => {
  vi.mocked(recordPageLoadVisit).mockClear()
  renderLanding()
  expect(recordPageLoadVisit).toHaveBeenCalledTimes(1)
})

test('shows the unseen recap count on the My bots card', async () => {
  vi.mocked(getRecaps).mockResolvedValue({ recaps: [], unseen: 2 })
  renderLanding()
  expect(await screen.findByText('2 new')).toBeInTheDocument()
})

test('shows no badge when nothing is unseen', async () => {
  renderLanding()
  await waitFor(() => expect(getRecaps).toHaveBeenCalled())
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByText(/new$/)).toBeNull()
})

test('a recaps failure is silent', async () => {
  vi.mocked(getRecaps).mockRejectedValue(new Error('x'))
  renderLanding()
  await waitFor(() => expect(getRecaps).toHaveBeenCalled())
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByRole('alert')).toBeNull()
})

test('join code is uppercased and trimmed', async () => {
  renderLanding()
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } })
  fireEvent.change(screen.getByLabelText('Room code'), { target: { value: '  abcd ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/r/ABCD'))
})

test('name input is limited to 16 characters', () => {
  renderLanding()
  expect(screen.getByLabelText('Your name')).toHaveAttribute('maxLength', '16')
})

test('the daily card links to the daily puzzle', async () => {
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: /Daily Spy Hunter/ }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/daily'))
  expect(screen.queryByText(/Streak/)).toBeNull()
})

test('the daily card shows the streak', async () => {
  vi.mocked(getDailyStreak).mockResolvedValue({ streak: 4, best: 4, played_today: false })
  renderLanding()
  expect(await screen.findByText('Streak 4 🔥')).toBeInTheDocument()
})

test('a streak failure shows no badge and no error', async () => {
  vi.mocked(getDailyStreak).mockRejectedValue(new Error('x'))
  renderLanding()
  await waitFor(() => expect(getDailyStreak).toHaveBeenCalled())
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByText(/Streak/)).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('the daily card says done today once played', async () => {
  vi.mocked(getDailyStreak).mockResolvedValue({ streak: 1, best: 1, played_today: true })
  renderLanding()
  expect(await screen.findByText('Done today ✅')).toBeInTheDocument()
  expect(screen.queryByText("Play today's puzzle")).toBeNull()
})

test('My bots navigates to /bots', async () => {
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: /My bots/ }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/bots'))
})

test('Top bots card navigates to /top', () => {
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: /Top bots/ }))
  expect(screen.getByTestId('loc')).toHaveTextContent('/top')
})

test('without a guest session it never asks for recaps and shows no badge', async () => {
  vi.mocked(getSession).mockReturnValue({ playerId: '', token: '', lang: 'en', name: '' } as ReturnType<typeof getSession>)
  vi.mocked(getRecaps).mockResolvedValue({ recaps: [], unseen: 5 })
  renderLanding()
  await act(async () => { await Promise.resolve() })
  expect(getRecaps).not.toHaveBeenCalled()
  expect(screen.queryByText(/new$/)).toBeNull()
})
