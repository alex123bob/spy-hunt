import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Room } from './Room'
import { ApiError, request } from '../api/client'
import { openRoomStream } from '../api/stream'
import { getSession } from '../state/session'
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
  getSession: vi.fn(() => ({ playerId: 'p', token: 't', lang: 'en', name: 'Ann' })),
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
  vi.mocked(getSession).mockReturnValue({ playerId: 'p', token: 't', lang: 'en', name: 'Ann' })
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

test('already_in_room on join shows the dialog, not the started screen', async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new ApiError(403, 'not_member'))
    .mockRejectedValueOnce(new ApiError(409, 'already_in_room', 'x', { code: 'OLD', status: 'playing' }))
  go()
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText(/room OLD/)).toBeInTheDocument()
  expect(screen.getByText(/hands your seat to a bot/)).toBeInTheDocument()
  expect(screen.queryByText('Game already started')).toBeNull()
})

test('Leave and continue on a blocked join leaves the old room then joins once more', async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new ApiError(403, 'not_member'))
    .mockRejectedValueOnce(new ApiError(409, 'already_in_room', 'x', { code: 'OLD', status: 'lobby' }))
    .mockResolvedValueOnce({}) // POST /rooms/OLD/leave
    .mockRejectedValueOnce(new ApiError(403, 'not_member')) // reload: still not a member
    .mockResolvedValueOnce(playing()) // retried join
  go()
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(request).toHaveBeenCalledWith('POST', '/rooms/OLD/leave')
  const joins = vi.mocked(request).mock.calls.filter((c) => c[1] === '/rooms/ABCD/join')
  expect(joins).toHaveLength(2)
})

test('network failure shows a retry screen', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError(0, 'network'))
  go()
  expect(await screen.findByText('Connection problem')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('submitting a name blurs the input', async () => {
  // Submitting swaps Room to the loading boot state, which unmounts this form, so the
  // input would also lose focus on unmount with no explicit blur call. Spy on blur()
  // itself so the assertion actually exercises the fix rather than the unmount.
  vi.mocked(getSession).mockReturnValue({ playerId: 'p', token: 't', lang: 'en', name: '' })
  vi.mocked(request).mockRejectedValue(new ApiError(403, 'not_member'))
  go()
  const input = (await screen.findByLabelText('Your name')) as HTMLInputElement
  input.focus()
  fireEvent.change(input, { target: { value: 'Ann' } })
  const blurSpy = vi.spyOn(input, 'blur')
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  expect(blurSpy).toHaveBeenCalled()
})

test('a member in playing/describe renders Table', async () => {
  vi.mocked(request).mockResolvedValue(playing())
  go()
  await waitFor(() => expect(screen.getByTestId('screen-Table')).toBeInTheDocument())
})

describe('a failed stream reloads with a growing delay', () => {
  const gets = () => vi.mocked(request).mock.calls.filter((c) => c[0] === 'GET').length
  const statusOf = (n: number) => vi.mocked(openRoomStream).mock.calls[n][2]
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  // The fake clock never follows real time here, so 999 ms really means 999 ms; waitFor would need it to.
  const streams = async (n: number) => {
    for (let i = 0; i < 20 && vi.mocked(openRoomStream).mock.calls.length < n; i++) await advance(0)
    expect(openRoomStream).toHaveBeenCalledTimes(n)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(request).mockResolvedValue(playing())
    vi.mocked(openRoomStream).mockClear()
  })
  afterEach(() => vi.useRealTimers())

  test('not immediately, then after 1 s, then after 2 s', async () => {
    go()
    await streams(1)
    expect(gets()).toBe(1)
    act(() => statusOf(0)('failed'))
    expect(gets()).toBe(1)
    await advance(999)
    expect(gets()).toBe(1)
    await advance(1)
    await streams(2)
    expect(gets()).toBe(2)
    act(() => statusOf(1)('failed'))
    await advance(1999)
    expect(gets()).toBe(2)
    await advance(1)
    await streams(3)
  })

  test('an open stream resets the delay to 1 s', async () => {
    go()
    await streams(1)
    act(() => statusOf(0)('failed'))
    await advance(1000)
    await streams(2)
    act(() => statusOf(1)('open'))
    act(() => statusOf(1)('failed'))
    await advance(1000)
    await streams(3)
  })

  test('leaving the page cancels a pending reload', async () => {
    const { unmount } = go()
    await streams(1)
    act(() => statusOf(0)('failed'))
    unmount()
    await advance(5000)
    expect(gets()).toBe(1)
  })
})
