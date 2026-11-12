import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sparkles } from './Sparkles'

describe('Sparkles', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not burst on mount under StrictMode', () => {
    const { container } = render(<StrictMode><Sparkles burstKey={0} /></StrictMode>)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(container.querySelector('.sparkles')).toBeNull()
  })

  it('bursts when burstKey changes', () => {
    const { container, rerender } = render(<Sparkles burstKey={0} />)
    rerender(<Sparkles burstKey={1} />)
    act(() => { vi.advanceTimersByTime(300) })
    expect(container.querySelector('.sparkles')).not.toBeNull()
  })
})
