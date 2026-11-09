import { ensureGuest, getSession, resetSessionForTests } from './session'
import { setCredentials } from '../api/client'

beforeEach(() => {
  resetSessionForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  setCredentials(null)
})

function guestFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ player_id: 'p1', token: 't1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

test('ensureGuest works when localStorage throws on every access', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const f = guestFetch()
  const s = await ensureGuest()
  expect(s.playerId).toBe('p1')
  expect(getSession().token).toBe('t1')
  await ensureGuest()
  expect(f).toHaveBeenCalledTimes(1) // memory fallback: only one POST /guests
})

test('ensureGuest creates the guest once and persists it', async () => {
  localStorage.clear()
  const f = guestFetch()
  await ensureGuest()
  resetSessionForTests()
  const s = await ensureGuest()
  expect(s.playerId).toBe('p1')
  expect(f).toHaveBeenCalledTimes(1)
})

test('concurrent ensureGuest calls share one POST /guests', async () => {
  localStorage.clear()
  const f = guestFetch()
  const [a, b] = await Promise.all([ensureGuest(), ensureGuest()])
  expect(f).toHaveBeenCalledTimes(1)
  expect(a.playerId).toBe(b.playerId)
})

test('identity survives a reload when only sessionStorage works', async () => {
  sessionStorage.clear()
  vi.stubGlobal('localStorage', {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  })
  const f = guestFetch()
  const first = await ensureGuest()
  resetSessionForTests() // a page reload: memory is gone
  expect(getSession().playerId).toBe(first.playerId)
  await ensureGuest()
  expect(f).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
