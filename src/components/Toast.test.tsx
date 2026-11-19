import { act, fireEvent, render, screen } from '@testing-library/react'
import { Toast, TOAST_MS } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('shows the text, then hides itself', () => {
  render(<Toast text="Look saved" />)
  expect(screen.getByRole('status')).toHaveTextContent('Look saved')
  act(() => { vi.advanceTimersByTime(TOAST_MS + 50) })
  expect(screen.queryByRole('status')).toBeNull()
})

test('the same text shows again when the nonce changes', () => {
  const { rerender } = render(<Toast text="Copied" nonce={1} />)
  act(() => { vi.advanceTimersByTime(TOAST_MS + 50) })
  expect(screen.queryByRole('status')).toBeNull()
  rerender(<Toast text="Copied" nonce={2} />)
  expect(screen.getByRole('status')).toHaveTextContent('Copied')
})

test('empty text shows nothing', () => {
  render(<Toast text="" />)
  expect(screen.queryByRole('status')).toBeNull()
})

test('clicking the toast runs onClick when given', () => {
  const onClick = vi.fn()
  render(<Toast text="It's your turn" onClick={onClick} />)
  fireEvent.click(screen.getByRole('status'))
  expect(onClick).toHaveBeenCalled()
})

test('has no click handler when onClick is not given', () => {
  render(<Toast text="Look saved" />)
  expect(() => fireEvent.click(screen.getByRole('status'))).not.toThrow()
})
