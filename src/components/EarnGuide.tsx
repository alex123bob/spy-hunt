import type { CreditKind, CreditRules } from '../api/types'
import { t, useLang } from '../i18n'

// Shown until /credits answers (or if it fails). Must mirror backend credits.py rules().
export const DEFAULT_RULES: CreditRules = {
  game: { played: 10, won: 10, min_humans: 2 },
  daily: { daily: 10, found: 10 },
  streak: { step: 5, max: 50 },
  daily_cap: 500,
}

const ICON: Record<CreditKind, string> = { played: '🎲', won: '🏆', daily: '🧩', found: '🔍', streak: '🔥' }

/** "How to earn credits": one row per activity with what it pays. */
export function EarnGuide({ rules }: { rules?: CreditRules }) {
  useLang()
  const r = rules ?? DEFAULT_RULES
  const rows: { kind: CreditKind; label: string; amt: string }[] = [
    { kind: 'played', label: t('credits.how.played', { n: r.game.min_humans }), amt: `+${r.game.played}` },
    { kind: 'won', label: t('credits.how.won'), amt: `+${r.game.won}` },
    { kind: 'daily', label: t('credits.how.daily'), amt: `+${r.daily.daily}` },
    { kind: 'found', label: t('credits.how.found'), amt: `+${r.daily.found}` },
    {
      kind: 'streak',
      label: t('credits.how.streak', { step: r.streak.step, max: r.streak.max }),
      amt: t('credits.how.streakAmt', { n: r.streak.max }),
    },
  ]
  return (
    <section className="panel earn-guide" data-testid="earn-guide">
      <ul className="earn-list">
        {rows.map((row) => (
          <li key={row.kind} className={`earn-row chip-${row.kind}`}>
            <span className="earn-icon" aria-hidden="true">{ICON[row.kind]}</span>
            <span className="earn-label">{row.label}</span>
            <strong className="earn-amt">{row.amt}</strong>
          </li>
        ))}
      </ul>
      <p className="muted earn-note">{t('credits.how.cap', { n: r.daily_cap })}</p>
      <p className="muted earn-note">{t('credits.how.bots')}</p>
    </section>
  )
}
