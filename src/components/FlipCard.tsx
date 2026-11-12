import type { ReactNode } from 'react'

interface Props {
  flipped: boolean
  front: ReactNode
  back: ReactNode
  label: string
  onClick?: () => void
  className?: string
  size?: 'lg' | 'sm'
}

export function FlipCard({ flipped, front, back, label, onClick, className, size = 'lg' }: Props) {
  const inner = (
    <div className={`flip-card${flipped ? ' flipped' : ''}`}>
      <div className="face back" aria-hidden={flipped ? 'true' : undefined}>{back}</div>
      <div className="face front" aria-hidden={flipped ? undefined : 'true'}>{front}</div>
    </div>
  )
  const cls = `flip-scene ${size}${className ? ` ${className}` : ''}`
  if (onClick) {
    return (
      <button type="button" className={cls} aria-label={label} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <div role="group" className={cls} aria-label={label}>
      {inner}
    </div>
  )
}
