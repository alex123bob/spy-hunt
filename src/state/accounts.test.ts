import { renderHook, waitFor } from '@testing-library/react'
import { authHeaders, setCredentials } from '../api/client'
import { getAccount, login, logout, register, useAccount } from './accounts'
import { getSession, resetSessionForTests } from './session'

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  resetSessionForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  setCredentials(null)
})

test('register ensures a guest then posts /register', async () => {
  const f = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(reply({ player_id: 'p1', token: 't1' }))
    .mockResolvedValueOnce(reply({ email: 'a@b.com' }))
  const acct = await register('a@b.com', 'longenough')
  expect(acct).toEqual({ email: 'a@b.com' })
  expect(String(f.mock.calls[1][0])).toMatch(/\/register$/)
  expect(JSON.parse(String(f.mock.calls[1][1]?.body))).toEqual({ email: 'a@b.com', password: 'longenough' })
})

test('login posts /login and later calls carry the new token', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ player_id: 'p9', token: 'tok9', email: 'a@b.com' }))
  await login('a@b.com', 'longenough')
  expect(String(f.mock.calls[0][0])).toMatch(/\/login$/)
  expect(authHeaders()).toEqual({ Authorization: 'Bearer p9.tok9' })
  expect(getSession().playerId).toBe('p9')
})

test('logout posts /logout then clears local credentials', async () => {
  setCredentials({ playerId: 'p1', token: 't1' })
  localStorage.setItem('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ ok: true }))
  await logout()
  expect(String(f.mock.calls[0][0])).toMatch(/\/logout$/)
  expect(authHeaders()).toEqual({})
  expect(getSession().token).toBe('')
})

test('logout still clears credentials when the request fails', async () => {
  setCredentials({ playerId: 'p1', token: 't1' })
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
  await logout()
  expect(authHeaders()).toEqual({})
})

test('getAccount returns the server body, or {email:null} on failure', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(reply({ player_id: 'p1', token: 't1' }))
    .mockResolvedValueOnce(reply({ email: 'a@b.com' }))
  expect(await getAccount()).toEqual({ email: 'a@b.com' })
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'))
  expect(await getAccount()).toEqual({ email: null })
})

test('useAccount does not fetch without a session', () => {
  const f = vi.spyOn(globalThis, 'fetch')
  const { result } = renderHook(() => useAccount())
  expect(result.current).toEqual({ email: null })
  expect(f).not.toHaveBeenCalled()
})

test('useAccount resolves the account when a session exists', async () => {
  setCredentials({ playerId: 'p1', token: 't1' })
  localStorage.setItem('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ email: 'a@b.com' }))
  const { result } = renderHook(() => useAccount())
  expect(result.current).toEqual({ email: null })
  await waitFor(() => expect(result.current).toEqual({ email: 'a@b.com' }))
})
