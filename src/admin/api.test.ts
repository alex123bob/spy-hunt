import { getAdminStatus, startRefill } from './api'
import { request } from '../api/client'

vi.mock('../api/client', () => ({
  request: vi.fn().mockResolvedValue({ ready_count: 3, total_count: 5, refilling: false }),
}))
vi.mock('./token', () => ({ getToken: vi.fn().mockReturnValue('tok') }))

beforeEach(() => {
  vi.mocked(request).mockClear()
})

test('getAdminStatus GETs with the admin header and no guest', async () => {
  expect(await getAdminStatus()).toEqual({ ready_count: 3, total_count: 5, refilling: false })
  expect(request).toHaveBeenCalledWith('GET', '/admin/status', undefined, { 'X-Admin-Token': 'tok' })
})

test('startRefill POSTs the count in the body with the admin header', async () => {
  await startRefill(4)
  expect(request).toHaveBeenCalledWith('POST', '/admin/refill', { count: 4 }, { 'X-Admin-Token': 'tok' })
})
