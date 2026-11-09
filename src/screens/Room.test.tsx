import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Room } from './Room'
import { ApiError, request } from '../api/client'
import type { Snapshot } from '../api/types'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn() }
})
vi.mock('../api/stream', () => ({ openRoomStream: vi.fn(() => ({ close() {}, reconnectNow() {} })) }))
vi.mock('../state/session', () => ({
  ensureGuest: vi.fn().mockResolvedValue({}),
  forgetGuest: vi.fn(),
  setName: vi.fn(),
  getSession: () => ({ playerId: 'p', token: 't', lang: 'en', name: 'Ann' }),
  setSessionLang: vi.fn(),
}))

function playing(): Snapshot {
  return {
    code: 'ABCD', status: 'playing', phase: 'describe', phase_deadline: Date.now() + 30000, round: 1, game_no: 1, version: 1,
    main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0,
    players: [{ seat: 0, name: 'Ann', lang: 'en', is_bot: false, alive: true, connected: true, is_host: true }],
    messages: [], current_speaker: 0, me: { seat: 0, is_host: true, my_word: 'river' },
    winner: null, last_seq: 3, server_time: Date.now(),
  }
}

function go() {
  return render(
    <MemoryRouter initialEntries={['/r/abcd']}>
      <Routes><Route path="/r/:code" element={<Room />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(request).mockReset()
})

test('404 shows room-not-found with a way home', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError(404, 'not_found'))
  go()
  expect(await screen.findByText('Room not found')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to start' })).toBeInTheDocument()
})

test('409 game_started shows already-started; room_full shows full', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError(403, 'not_member')).mockRejectedValueOnce(new ApiError(409, 'game_started'))
  const { unmount } = go()
  expect(await screen.findByText('Game already started')).toBeInTheDocument()
  unmount()
  vi.mocked(request).mockReset()
  vi.mocked(request).mockRejectedValueOnce(new ApiError(403, 'not_member')).mockRejectedValueOnce(new ApiError(409, 'room_full'))
  go()
  expect(await screen.findByText('Room is full')).toBeInTheDocument()
})

test('network failure shows a retry screen', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError(0, 'network'))
  go()
  expect(await screen.findByText('Connection problem')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('a member in playing/describe renders Table', async () => {
  vi.mocked(request).mockResolvedValue(playing())
  go()
  await waitFor(() => expect(screen.getByTestId('screen-Table')).toBeInTheDocument())
})
