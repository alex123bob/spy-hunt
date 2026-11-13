import { act, fireEvent, render, screen } from '@testing-library/react'
import { TapTip } from './TapTip'

test('a tap shows the label, a second tap hides it', () => {
  render(<TapTip label="Senior Hunter">🦉</TapTip>)
  const btn = screen.getByRole('button', { name: 'Senior Hunter' })
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.click(btn)
  expect(screen.getByRole('tooltip')).toHaveTextContent('Senior Hunter')
  expect(btn).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(btn)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

test('an outside tap or Escape closes it', () => {
  render(<><TapTip label="Clan: Foxes">🦊</TapTip><p>elsewhere</p></>)
  const btn = screen.getByRole('button', { name: 'Clan: Foxes' })
  fireEvent.click(btn)
  fireEvent.pointerDown(screen.getByText('elsewhere'))
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.click(btn)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).toBeNull()
})

test('it closes on its own after a few seconds', () => {
  vi.useFakeTimers()
  try {
    render(<TapTip label="Legend">👑</TapTip>)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    act(() => { vi.advanceTimersByTime(3100) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
