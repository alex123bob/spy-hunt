import { ensureGuest, forgetGuest, getSession, resetSessionForTests, setAccountSession, setSessionLang } from './session'
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

test('a fresh login overrides a stale identity in an unwritable localStorage', async () => {
  // Mobile case: localStorage still holds an OLD session and refuses new
  // writes, but can be cleared. The fresh token must win on the next reload,
  // not the stale localStorage value.
  sessionStorage.clear()
  let ls: string | null = JSON.stringify({ playerId: 'old-pid', token: 'old-token' })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'spy-hunt.session' ? ls : null),
    setItem() { throw new Error('blocked') },
    removeItem: (k: string) => { if (k === 'spy-hunt.session') ls = null },
  })
  resetSessionForTests() // app loads with the stale localStorage value in hand
  setAccountSession({ playerId: 'new-pid', token: 'new-token' })
  resetSessionForTests() // auto-reload after login: in-memory copy is gone
  expect(getSession().playerId).toBe('new-pid')
  expect(getSession().token).toBe('new-token')
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('a fresh login wins when localStorage is frozen against both writes and removes', async () => {
  // The real device case: localStorage holds a stale blob and rejects BOTH
  // setItem and removeItem, while still serving the old value on read. The
  // stale value can neither be overwritten nor deleted, so reads must instead
  // pick the fresher value that a working sessionStorage holds.
  sessionStorage.clear()
  const stale = JSON.stringify({ playerId: 'old-pid', token: 'old-token', lang: 'en' })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'spy-hunt.session' ? stale : null),
    setItem() { throw new Error('frozen') },
    removeItem() { throw new Error('frozen') },
  })
  resetSessionForTests()
  setAccountSession({ playerId: 'new-pid', token: 'new-token' })
  setSessionLang('zh-Hans')
  resetSessionForTests() // reload
  expect(getSession().playerId).toBe('new-pid')
  expect(getSession().token).toBe('new-token')
  expect(getSession().lang).toBe('zh-Hans')
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('forgetGuest removes the session key from storage and keeps lang and name', () => {
  localStorage.clear()
  sessionStorage.clear()
  resetSessionForTests()
  setAccountSession({ playerId: 'p1', token: 't1' })
  setSessionLang('zh-Hans')
  forgetGuest()
  // The session key still exists (it now holds only preferences), but carries
  // no identity, and the old token is physically gone from every store.
  for (const raw of [localStorage.getItem('spy-hunt.session'), sessionStorage.getItem('spy-hunt.session')]) {
    if (raw) expect(raw).not.toContain('t1')
  }
  resetSessionForTests()
  expect(getSession().token).toBe('')
  expect(getSession().playerId).toBe('')
  expect(getSession().lang).toBe('zh-Hans')
})

test('forgetGuest drops the token when a store rejects writes but allows deletes', () => {
  // Quota-full edge: setItem fails (no room for the new blob) but removeItem
  // succeeds (frees space). The overwrite path alone would leave the old token
  // sitting in that store; the explicit remove is what clears it.
  sessionStorage.clear()
  const ls = new Map<string, string>()
  ls.set('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem() { throw new Error('quota') },
    removeItem: (k: string) => { ls.delete(k) },
  })
  resetSessionForTests()
  forgetGuest()
  expect(ls.has('spy-hunt.session')).toBe(false)
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('ensureGuest tells the server the current language when creating a guest', async () => {
  localStorage.clear()
  localStorage.setItem('spy-hunt.session', JSON.stringify({ lang: 'zh-Hans' }))
  resetSessionForTests()
  const f = guestFetch()
  await ensureGuest()
  expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ lang: 'zh-Hans' })
})

test('a language picked while the guest request is in flight is sent to the account afterwards', async () => {
  localStorage.clear()
  resetSessionForTests()
  const { setSessionLang } = await import('./session')
  let release: (r: Response) => void = () => {}
  const f = vi.spyOn(globalThis, 'fetch').mockImplementation((_u, init) => {
    if (init?.method === 'POST') return new Promise<Response>((res) => { release = res })
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  const p = ensureGuest()
  setSessionLang('zh-Hans')
  release(new Response(JSON.stringify({ player_id: 'p1', token: 't1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  await p
  await vi.waitFor(() => {
    const patch = f.mock.calls.find(([, i]) => i?.method === 'PATCH')
    expect(patch).toBeTruthy()
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ lang: 'zh-Hans' })
  })
})
