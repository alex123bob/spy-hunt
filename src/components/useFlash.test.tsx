import { act, fireEvent, render, screen } from '@testing-library/react'
import { useFlash } from './useFlash'

function Saver({ text = 'Look saved' }: { text?: string }) {
  const f = useFlash()
  return <><button ref={f.ref} type="button" onClick={() => f.flash(text)}>Save</button>{f.node}</>
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('pops a status bubble that goes away on its own', () => {
  render(<Saver />)
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('status')).toHaveTextContent('Look saved')
  act(() => { vi.advanceTimersByTime(2300) })
  expect(screen.queryByRole('status')).toBeNull()
})

test('a second press restarts the timer instead of stacking', () => {
  render(<Saver />)
  const btn = screen.getByRole('button', { name: 'Save' })
  fireEvent.click(btn)
  act(() => { vi.advanceTimersByTime(1500) })
  fireEvent.click(btn)
  act(() => { vi.advanceTimersByTime(1500) })
  expect(screen.getAllByRole('status')).toHaveLength(1)
  act(() => { vi.advanceTimersByTime(900) })
  expect(screen.queryByRole('status')).toBeNull()
})
