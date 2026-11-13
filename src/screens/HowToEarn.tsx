import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CreditRules } from '../api/types'
import { EarnGuide } from '../components/EarnGuide'
import { getCredits } from '../credits/api'
import { t, useLang } from '../i18n'

/** How each activity earns credits; reached from the info tile on the profile. */
export function HowToEarn() {
  useLang()
  const nav = useNavigate()
  const loc = useLocation()
  const [rules, setRules] = useState<CreditRules | undefined>()
  useEffect(() => {
    let live = true
    getCredits().then((s) => { if (live) setRules(s.rules) }).catch(() => {})
    return () => { live = false }
  }, [])
  // Opened from inside the app: go back to where we came from. Opened directly: go to the profile.
  const back = () => (loc.key !== 'default' ? nav(-1) : nav('/me'))

  return (
    <main className="screen how-to-earn">
      <button type="button" className="btn small back-btn" onClick={back}>← {t('common.back')}</button>
      <h2 className="center big">{t('credits.howTitle')}</h2>
      <EarnGuide rules={rules} />
    </main>
  )
}
