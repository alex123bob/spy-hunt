import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CreditSummary } from '../api/types'
import { HeroCard } from '../components/HeroCard'
import { LookEditor } from '../looks/LookEditor'
import { getCredits } from '../credits/api'
import { RANKS, rankByIndex, rankTitleKey } from '../game/rank'
import { t, useLang } from '../i18n'

export function Profile() {
  useLang()
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  useEffect(() => {
    let live = true
    getCredits().then((s) => { if (live) setSummary(s) }).catch(() => {})
    return () => { live = false }
  }, [])
  const current = summary ? summary.rank.index : 0

  return (
    <main className="screen profile">
      <h2 className="center big">{t('credits.title')}</h2>
      <HeroCard summary={summary} />
      {summary && (
        <section className="stats-trio">
          <div className="tile c-sun"><span>{t('credits.lifetime')}</span> <strong className="big">{summary.credits}</strong></div>
          <div className="tile c-mint"><span>{t('credits.today')}</span> <strong className="big">{summary.today}</strong></div>
        </section>
      )}
      <LookEditor name={t('credits.profile')} />
      <ol className="ladder">
        {RANKS.map((r, i) => (
          <li key={r.key} className={`ladder-row ladder-${i}${i === current ? ' current' : ''}`}
            aria-current={i === current ? 'true' : undefined}>
            <span className="ladder-hero" aria-hidden="true">{rankByIndex(i).hero}</span>
            <span className="ladder-title">{t(rankTitleKey(i))}</span>
            <span className="ladder-min">{r.min}</span>
          </li>
        ))}
      </ol>
      <Link to="/" className="btn center">{t('bots.home')}</Link>
    </main>
  )
}
