import { t, useLang } from '../i18n'
import type { CreditSummary } from '../api/types'
import { rankByIndex, rankTitleKey } from '../game/rank'
import { useReducedMotion } from '../motion/useReducedMotion'

export function HeroCard({ summary }: { summary: CreditSummary | null }) {
  useLang()
  const reduced = useReducedMotion()
  const index = summary ? summary.rank.index : 0
  const rank = rankByIndex(index)
  const shine = !reduced && index >= 4
  const next = summary?.next ?? null
  let pct = 100
  if (summary && next) {
    const span = next.min - summary.rank.min
    pct = span > 0 ? Math.max(0, Math.min(100, ((summary.credits - summary.rank.min) / span) * 100)) : 0
  }

  return (
    <div className={`hero-card hero-rank-${rank.key === 'rookie' ? 0 : index}${shine ? ' hero-shine' : ''}`}>
      <div className="hero-emoji" aria-hidden="true">{rank.hero}</div>
      <div className="hero-body">
        <div className="hero-title">{t(rankTitleKey(index))}</div>
        {summary && (
          <>
            <div className="hero-credits">
              <span>{t('credits.lifetime')}</span> <strong>{summary.credits}</strong>
            </div>
            {next ? (
              <>
                <div className="hero-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <div className="hero-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="hero-next">
                  {t('credits.toNext', { n: next.remaining, title: t(rankTitleKey(index + 1)) })}
                </div>
              </>
            ) : (
              <div className="hero-next hero-max">{t('credits.max')}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
