import type { Snapshot } from '../api/types'
import { t } from '../i18n'
import { StatementBubble } from './StatementBubble'

export function StatementHistory({ state }: { state: Snapshot }) {
  const me = state.players.find((p) => p.seat === state.me.seat)
  const viewerLang = me?.lang ?? state.main_lang
  const nameOf = (seat: number | null) => state.players.find((p) => p.seat === seat)?.name ?? ''
  const msgs = state.messages.filter((m) => m.kind !== 'host')
  const rounds = [...new Set(msgs.map((m) => m.round))].sort((a, b) => b - a)
  if (rounds.length === 0) return null
  return (
    <section className="panel history" aria-label={t('vote.statements')}>
      <details open>
      <summary className="muted">{t('vote.statements')}</summary>
      {rounds.map((r) => (
        <div key={r} className="round" data-testid={`round-${r}`}>
          <p className="muted small">{t('table.round', { n: r })}</p>
          {msgs
            .filter((m) => m.round === r)
            .map((m) => (
              <StatementBubble key={m.id} message={m} name={nameOf(m.seat)} viewerLang={viewerLang} mine={m.seat === state.me.seat} />
            ))}
        </div>
      ))}
      </details>
    </section>
  )
}
