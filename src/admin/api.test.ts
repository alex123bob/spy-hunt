import { getAdminStats, getAdminStatus, startRefill } from './api'
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

test('getAdminStats GETs with the admin header', async () => {
  const sample /* : AdminStats */ = {
    day: '2026-11-25',
    rooms: { active_lobby: 1, active_playing: 0, rooms_created_today: 1, games_finished_today: 0, trend: [] },
    puzzles: { ready_count: 3, total_count: 5, attempts_today: 2, solved_today: 1, trend: [] },
    accounts: { total_guests: 10, new_today: 1, trend: [] },
    economy: { credits_issued_today: 40, trend: [] },
    bots: { total_custom_bots: 2, arena_matches_today: 0, trend: [] },
    clans: { total_clans: 1, total_members: 3 },
  }
  vi.mocked(request).mockResolvedValue(sample)
  expect(await getAdminStats()).toEqual(sample)
  expect(request).toHaveBeenCalledWith('GET', '/admin/stats', undefined, { 'X-Admin-Token': 'tok' })
})
