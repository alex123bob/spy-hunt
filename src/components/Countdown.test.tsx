import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Countdown } from './Countdown'

describe('Countdown', () => {
  it('exposes seconds as timer text and ring progress', () => {
    render(<Countdown deadline={Date.now() + 10_000} total={20} vibrate={false} />)
    const el = screen.getByRole('timer')
    expect(el).toHaveTextContent('10')
    expect(el.parentElement!.style.getPropertyValue('--p')).toBe('0.5')
  })
  it('marks urgent at 5 seconds or less', () => {
    render(<Countdown deadline={Date.now() + 4_000} total={20} vibrate={false} />)
    expect(screen.getByRole('timer')).toHaveClass('urgent')
  })
  it('pulses while urgent', () => {
    render(<Countdown deadline={Date.now() + 4_000} total={20} vibrate={false} />)
    expect(screen.getByRole('timer')).toHaveClass('pulse')
  })
})
