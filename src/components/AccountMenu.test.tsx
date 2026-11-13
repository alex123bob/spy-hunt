import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'

test('opens to show email and log out', () => {
  const onLogout = vi.fn()
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={onLogout} onSignIn={vi.fn()} /></MemoryRouter>)
  expect(screen.queryByText('a@b.com')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByText('a@b.com')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(onLogout).toHaveBeenCalled()
})

test('Escape closes it', () => {
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={vi.fn()} onSignIn={vi.fn()} /></MemoryRouter>)
  const btn = screen.getByRole('button', { name: 'Account' })
  fireEvent.click(btn)
  expect(btn).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(btn).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('a@b.com')).toBeNull()
})

test('outside click closes it', () => {
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={vi.fn()} onSignIn={vi.fn()} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.mouseDown(document.body)
  expect(screen.queryByText('a@b.com')).toBeNull()
})

test('Escape returns focus to the Account button', () => {
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={vi.fn()} onSignIn={vi.fn()} /></MemoryRouter>)
  const btn = screen.getByRole('button', { name: 'Account' })
  fireEvent.click(btn)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(btn).toHaveFocus()
})

test('Log out closes the menu and calls onLogout', () => {
  const onLogout = vi.fn()
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={onLogout} onSignIn={vi.fn()} /></MemoryRouter>)
  const btn = screen.getByRole('button', { name: 'Account' })
  fireEvent.click(btn)
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(btn).toHaveAttribute('aria-expanded', 'false')
  expect(onLogout).toHaveBeenCalledTimes(1)
})

test('signed in: profile, clan and log out', () => {
  render(<MemoryRouter><AccountMenu email="a@b.com" onLogout={vi.fn()} onSignIn={vi.fn()} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/me')
  expect(screen.getByRole('link', { name: 'Clan' })).toHaveAttribute('href', '/clan')
  expect(screen.queryByRole('button', { name: 'Register / log in' })).toBeNull()
})

test('guest: profile and sign in, no clan or log out', () => {
  const onSignIn = vi.fn()
  render(<MemoryRouter><AccountMenu email={null} onLogout={vi.fn()} onSignIn={onSignIn} /></MemoryRouter>)
  const btn = screen.getByRole('button', { name: 'Account' })
  fireEvent.click(btn)
  expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/me')
  expect(screen.queryByRole('link', { name: 'Clan' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Register / log in' }))
  expect(onSignIn).toHaveBeenCalledTimes(1)
  expect(btn).toHaveAttribute('aria-expanded', 'false')
})
