import { createClan, getMyClan, joinClan, leaveClan, listOpenClans } from './clans'
import { request } from '../api/client'

vi.mock('../api/client', () => ({ request: vi.fn() }))
vi.mock('./session', () => ({ ensureGuest: vi.fn().mockResolvedValue(undefined) }))

beforeEach(() => vi.mocked(request).mockReset())

test('routes and bodies', async () => {
  vi.mocked(request).mockResolvedValue({ clans: [], clan: null })
  await getMyClan()
  expect(request).toHaveBeenLastCalledWith('GET', '/clans/mine')
  await createClan('Foxes', 2)
  expect(request).toHaveBeenLastCalledWith('POST', '/clans', { name: 'Foxes', badge: 2 })
  await joinClan(' abc123 ')
  expect(request).toHaveBeenLastCalledWith('POST', '/clans/join', { code: 'ABC123' })
  await leaveClan()
  expect(request).toHaveBeenLastCalledWith('POST', '/clans/leave')
  expect(await listOpenClans()).toEqual([])
  expect(request).toHaveBeenLastCalledWith('GET', '/clans/open')
})
