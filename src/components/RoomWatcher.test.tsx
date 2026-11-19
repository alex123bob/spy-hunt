import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
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

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(openRoomStream).mockClear()
  vi.mocked(fireNotification).mockClear()
  vi.mocked(getNotifyPref).mockReturnValue('on')
  setMyRoom(null)
})

test('opens no connection and renders nothing with no active room', () => {
  renderAt('/bots')
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('opens no connection while on that room\'s own page', () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  renderAt('/r/ABCD')
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
