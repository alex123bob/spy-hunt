import type { Snapshot } from '../api/types'
import { Countdown } from '../components/Countdown'
import { groupVotes } from '../game/votes'
import { t } from '../i18n'

export function Reveal({ state, offset = 0, holdUntil = null }: { state: Snapshot; offset?: number; holdUntil?: number | null }) {
  const r = state.reveal
  const nameOf = (seat: number | null) => state.players.find((p) => p.seat === seat)?.name ?? '?'
  const { groups, abstained } = groupVotes(r?.votes ?? [])
  return (
    <main className="screen">
      <header className="row between">
        <h2>{t('reveal.title')}</h2>
        {state.phase === 'reveal' ? (
          <Countdown deadline={state.phase_deadline} offset={offset} vibrate={false} />
        ) : (
          holdUntil != null && <Countdown deadline={holdUntil} vibrate={false} />
        )}
      </header>
      {r && r.eliminated != null && (
        <div className="panel center">
          <h3 className="wrap">{t('reveal.out', { name: nameOf(r.eliminated) })}</h3>
          {r.role && <p className={`role ${r.role}`}>{t(`role.${r.role}`)}</p>}
        </div>
      )}
      {r && r.eliminated == null && (
        <p className="center wrap">
          {r.outcome === 'tiebreak'
            ? `${t('reveal.tie')} ${(r.tied ?? []).map(nameOf).join(', ')}`
            : t('reveal.nobody')}
        </p>
      )}
      {r && r.votes.length > 0 && (
        <section className="panel">
          <p className="muted">{t('reveal.votes')}</p>
          {groups.map((g) => (
            <div key={g.target} className="vote-group">
              <div className="row between wrap">
                <strong className="wrap">{nameOf(g.target)}</strong>
                <span className="muted">
                  {'●'.repeat(Math.min(g.voters.length, 6))} {t(g.voters.length === 1 ? 'reveal.voteCountOne' : 'reveal.voteCount', { n: g.voters.length })}
                </span>
              </div>
              <p className="muted small wrap">{g.voters.map(nameOf).join(', ')}</p>
            </div>
          ))}
          {abstained.length > 0 && <p className="muted wrap">{t('reveal.abstainedList', { names: abstained.map(nameOf).join(', ') })}</p>}
        </section>
      )}
    </main>
  )
}
