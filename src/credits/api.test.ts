import { getCredits } from './api'
import { request } from '../api/client'
import { ensureGuest } from '../state/session'

const payload = { credits: 12, today: 3, rank: { index: 1, key: 'sleuth', min: 10 }, next: { key: 'hunter', min: 30, remaining: 18 } }
vi.mock('../api/client', () => ({ request: vi.fn() }))
vi.mock('../state/session', () => ({ ensureGuest: vi.fn().mockResolvedValue({}) }))

test('getCredits gets /credits after ensuring a guest and returns the payload', async () => {
  vi.mocked(request).mockResolvedValue(payload)
  const res = await getCredits()
  expect(ensureGuest).toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('GET', '/credits')
  expect(res).toEqual(payload)
})
