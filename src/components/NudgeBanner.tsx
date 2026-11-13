import { useEffect, useRef, useState } from 'react'
import { t, useLang } from '../i18n'
import { useAccount } from '../state/accounts'
import { dismiss, pendingNudge, pendingStreak, subscribeNudges, type NudgeTrigger } from '../state/nudges'
import { useReducedMotion } from '../motion/useReducedMotion'

const SPIN_MS = 300

export function NudgeBanner() {
  const account = useAccount()
  useLang() // re-render when the language changes so the copy follows it
  const [trigger, setTrigger] = useState<NudgeTrigger | null>(() => pendingNudge())
  const [closing, setClosing] = useState(false)
  const reducedMotion = useReducedMotion()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => subscribeNudges(() => setTrigger(pendingNudge())), [])
  useEffect(() => {
    setClosing(false)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [trigger])
  if (account.email || !trigger) return null

  const close = () => {
    if (reducedMotion) {
      dismiss(trigger)
      return
    }
    setClosing(true)
    timeoutRef.current = setTimeout(() => dismiss(trigger), SPIN_MS)
  }
  return (
    <div className="nudge" role="status">
      <span>{t(`nudge.${trigger}`, { n: pendingStreak() })}</span>
      <button type="button" className={`pill${closing ? ' closing' : ''}`} aria-label={t('nudge.dismiss')} onClick={close}>✕</button>
    </div>
  )
}
