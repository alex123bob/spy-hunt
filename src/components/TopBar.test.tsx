import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TopBar as Bar } from './TopBar'

const TopBar = () => <MemoryRouter><Bar /></MemoryRouter>
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

test('shows the language picker and, in the menu, the register link for a guest', () => {
  render(<TopBar />)
  expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByRole('button', { name: 'Register / log in' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
})

test('shows the email and logs out then reloads', async () => {
  vi.mocked(useAccount).mockReturnValue({ email: 'a@b.com' })
  render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByText('a@b.com')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await waitFor(() => expect(reload).toHaveBeenCalled())
  expect(logout).toHaveBeenCalled()
})

test('the register link opens the modal', () => {
  render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Register / log in' }))
  expect(screen.getByRole('tab', { name: 'Register' })).toBeInTheDocument()
})

test('the top bar holds only the language picker and the menu', () => {
  render(<TopBar />)
  expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Clan' })).toBeNull()
})

test('the profile link is reachable for a guest', () => {
  render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/me')
})

test('the clan link shows only when signed in', () => {
  const { unmount } = render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.queryByRole('link', { name: 'Clan' })).toBeNull()
  unmount()
  vi.mocked(useAccount).mockReturnValue({ email: 'a@b.com' })
  render(<TopBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByRole('link', { name: 'Clan' })).toHaveAttribute('href', '/clan')
})
