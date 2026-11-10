import { createBot, deleteBot, getBotCard, getMatch, getRecaps, markRecapsSeen, getTopBots, listMyBots, updateBot } from './api'
import { request } from '../api/client'
import { ensureGuest } from '../state/session'

vi.mock('../api/client', () => ({ request: vi.fn().mockResolvedValue({ bots: [{ id: 'a' }] }) }))
vi.mock('../state/session', () => ({ ensureGuest: vi.fn().mockResolvedValue({}) }))

beforeEach(() => {
  vi.mocked(request).mockClear()
  vi.mocked(ensureGuest).mockClear()
})

const draft = { name: 'Bo', avatar: { emoji: '🤖', color: '#fff' }, outfit: { voice: 'robot', style: 'brief', quirk: 'emoji', rules: [] } }

test('listMyBots gets /bots and unwraps the array', async () => {
  expect(await listMyBots()).toEqual([{ id: 'a' }])
  expect(ensureGuest).toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('GET', '/bots')
})

test('listMyBots tolerates a response without bots', async () => {
  vi.mocked(request).mockResolvedValueOnce({})
  expect(await listMyBots()).toEqual([])
})

test('createBot posts the draft', async () => {
  await createBot(draft)
  expect(request).toHaveBeenCalledWith('POST', '/bots', draft)
})

test('updateBot patches and deleteBot deletes', async () => {
  await updateBot('abc', { name: 'X' })
  expect(request).toHaveBeenCalledWith('PATCH', '/bots/abc', { name: 'X' })
  await deleteBot('abc')
  expect(request).toHaveBeenLastCalledWith('DELETE', '/bots/abc')
})

test('getBotCard encodes the id and needs no guest', async () => {
  await getBotCard('a b/c')
  expect(request).toHaveBeenCalledWith('GET', '/bots/a%20b%2Fc')
  expect(ensureGuest).not.toHaveBeenCalled()
})

test('getTopBots requests the kind and unwraps bots', async () => {
  vi.mocked(request).mockResolvedValueOnce({ kind: 'spies', bots: [{ rank: 1, id: 'x' }] })
  expect(await getTopBots('spies')).toEqual([{ rank: 1, id: 'x' }])
  expect(request).toHaveBeenCalledWith('GET', '/bots/top?kind=spies')
})

test('getTopBots tolerates a body without bots', async () => {
  vi.mocked(request).mockResolvedValueOnce({})
  expect(await getTopBots('winners')).toEqual([])
})

test('getRecaps needs a guest, tolerates a missing recaps field', async () => {
  vi.mocked(request).mockResolvedValueOnce({})
  expect(await getRecaps()).toEqual({ recaps: [], unseen: 0 })
  expect(ensureGuest).toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('GET', '/bots/recaps')
})

test('markRecapsSeen posts', async () => {
  await markRecapsSeen()
  expect(request).toHaveBeenCalledWith('POST', '/bots/recaps/seen')
})

test('getMatch encodes the id and needs no guest', async () => {
  await getMatch('m 1')
  expect(request).toHaveBeenCalledWith('GET', '/arena/matches/m%201')
  expect(ensureGuest).not.toHaveBeenCalled()
})
