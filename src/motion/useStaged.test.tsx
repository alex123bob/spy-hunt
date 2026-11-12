import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaged } from './useStaged'

describe('useStaged', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('steps through cumulative delays', () => {
    const { result } = renderHook(() => useStaged([100, 200]))
    expect(result.current).toBe(0)
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe(1)
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe(2)
  })

  it('nine steps of a busy reveal finish inside 2500ms', () => {
    const delays = [...Array(9).fill(130), 400, 500]
    const { result } = renderHook(() => useStaged(delays))
    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current).toBe(11)
  })

  it('clears timers on unmount', () => {
    const { unmount } = renderHook(() => useStaged([100, 200, 300]))
    act(() => { vi.advanceTimersByTime(50) })
    unmount()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('jumps to the end under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { result } = renderHook(() => useStaged([100, 200]))
    expect(result.current).toBe(2)
  })

  it('restarts when delays change', () => {
    const { result, rerender } = renderHook(({ d }) => useStaged(d), {
      initialProps: { d: [100, 100] },
    })
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe(2)
    rerender({ d: [50, 50, 50] })
    expect(result.current).toBe(0)
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current).toBe(3)
  })
})
