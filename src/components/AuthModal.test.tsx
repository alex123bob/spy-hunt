import { act, fireEvent, render, screen } from '@testing-library/react'
import { AuthModal } from './AuthModal'
import { ApiError } from '../api/client'
import { setLang } from '../i18n'
import { login, register } from '../state/accounts'

vi.mock('../state/accounts', () => ({ register: vi.fn(), login: vi.fn() }))

const reload = vi.fn()
beforeEach(() => {
  setLang('en')
  vi.mocked(register).mockReset()
  vi.mocked(login).mockReset()
  reload.mockReset()
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
})

function fill(email = 'a@b.com', password = 'longenough') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

test('starts on the Register tab and switches to Log in', () => {
  render(<AuthModal onClose={() => {}} />)
  expect(screen.getByRole('tab', { name: 'Register' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Log in' }))
  expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()
})

test('registering sends the typed values, shows signed in, then reloads', async () => {
  vi.useFakeTimers()
  vi.mocked(register).mockResolvedValue({ email: 'a@b.com' })
  render(<AuthModal onClose={() => {}} />)
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await act(async () => { await Promise.resolve() })
  expect(register).toHaveBeenCalledWith('a@b.com', 'longenough')
  expect(screen.getByText('Signed in')).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(reload).toHaveBeenCalled()
  vi.useRealTimers()
})

test('logging in calls login', async () => {
  vi.mocked(login).mockResolvedValue(undefined)
  render(<AuthModal onClose={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Log in' }))
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await screen.findByText('Signed in')
  expect(login).toHaveBeenCalledWith('a@b.com', 'longenough')
})

test.each([
  ['register', new ApiError(409, 'conflict'), 'That email is already registered.'],
  ['register', new ApiError(400, 'bad_password'), 'Password must be at least 8 characters.'],
  ['register', new ApiError(400, 'bad_email'), 'Enter a valid email.'],
  ['register', new ApiError(0, 'network'), 'Cannot reach the server. Check your connection.'],
])('%s failure %#: shows specific copy', async (_k, err, text) => {
  vi.mocked(register).mockRejectedValue(err)
  render(<AuthModal onClose={() => {}} />)
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(text)
  expect(reload).not.toHaveBeenCalled()
})

test('a 401 on login shows the login failure copy', async () => {
  vi.mocked(login).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<AuthModal onClose={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Log in' }))
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
})
