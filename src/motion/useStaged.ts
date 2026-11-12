import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

/** Index of the current step: 0 at mount, +1 after each (cumulative) delay. */
export function useStaged(delays: number[]): number {
  const reduced = useReducedMotion()
  const key = delays.join(',')
  const [state, setState] = useState({ key, step: 0 })

  useEffect(() => {
    setState({ key, step: 0 })
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    let total = 0
    delays.forEach((d, i) => {
      total += d
      timers.push(setTimeout(() => setState({ key, step: i + 1 }), total))
    })
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced])

  if (reduced) return delays.length
  // A stale step from a previous delays list must not leak for one render.
  return state.key === key ? state.step : 0
}
