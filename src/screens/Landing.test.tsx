import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Landing } from './Landing'
import { setLang } from '../i18n'

vi.mock('../state/session', async () => {
  let name = ''
  return {
    getSession: () => ({ playerId: 'p', token: 't', lang: 'en', name }),
    setName: (n: string) => { name = n },
    setSessionLang: () => {},
    ensureGuest: vi.fn().mockResolvedValue({}),
  }
})

const daily = vi.hoisted(() => ({ played: false, streak: 0 }))
vi.mock('../daily/streak', () => ({
  todayUtc: () => '2026-11-10',
  playedToday: () => daily.played,
  currentStreak: () => daily.streak,
}))

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
  daily.played = false
  daily.streak = 0
})

test('join code is uppercased and trimmed', async () => {
  renderLanding()
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } })
  fireEvent.change(screen.getByLabelText('Room code'), { target: { value: '  abcd ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/r/ABCD'))
})

test('name input is limited to 16 characters and language picker is visible', () => {
  renderLanding()
  expect(screen.getByLabelText('Your name')).toHaveAttribute('maxLength', '16')
  expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
})

test('the daily card links to the daily puzzle', async () => {
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: /Daily Spy Hunter/ }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/daily'))
  expect(screen.queryByText(/Streak/)).toBeNull()
})

test('the daily card shows the streak', () => {
  daily.streak = 4
  renderLanding()
  expect(screen.getByText('Streak 4 🔥')).toBeInTheDocument()
})

test('the daily card says done today once played', () => {
  daily.played = true
  renderLanding()
  expect(screen.getByText('Done today ✅')).toBeInTheDocument()
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
