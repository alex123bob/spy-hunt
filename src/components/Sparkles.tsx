import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '../motion/useReducedMotion'

const COLORS = ['#f6c445', '#e5533d', '#8fd3e8', '#9fe0b5']
const COUNT = 12

export function Sparkles({ burstKey }: { burstKey: number }) {
  const reduced = useReducedMotion()
  const prev = useRef(burstKey)
  const [go, setGo] = useState<number | null>(null)

  useEffect(() => {
    if (burstKey === prev.current) return
    prev.current = burstKey
    if (reduced) return
    // Let the flip get going before the burst, then restart the animation.
    setGo(null)
    const t = setTimeout(() => setGo(burstKey), 250)
    return () => clearTimeout(t)
  }, [burstKey, reduced])

  if (reduced || go === null) return null
  return (
    <div className="sparkles go" aria-hidden="true" key={go}>
      {Array.from({ length: COUNT }, (_, i) => {
        const a = (i / COUNT) * Math.PI * 2
        return (
          <i
            key={i}
            style={
              {
                '--x': `calc(-50% + ${Math.round(Math.cos(a) * 150)}px)`,
                '--y': `calc(-50% + ${Math.round(Math.sin(a) * 110)}px)`,
                background: COLORS[i % COLORS.length],
              } as CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
