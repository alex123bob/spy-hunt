import { getMyGameDetail, getMyGameReplay, getMyGames } from './api'

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.setItem('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
})
afterEach(() => vi.restoreAllMocks())

test('getMyGames calls GET /me/games', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply([]))
  await getMyGames()
  expect(String(f.mock.calls.at(-1)?.[0])).toMatch(/\/me\/games$/)
})

test('getMyGameDetail calls GET /me/games/:roomId/:gameNo', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({}))
  await getMyGameDetail('r1', 3)
  expect(String(f.mock.calls.at(-1)?.[0])).toMatch(/\/me\/games\/r1\/3$/)
})

test('getMyGameReplay calls GET /me/games/:roomId/:gameNo/replay', async () => {
  const replay = { players: [], rounds: [], words: { civilian: {}, spy: {} }, winner: null }
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(replay))
  const result = await getMyGameReplay('r1', 3)
  expect(String(f.mock.calls.at(-1)?.[0])).toMatch(/\/me\/games\/r1\/3\/replay$/)
  expect(result).toEqual(replay)
})
