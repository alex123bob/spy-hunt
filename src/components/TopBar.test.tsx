import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import { setLang } from '../i18n'
import { logout, useAccount } from '../state/accounts'

vi.mock('../state/accounts', () => ({
  useAccount: vi.fn(), logout: vi.fn().mockResolvedValue(undefined), register: vi.fn(), login: vi.fn(),
}))
vi.mock('../state/session', () => ({ setSessionLang: vi.fn() }))

const reload = vi.fn()
beforeEach(() => {
  setLang('en')
  reload.mockReset()
  vi.mocked(logout).mockClear()
  vi.mocked(useAccount).mockReturnValue({ email: null })
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
})

test('shows the language picker and the register link for a guest', () => {
  render(<TopBar />)
  expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Register / log in' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
})

test('shows the email and logs out then reloads', async () => {
  vi.mocked(useAccount).mockReturnValue({ email: 'a@b.com' })
  render(<TopBar />)
  expect(screen.getByText('a@b.com')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await waitFor(() => expect(reload).toHaveBeenCalled())
  expect(logout).toHaveBeenCalled()
})

test('the register link opens the modal', () => {
  render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Register / log in' }))
  expect(screen.getByRole('tab', { name: 'Register' })).toBeInTheDocument()
})
