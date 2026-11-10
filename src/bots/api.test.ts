import { createBot, deleteBot, getBotCard, listMyBots, updateBot } from './api'
import { request } from '../api/client'
import { ensureGuest } from '../state/session'

vi.mock('../api/client', () => ({ request: vi.fn().mockResolvedValue({ bots: [{ id: 'a' }] }) }))
vi.mock('../state/session', () => ({ ensureGuest: vi.fn().mockResolvedValue({}) }))

beforeEach(() => {
  vi.mocked(request).mockClear()
  vi.mocked(ensureGuest).mockClear()
})

const draft = { name: 'Bo', avatar: { emoji: '🤖', color: '#fff' }, outfit: { voice: 'robot', style: 'brief', quirk: 'emoji' } }

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
