import { fireEvent, render, screen } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'

test('opens to show email and log out', () => {
  const onLogout = vi.fn()
  render(<AccountMenu email="a@b.com" onLogout={onLogout} />)
  expect(screen.queryByText('a@b.com')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByText('a@b.com')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(onLogout).toHaveBeenCalled()
})

test('Escape closes it', () => {
  render(<AccountMenu email="a@b.com" onLogout={vi.fn()} />)
  const btn = screen.getByRole('button', { name: 'Account' })
  fireEvent.click(btn)
  expect(btn).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(btn).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('a@b.com')).toBeNull()
})

test('outside click closes it', () => {
  render(<AccountMenu email="a@b.com" onLogout={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.mouseDown(document.body)
  expect(screen.queryByText('a@b.com')).toBeNull()
})
