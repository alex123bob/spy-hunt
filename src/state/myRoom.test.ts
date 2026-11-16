import { act, renderHook } from '@testing-library/react'
import { leaveRoom, refreshMyRoom, setMyRoom, useMyRoom } from './myRoom'
import { ApiError, request } from '../api/client'
import { getSession } from './session'

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), request: vi.fn() }))
vi.mock('./session', () => ({ getSession: vi.fn() }))

const signedIn = { playerId: 'p1', token: 't', lang: 'en', name: 'A' } as const
const signedOut = { playerId: '', token: '', lang: 'en', name: '' } as const

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(getSession).mockReturnValue(signedIn)
  setMyRoom(null)
})

test('refreshMyRoom stores the active room', async () => {
  vi.mocked(request).mockResolvedValue({ room: { code: 'ABC', status: 'lobby' } })
  const { result } = renderHook(() => useMyRoom())
  await act(() => refreshMyRoom())
  expect(request).toHaveBeenCalledWith('GET', '/me/room')
  expect(result.current).toEqual({ code: 'ABC', status: 'lobby' })
})

test('refreshMyRoom stores null when there is no active room', async () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  vi.mocked(request).mockResolvedValue({ room: null })
  await refreshMyRoom()
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toBeNull()
})

test('refreshMyRoom makes no request without credentials', async () => {
  vi.mocked(getSession).mockReturnValue(signedOut)
  await refreshMyRoom()
  expect(request).not.toHaveBeenCalled()
})

test('a failed refresh keeps the last known room (a network blip must not hide the chip)', async () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  vi.mocked(request).mockRejectedValue(new ApiError(0, 'network'))
  await refreshMyRoom()
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toEqual({ code: 'ABC', status: 'lobby' })
})

test('a 401 refresh clears the room (the identity is gone)', async () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  vi.mocked(request).mockRejectedValue(new ApiError(401, 'unauthorized'))
  await refreshMyRoom()
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toBeNull()
})

test('an older refresh response never overwrites a newer one', async () => {
  let resolveOld!: (v: unknown) => void
  vi.mocked(request)
    .mockImplementationOnce(() => new Promise((r) => { resolveOld = r }))
    .mockResolvedValueOnce({ room: null })
  const old = refreshMyRoom()
  await refreshMyRoom() // newer: no room
  resolveOld({ room: { code: 'ABC', status: 'lobby' } }) // late answer from before
  await old
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toBeNull()
})

test('a refresh in flight when the player leaves cannot bring the room back', async () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  let resolveRefresh!: (v: unknown) => void
  vi.mocked(request)
    .mockImplementationOnce(() => new Promise((r) => { resolveRefresh = r }))
    .mockResolvedValueOnce({}) // POST leave
  const pending = refreshMyRoom()
  await leaveRoom('ABC')
  resolveRefresh({ room: { code: 'ABC', status: 'lobby' } })
  await pending
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toBeNull()
})

test('leaveRoom posts to the room and clears the store', async () => {
  setMyRoom({ code: 'ABC', status: 'playing' })
  vi.mocked(request).mockResolvedValue({})
  await leaveRoom('ABC')
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABC/leave')
  const { result } = renderHook(() => useMyRoom())
  expect(result.current).toBeNull()
})
