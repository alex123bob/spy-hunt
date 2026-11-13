import { useEffect, useState } from 'react'
import type { CreditPart } from '../api/types'
import { t, useLang } from '../i18n'
import { useReducedMotion } from '../motion/useReducedMotion'

/** Delay before the first chip, then between chips (ms). */
export const BURST_START_MS = 450
export const BURST_STEP_MS = 380
const COUNT_MS = 700

/** Counts from 0 to `to` once `go` is true; jumps straight there under reduced motion. */
function useCountUp(to: number, go: boolean, reduced: boolean): number {
  const [n, setN] = useState(reduced ? to : 0)
  useEffect(() => {
    if (reduced || !go) { setN(reduced ? to : 0); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, go, reduced])
  return n
}

/**
 * The "you earned credits" moment on a result screen: a total that counts up, one chip
 * per source popping in after the other, and a "+N" that floats up and fades. The chips
 * stay afterwards so the player can read what they got and why.
 */
export function CreditBurst({ total, parts }: { total: number; parts?: CreditPart[] }) {
  useLang()
  const reduced = useReducedMotion()
  // Older servers send only the total; show it as one chip.
  const list: CreditPart[] = parts && parts.length ? parts : [{ kind: 'played', n: total }]
  const fallback = !(parts && parts.length)
  const [shown, setShown] = useState(reduced ? list.length : 0)
  useEffect(() => {
    if (reduced) { setShown(list.length); return }
    setShown(0)
    const timers = list.map((_, i) => setTimeout(() => setShown(i + 1), BURST_START_MS + i * BURST_STEP_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, list.length, reduced])
  const sumShown = list.slice(0, shown).reduce((a, p) => a + p.n, 0)
  const counted = useCountUp(sumShown, shown > 0, reduced)
  if (total <= 0) return null

  return (
    <section className="credit-burst" data-testid="credits-earned">
      <span className="sr-only">{t('credits.earned', { n: total })}</span>
      <div className="credit-total" aria-hidden="true">
        <span className="credit-coin">🪙</span>
        <strong>+{reduced ? total : counted}</strong>
        <span>{t('credits.title')}</span>
        {!reduced && shown > 0 && <span key={shown} className="credit-float">+{list[shown - 1].n}</span>}
      </div>
      <ul className="credit-chips" aria-hidden="true">
        {list.slice(0, shown).map((p, i) => (
          <li key={`${p.kind}-${i}`} className={`credit-chip chip-${p.kind}`}>
            <strong>+{p.n}</strong> {fallback ? t('credits.title') : t(`credits.kind.${p.kind}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}
