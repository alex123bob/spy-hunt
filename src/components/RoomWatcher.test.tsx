import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { RoomWatcher } from './RoomWatcher'
import { request } from '../api/client'
import { openRoomStream } from '../api/stream'
import { setMyRoom } from '../state/myRoom'
import { fireNotification } from '../state/notify'
import { getNotifyPref } from '../state/notifyPrefs'
import type { Snapshot } from '../api/types'

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), request: vi.fn() }))
vi.mock('../api/stream', () => ({ openRoomStream: vi.fn(() => ({ close: vi.fn(), reconnectNow: vi.fn() })) }))
vi.mock('../state/notify', () => ({ fireNotification: vi.fn(), notificationsSupported: () => true }))
vi.mock('../state/notifyPrefs', () => ({ getNotifyPref: vi.fn(() => 'on') }))

function playing(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'playing', phase: 'describe', phase_deadline: null, round: 1, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0, players: [{ seat: 0, name: 'Ann', lang: 'en', is_bot: false, alive: true, connected: true, is_host: true }],
    messages: [], current_speaker: null, me: { seat: 0, is_host: true, my_word: 'river' },
    winner: null, last_seq: 1, server_time: Date.now(), locked: [],
    ...overrides,
  } as Snapshot
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><RoomWatcher /></MemoryRouter>)
}

function ShowPath() {
  const { pathname } = useLocation()
  return <span data-testid="path">{pathname}</span>
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(openRoomStream).mockClear()
  vi.mocked(fireNotification).mockClear()
  vi.mocked(getNotifyPref).mockReturnValue('on')
  setMyRoom(null)
})

test('opens no connection while on that room\'s own page', () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  renderAt('/r/ABCD')
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('opens no connection while on that room\'s own page with a trailing slash', () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  renderAt('/r/ABCD/')
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('opens no connection and makes no request with no active room', () => {
  renderAt('/bots')
  expect(request).not.toHaveBeenCalled()
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('boots a snapshot and opens a stream when away from the room with an active room', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  expect(request).toHaveBeenCalledWith('GET', '/rooms/ABCD')
  expect(openRoomStream).toHaveBeenCalledWith('ABCD', expect.anything(), expect.anything(), expect.anything())
})

test('shows a toast when it becomes my turn while focused and away from the room', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  vi.restoreAllMocks()
})

test('says "speak" for a describe-phase turn toast, "vote" for a vote-phase turn toast', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null, phase: 'describe' }))
  renderAt('/bots')
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your turn to speak')
  act(() => onEvent({ event: 'turn', data: { seat: 1, phase: 'describe' } }))
  act(() => onEvent({ event: 'phase', data: { phase: 'vote' } }))
  act(() => onEvent({ event: 'state', data: playing({ current_speaker: null, phase: 'vote', locked: [] }) }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your turn to vote')
  vi.restoreAllMocks()
})

test('clicking the out-of-room toast navigates back into the room', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  render(
    <MemoryRouter initialEntries={['/bots']}>
      <RoomWatcher />
      <ShowPath />
    </MemoryRouter>,
  )
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  fireEvent.click(await screen.findByRole('status'))
  expect(screen.getByTestId('path')).toHaveTextContent('/r/ABCD')
  vi.restoreAllMocks()
})

test('fires a native notification instead of a toast when unfocused and away from the room', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  expect(fireNotification).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).toBeNull()
  vi.restoreAllMocks()
})

test('closes the stream once navigation lands on the room\'s own page', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing())
  const close = vi.fn()
  vi.mocked(openRoomStream).mockReturnValue({ close, reconnectNow: vi.fn() })
  const router = createMemoryRouter([{ path: '*', element: <RoomWatcher /> }], { initialEntries: ['/bots'] })
  render(<RouterProvider router={router} />)
  await act(async () => {})
  await act(async () => router.navigate('/r/ABCD'))
  expect(close).toHaveBeenCalled()
})

test('navigating between two non-room screens keeps the same stream open (does not restart on every route change)', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing())
  function NavButton() {
    const navigate = useNavigate()
    return <button onClick={() => navigate('/top')}>go</button>
  }
  render(
    <MemoryRouter initialEntries={['/bots']}>
      <RoomWatcher />
      <NavButton />
    </MemoryRouter>,
  )
  await act(async () => {})
  expect(openRoomStream).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('go'))
  await act(async () => {})
  expect(openRoomStream).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledTimes(1)
})

test('retries the initial snapshot fetch after it fails, and opens a stream once it succeeds', async () => {
  vi.useFakeTimers()
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(playing())
  renderAt('/bots')
  await act(async () => {})
  expect(openRoomStream).not.toHaveBeenCalled()
  await act(async () => { await vi.runOnlyPendingTimersAsync() })
  expect(request).toHaveBeenCalledTimes(2)
  expect(openRoomStream).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
})

test('reopens the stream after it reports failed', async () => {
  vi.useFakeTimers()
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing())
  renderAt('/bots')
  await act(async () => {})
  expect(openRoomStream).toHaveBeenCalledTimes(1)
  const onStatus = vi.mocked(openRoomStream).mock.calls[0][2]
  act(() => onStatus('failed'))
  await act(async () => { await vi.runOnlyPendingTimersAsync() })
  expect(openRoomStream).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})

test('reconnects the stream when the tab becomes visible again', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing())
  const reconnectNow = vi.fn()
  vi.mocked(openRoomStream).mockReturnValue({ close: vi.fn(), reconnectNow })
  renderAt('/bots')
  await act(async () => {})
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(reconnectNow).toHaveBeenCalled()
})

test('fires the started notification when the game started between navigating away and the bootstrap fetch resolving', async () => {
  // myRoom still says "lobby" (the last known status before navigating away), but the
  // server-side game started in the meantime, so the bootstrap GET already returns "playing" --
  // there is no earlier "lobby" snapshot for the diff to compare against
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  setMyRoom({ code: 'ABCD', status: 'lobby' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  expect(fireNotification).toHaveBeenCalledTimes(1)
  expect(fireNotification).toHaveBeenCalledWith('Game started', expect.anything())
  vi.restoreAllMocks()
})

test('does not fire the started notification when myRoom already said "playing" before navigating away', async () => {
  // the normal case: the player was already told the game had started (e.g. they saw it on
  // the room screen) before leaving, so the bootstrap fetch returning "playing" is not new news
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  expect(fireNotification).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})
