import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Landing } from './Landing'
import { ApiError, request } from '../api/client'
import { setLang } from '../i18n'
import { getSession } from '../state/session'
import { leaveRoom, setMyRoom } from '../state/myRoom'
import { getRecaps } from '../bots/api'
import { getDailyStreak } from '../daily/api'
import { recordPageLoadVisit, recordStreakMilestone } from '../state/nudges'
import { shareCard } from '../daily/share'

vi.mock('../bots/api', () => ({ getRecaps: vi.fn() }))
vi.mock('../daily/share', () => ({ shareCard: vi.fn(), drawCard: vi.fn() }))

vi.mock('../state/session', async () => {
  let name = ''
  return {
    getSession: vi.fn(() => ({ playerId: 'p', token: 't', lang: 'en', name })),
    setName: (n: string) => { name = n },
    setSessionLang: () => {},
    ensureGuest: vi.fn().mockResolvedValue({}),
  }
})

vi.mock('../state/nudges', () => ({ recordPageLoadVisit: vi.fn(), recordStreakMilestone: vi.fn() }))
vi.mock('../daily/api', () => ({ getDailyStreak: vi.fn() }))

function Where() { return <div data-testid="loc">{useLocation().pathname}</div> }

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={<Landing />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

vi.mock('../state/myRoom', async () => {
  const actual = await vi.importActual<typeof import('../state/myRoom')>('../state/myRoom')
  return { ...actual, leaveRoom: vi.fn().mockResolvedValue(undefined), refreshMyRoom: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn() }
})

describe('blocked by an active room', () => {
  const blocked = () => new ApiError(409, 'already_in_room', 'x', { code: 'OLD', status: 'lobby' })

  beforeEach(() => {
    vi.mocked(request).mockReset()
    vi.mocked(getSession).mockImplementation(() => ({ playerId: 'p', token: 't', lang: 'en', name: 'Ann' }))
  })

  test('create shows the dialog naming the existing room', async () => {
    vi.mocked(request).mockRejectedValueOnce(blocked())
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/room OLD/)).toBeInTheDocument()
  })

  test('Return from the dialog opens the existing room', async () => {
    vi.mocked(request).mockRejectedValueOnce(blocked())
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Return' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/r/OLD')
  })

  test('Leave and continue leaves the old room, then retries create once', async () => {
    vi.mocked(request).mockRejectedValueOnce(blocked()).mockResolvedValueOnce({ code: 'NEW' })
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }))
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/r/NEW'))
    expect(leaveRoom).toHaveBeenCalledWith('OLD')
    expect(vi.mocked(request).mock.calls.filter((c) => c[1] === '/rooms')).toHaveLength(2)
  })

  test('a second block after leaving shows the normal error, not another dialog', async () => {
    vi.mocked(request).mockRejectedValueOnce(blocked()).mockRejectedValueOnce(blocked())
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('return-to-room banner', () => {
  afterEach(() => setMyRoom(null))

  test('shows nothing when the player is in no room', () => {
    renderLanding()
    expect(screen.queryByText(/You're in room/)).toBeNull()
  })

  test('offers Return, which opens the room', async () => {
    setMyRoom({ code: 'ABC', status: 'lobby' })
    renderLanding()
    expect(screen.getByText(/You're in room ABC/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Return' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/r/ABC')
  })

  test('leaving a game in progress asks first and warns about the bot handover', async () => {
    setMyRoom({ code: 'ABC', status: 'playing' })
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(leaveRoom).not.toHaveBeenCalled()
    expect(await screen.findByText(/hands your seat to a bot/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }))
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith('ABC'))
  })

  test('leaving a lobby needs no confirmation', async () => {
    setMyRoom({ code: 'ABC', status: 'lobby' })
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith('ABC'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a failed Leave room tells the player instead of failing silently', async () => {
    vi.mocked(leaveRoom).mockRejectedValueOnce(new Error('nope'))
    setMyRoom({ code: 'ABC', status: 'lobby' })
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('offers Leave room, which leaves that room', async () => {
    setMyRoom({ code: 'ABC', status: 'lobby' })
    renderLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith('ABC'))
  })
})

beforeEach(() => {
  setLang('en')
  vi.mocked(getDailyStreak).mockReset().mockResolvedValue({ streak: 0, best: 0, played_today: false })
  vi.mocked(getSession).mockImplementation(() => ({ playerId: 'p', token: 't', lang: 'en', name: '' }))
  vi.mocked(getRecaps).mockReset().mockResolvedValue({ recaps: [], unseen: 0 })
  vi.mocked(shareCard).mockReset()
})

test('clicking Share shares the promo card and toasts the outcome', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  const arg = vi.mocked(shareCard).mock.calls[0][0]
  expect(arg.model.tiles).toEqual([])
  expect(arg.model.url).toBe(`${window.location.origin}/`)
  expect(arg.text).toContain(`${window.location.origin}/`)
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
})

test('cancelling the native share on Landing shows no toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('cancelled')
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  await act(async () => {})
  expect(screen.queryByRole('status')).toBeNull()
})

test('a failed share on Landing shows the failure toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('failed')
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(await screen.findByText('Could not share.')).toBeInTheDocument()
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

test('Landing reports the streak so the milestone nudge can fire without opening the result screen', async () => {
  vi.mocked(recordStreakMilestone).mockClear()
  vi.mocked(getDailyStreak).mockResolvedValue({ streak: 3, best: 3, played_today: true })
  renderLanding()
  await screen.findByText('Streak 3 🔥')
  expect(recordStreakMilestone).toHaveBeenCalledWith(3)
})

test('the daily card does not claim a status until the streak has loaded', async () => {
  let resolve!: (v: { streak: number; best: number; played_today: boolean }) => void
  vi.mocked(getDailyStreak).mockReturnValue(new Promise((r) => { resolve = r }))
  renderLanding()
  expect(screen.queryByText("Play today's puzzle")).toBeNull()
  expect(screen.queryByText('Done today ✅')).toBeNull()
  await act(async () => { resolve({ streak: 1, best: 1, played_today: true }) })
  expect(screen.getByText('Done today ✅')).toBeInTheDocument()
})

test('with no session the daily card still offers the puzzle at once', () => {
  vi.mocked(getSession).mockImplementation(() => ({ playerId: '', token: '', lang: 'en', name: '' }))
  renderLanding()
  expect(screen.getByText("Play today's puzzle")).toBeInTheDocument()
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

test('creating a room blurs the name input', () => {
  renderLanding()
  const input = screen.getByLabelText('Your name')
  input.focus()
  fireEvent.change(input, { target: { value: 'Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  expect(input).not.toHaveFocus()
})

test('joining with a code blurs the code input', () => {
  // join() navigates synchronously on success, unmounting Landing, so the input would
  // also lose focus on unmount with no explicit blur call. Spy on blur() itself so the
  // assertion actually exercises the fix rather than the unmount.
  renderLanding()
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } })
  const code = screen.getByLabelText('Room code') as HTMLInputElement
  code.focus()
  fireEvent.change(code, { target: { value: 'ABCD' } })
  const blurSpy = vi.spyOn(code, 'blur')
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  expect(blurSpy).toHaveBeenCalled()
})

test('without a guest session it never asks for recaps and shows no badge', async () => {
  vi.mocked(getSession).mockReturnValue({ playerId: '', token: '', lang: 'en', name: '' } as ReturnType<typeof getSession>)
  vi.mocked(getRecaps).mockResolvedValue({ recaps: [], unseen: 5 })
  renderLanding()
  await act(async () => { await Promise.resolve() })
  expect(getRecaps).not.toHaveBeenCalled()
  expect(screen.queryByText(/new$/)).toBeNull()
})
