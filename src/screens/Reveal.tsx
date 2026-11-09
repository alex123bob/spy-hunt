import type { Snapshot } from '../api/types'
import { Countdown } from '../components/Countdown'
import { t } from '../i18n'

export function Reveal({ state, offset = 0 }: { state: Snapshot; offset?: number }) {
  const r = state.reveal
  const nameOf = (seat: number | null) => state.players.find((p) => p.seat === seat)?.name ?? '?'
  return (
    <main className="screen">
      <header className="row between">
        <h2>{t('reveal.title')}</h2>
        <Countdown deadline={state.phase_deadline} offset={offset} vibrate={false} />
      </header>
      {r && r.eliminated != null && (
        <div className="panel center">
          <h3 className="wrap">{t('reveal.out', { name: nameOf(r.eliminated) })}</h3>
          {r.role && <p className={`role ${r.role}`}>{t(`role.${r.role}`)}</p>}
        </div>
      )}
      {r && r.eliminated == null && (
        <p className="center">{r.outcome === 'tiebreak' ? t('reveal.tie') : t('reveal.nobody')}</p>
      )}
      {r && r.votes.length > 0 && (
        <section className="panel">
          <p className="muted">{t('reveal.votes')}</p>
          {r.votes.map((v) => (
            <div key={v.voter} className="row between wrap">
              <span>{nameOf(v.voter)}</span>
              <span className="muted">→ {v.target == null ? t('reveal.abstained') : nameOf(v.target)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
