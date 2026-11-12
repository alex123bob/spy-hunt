import { useEffect, useState } from 'react'
import { useReducedMotion } from '../motion/useReducedMotion'

const COLORS = ['#f6c445', '#e5533d', '#8fd3e8', '#9fe0b5', '#f4a6c1', '#c9b6f2']
const MAX = 40

interface Piece {
  left: number
  color: string
  delay: number
  duration: number
}

function makePieces(n: number): Piece[] {
  const count = Math.max(0, Math.min(n, MAX))
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.6,
    duration: 1.8 + Math.random(),
  }))
}

export function Confetti({ run, pieces = MAX }: { run: boolean; pieces?: number }) {
  const reduced = useReducedMotion()
  const active = run && !reduced
  const [list, setList] = useState<Piece[]>([])

  useEffect(() => {
    if (!active) {
      setList([])
      return
    }
    setList(makePieces(pieces))
    const t = setTimeout(() => setList([]), 3000)
    return () => clearTimeout(t)
  }, [active, pieces])

  if (!active) return null
  return (
    <div className="confetti" aria-hidden="true">
      {list.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  )
}
