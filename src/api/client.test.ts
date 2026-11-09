import { ApiError, request, setCredentials } from './client'

afterEach(() => {
  vi.restoreAllMocks()
  setCredentials(null)
})

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

test('a 401 becomes ApiError with status and code', async () => {
  mockFetch(401, { error: 'unauthorized', message: 'no' })
  await expect(request('GET', '/rooms/ABCD')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  await expect(request('GET', '/rooms/ABCD')).rejects.toBeInstanceOf(ApiError)
})

test('adds the bearer header when credentials are set', async () => {
  const f = mockFetch(200, { ok: true })
  setCredentials({ playerId: 'p1', token: 'tok' })
  await request('GET', '/health')
  const init = f.mock.calls[0][1] as RequestInit
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer p1.tok')
})

test('network failure becomes ApiError status 0', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await expect(request('GET', '/x')).rejects.toMatchObject({ status: 0, code: 'network' })
})
