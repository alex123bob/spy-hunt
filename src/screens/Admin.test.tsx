import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Admin } from './Admin'
import { getAdminStatus, getAdminStats, startRefill } from '../admin/api'
import { getToken, setToken, clearToken } from '../admin/token'
import { ApiError } from '../api/client'

vi.mock('../admin/api', () => ({ getAdminStatus: vi.fn(), getAdminStats: vi.fn(), startRefill: vi.fn() }))
vi.mock('../admin/token', () => ({ getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn() }))

const sampleStats = {
  day: '2026-11-25',
  rooms: { active_lobby: 1, active_playing: 0, rooms_created_today: 1, games_finished_today: 0, trend: [] },
  puzzles: { ready_count: 2, total_count: 2, attempts_today: 9, solved_today: 5, trend: [] },
  accounts: { total_guests: 10, new_today: 1, trend: [] },
  economy: { credits_issued_today: 40, trend: [] },
  bots: { total_custom_bots: 2, arena_matches_today: 0, trend: [] },
  clans: { total_clans: 1, total_members: 3 },
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('shows the token prompt when no token is stored', () => {
  vi.mocked(getToken).mockReturnValue(null)
  render(<Admin />)
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('submitting the token stores it and loads status', async () => {
  vi.mocked(getToken).mockReturnValue(null)
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 4, total_count: 4, refilling: false })
  render(<Admin />)
  await userEvent.type(screen.getByLabelText(/token/i), 'tok')
  await userEvent.click(screen.getByRole('button', { name: /enter/i }))
  expect(setToken).toHaveBeenCalledWith('tok')
  expect(await screen.findByText(/4/)).toBeInTheDocument()
})

test('a 401 clears the stored token and re-prompts', async () => {
  vi.mocked(getToken).mockReturnValue('stale')
  vi.mocked(getAdminStatus).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<Admin />)
  await waitFor(() => expect(clearToken).toHaveBeenCalled())
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('refill triggers startRefill with the chosen count and shows refilling state', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(startRefill).mockResolvedValue({ started: true })
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /refill/i }))
  expect(startRefill).toHaveBeenCalledWith(3) // default
})

test('the operator can change how many puzzles to generate', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(startRefill).mockResolvedValue({ started: true })
  render(<Admin />)
  const input = await screen.findByLabelText(/how many/i)
  await userEvent.clear(input)
  await userEvent.type(input, '7')
  await userEvent.click(screen.getByRole('button', { name: /refill/i }))
  expect(startRefill).toHaveBeenCalledWith(7)
})

test('a 401 on the refill click clears the token and re-prompts', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(startRefill).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /refill/i }))
  await waitFor(() => expect(clearToken).toHaveBeenCalled())
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('opening the Stats tab fetches and shows stats', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockResolvedValue(sampleStats)
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  expect(await screen.findByText(/9/)).toBeInTheDocument() // attempts_today
  expect(getAdminStats).toHaveBeenCalledTimes(1)
})

test('a 401 on the stats fetch clears the token and re-prompts', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  await waitFor(() => expect(clearToken).toHaveBeenCalled())
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('Refresh on the stats tab re-fetches stats', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockResolvedValue(sampleStats)
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  await screen.findByText(/9/)
  await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
  expect(getAdminStats).toHaveBeenCalledTimes(2)
})
