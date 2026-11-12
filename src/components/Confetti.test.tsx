import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Confetti } from './Confetti'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Confetti', () => {
  it('renders at most 40 pieces', () => {
    const { container } = render(<Confetti run pieces={100} />)
    expect(container.querySelectorAll('i').length).toBe(40)
  })

  it('defaults to 40 pieces and is aria-hidden', () => {
    const { container } = render(<Confetti run />)
    expect(container.querySelectorAll('i').length).toBe(40)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders nothing when not running', () => {
    const { container } = render(<Confetti run={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { container } = render(<Confetti run />)
    expect(container).toBeEmptyDOMElement()
  })

  it('unmounts pieces after 3s', () => {
    vi.useFakeTimers()
    const { container } = render(<Confetti run />)
    act(() => { vi.advanceTimersByTime(3100) })
    expect(container.querySelectorAll('i').length).toBe(0)
  })
})
