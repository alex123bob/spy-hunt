import { useRef, useState, type ReactNode } from 'react'
import { Bubble } from './Bubble'

/**
 * A button that, while `why` is set, looks disabled but stays tappable: a tap explains why
 * in a bubble above it instead of doing nothing (a real `disabled` button swallows the tap).
 */
export function WhyButton({ why, onClick, className, children }: {
  why: string | null | false | undefined; onClick: () => void; className?: string; children: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState(false)
  const blocked = !!why
  return (
    <>
      <button
        ref={ref} type="button" className={`${className ?? 'btn'}${blocked ? ' is-blocked' : ''}`}
        aria-disabled={blocked || undefined} aria-description={blocked ? why : undefined}
        onClick={blocked ? () => setTip((v) => !v) : onClick}
      >
        {children}
      </button>
      {tip && blocked && <Bubble anchor={ref} text={why} onClose={() => setTip(false)} />}
    </>
  )
}
