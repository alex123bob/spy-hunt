import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Admin } from './Admin'
import { getAdminStatus, startRefill } from '../admin/api'
import { getToken, setToken, clearToken } from '../admin/token'
import { ApiError } from '../api/client'

vi.mock('../admin/api', () => ({ getAdminStatus: vi.fn(), startRefill: vi.fn() }))
vi.mock('../admin/token', () => ({ getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn() }))

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

test('refill triggers startRefill and shows refilling state', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(startRefill).mockResolvedValue({ started: true })
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /refill/i }))
  expect(startRefill).toHaveBeenCalled()
})
