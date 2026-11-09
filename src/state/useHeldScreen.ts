import { useEffect, useRef, useState } from 'react'

export type Screen = 'lobby' | 'closed' | 'table' | 'vote' | 'reveal' | 'result'

export const TABLE_TO_VOTE_MS = 3000
export const REVEAL_MS = 6000

interface Hold {
  screen: Screen
  until: number
}

/**
 * Lets the player read before the screen moves on: the Table stays for a few
 * seconds after the last statement, and a fresh vote result (including one that
 * ends the game or starts a tie-break) stays up before the next screen.
 * Holds only start from live changes, never from the first render.
 */
export function useHeldScreen(target: Screen, reveal: unknown, now: () => number = Date.now): Screen {
  const prevTarget = useRef(target)
  const prevReveal = useRef(reveal)
  const hold = useRef<Hold | null>(null)
  const [, tick] = useState(0)

  if (target === 'lobby' || target === 'closed') {
    hold.current = null
  } else {
    if (reveal !== prevReveal.current && reveal && target !== 'reveal') {
      hold.current = { screen: 'reveal', until: now() + REVEAL_MS }
    } else if (target !== prevTarget.current && prevTarget.current === 'table' && target === 'vote') {
      if (!hold.current) hold.current = { screen: 'table', until: now() + TABLE_TO_VOTE_MS }
    }
  }
  prevTarget.current = target
  prevReveal.current = reveal

  const h = hold.current
  const active = h && now() < h.until ? h : null
  if (!active) hold.current = null

  const until = active?.until
  useEffect(() => {
    if (until === undefined) return
    const id = setTimeout(() => tick((n) => n + 1), Math.max(0, until - now()) + 5)
    return () => clearTimeout(id)
  }, [until, now])

  return active ? active.screen : target
}
