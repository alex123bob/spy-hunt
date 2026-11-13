import { act, render, screen } from '@testing-library/react'
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
