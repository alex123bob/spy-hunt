import type { Snapshot } from '../api/types'
import { Avatar } from '../components/Avatar'
import { Confetti } from '../components/Confetti'
import { Countdown } from '../components/Countdown'
import { groupVotes } from '../game/votes'
import { revealDelays } from '../game/revealTiming'
import { useStaged } from '../motion/useStaged'
import { t } from '../i18n'

export function Reveal({ state, offset = 0, holdUntil = null }: { state: Snapshot; offset?: number; holdUntil?: number | null }) {
  const r = state.reveal
  const player = (seat: number | null) => state.players.find((p) => p.seat === seat)
  const nameOf = (seat: number | null) => player(seat)?.name ?? '?'
  const votes = r?.votes ?? []
  const { groups, abstained } = groupVotes(votes)
  const step = useStaged(revealDelays(votes.length))
  const stamped = step >= votes.length + 2
  const out = r && r.eliminated != null ? player(r.eliminated) : undefined
  let n = 0
  const token = (seat: number, dashed = false) => {
    const i = n++
    const p = player(seat)
    return p ? (
      <span key={seat} className={`tok${step > i ? ' in' : ''}${dashed ? ' dashed' : ''}`} aria-hidden>
        <Avatar player={p} size="s" />
      </span>
    ) : null
  }
  return (
    <main className="screen reveal-screen">
      <Confetti run={stamped && r?.role === 'spy' && state.me.seat !== r.eliminated} />
      <header className="row between">
        <h2>{t('reveal.title')}</h2>
        {state.phase === 'reveal' ? (
          <Countdown deadline={state.phase_deadline} offset={offset} vibrate={false} />
        ) : (
          holdUntil != null && <Countdown deadline={holdUntil} vibrate={false} />
        )}
      </header>
      {r && r.eliminated != null && (
        <div className="panel center reveal-out">
          <div className={`bigav${step >= votes.length + 1 ? ' wob' : ''}`}>
            <Avatar player={out ?? { name: '?' }} size="l" out />
            {r.role && (
              <span className={`stamp ${r.role}${stamped ? ' on' : ''}`} aria-hidden>
                {t(`role.${r.role}`)}
              </span>
            )}
          </div>
          <h3 className="wrap">{t('reveal.out', { name: nameOf(r.eliminated) })}</h3>
          {r.role && <p className={`role ${r.role}`}>{t(`role.${r.role}`)}</p>}
        </div>
      )}
      {r && r.eliminated == null && (
        <div className="shrug panel">
          <span className="spot" aria-hidden>🤷</span>
          <p className="center wrap">
            {r.outcome === 'tiebreak'
              ? `${t('reveal.tie')} ${(r.tied ?? []).map(nameOf).join(', ')}`
              : t('reveal.nobody')}
          </p>
        </div>
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
              <div className="tokens">{g.voters.map((v) => token(v))}</div>
              <p className="muted small wrap">{g.voters.map(nameOf).join(', ')}</p>
            </div>
          ))}
          {abstained.length > 0 && (
            <div className="vote-group">
              <div className="tokens">{abstained.map((v) => token(v, true))}</div>
              <p className="muted wrap">{t('reveal.abstainedList', { names: abstained.map(nameOf).join(', ') })}</p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
