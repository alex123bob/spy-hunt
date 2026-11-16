import { act, renderHook } from '@testing-library/react'
import { leaveRoom, refreshMyRoom, setMyRoom, useMyRoom } from './myRoom'
import { request } from '../api/client'
import { getSession } from './session'

vi.mock('../api/client', () => ({ request: vi.fn() }))
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

test('refreshMyRoom clears the room when the request fails', async () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  vi.mocked(request).mockRejectedValue(new Error('offline'))
  await refreshMyRoom()
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
