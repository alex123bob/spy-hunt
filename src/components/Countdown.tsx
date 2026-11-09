import { useEffect, useState } from 'react'
import { remainingMs } from '../state/roomStore'

export function Countdown({ deadline, offset = 0, vibrate = true }: { deadline: number | null; offset?: number; vibrate?: boolean }) {
  const [ms, setMs] = useState(() => remainingMs(deadline, offset, Date.now()))
  useEffect(() => {
    let lastSec = -1
    const tick = () => {
      const r = remainingMs(deadline, offset, Date.now())
      setMs(r)
      const s = Math.ceil(r / 1000)
      if (vibrate && r > 0 && s <= 5 && s !== lastSec) {
        lastSec = s
        try {
          navigator.vibrate?.(30)
        } catch {
          // not supported
        }
      }
      return r
    }
    if (tick() <= 0) return
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [deadline, offset, vibrate])
  const secs = Math.ceil(ms / 1000)
  return (
    <span className={`countdown ${secs <= 5 && secs > 0 ? 'urgent' : ''}`} role="timer" aria-live="off">
      {secs}
    </span>
  )
}
