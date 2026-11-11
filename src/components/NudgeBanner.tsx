import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { useAccount } from '../state/accounts'
import { dismiss, pendingNudge, pendingStreak, subscribeNudges, type NudgeTrigger } from '../state/nudges'

export function NudgeBanner() {
  const account = useAccount()
  const [trigger, setTrigger] = useState<NudgeTrigger | null>(() => pendingNudge())
  useEffect(() => subscribeNudges(() => setTrigger(pendingNudge())), [])
  if (account.email || !trigger) return null

  const close = () => {
    dismiss(trigger)
  }
  return (
    <div className="nudge" role="status">
      <span>{t(`nudge.${trigger}`, { n: pendingStreak() })}</span>
      <button type="button" className="btn chip" aria-label={t('nudge.dismiss')} onClick={close}>✕</button>
    </div>
  )
}
