import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { MatchPlayer, MatchView } from '../api/types'
import { getMatch } from '../bots/api'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { t, useLang } from '../i18n'

type Load = { kind: 'loading' } | { kind: 'ok'; match: MatchView } | { kind: 'notFound' } | { kind: 'error' }

function Name({ p }: { p: MatchPlayer }) {
  return p.bot_id ? <Link to={`/bot/${p.bot_id}`}>{p.name}</Link> : <>{p.name}</>
}

export function MatchPage() {
  const { id = '' } = useParams()
  useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ kind: 'loading' })
    getMatch(id).then(
      (match) => live && setLoad({ kind: 'ok', match }),
      (e) => live && setLoad({ kind: e instanceof ApiError && e.status === 404 ? 'notFound' : 'error' }),
    )
    return () => {
      live = false
    }
  }, [id, attempt])

  if (load.kind === 'loading') return <main className="screen"><Loader label={t('bots.loading')} /></main>
  if (load.kind !== 'ok') {
    const nf = load.kind === 'notFound'
    return (
      <main className="screen">
        <EmptyState emoji={nf ? '🕵️' : '😵'} title={t(nf ? 'arena.match.notFound' : 'arena.match.error')} body={nf ? t('arena.match.notFoundBody') : undefined}>
          {!nf && <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>{t('room.retry')}</button>}
        </EmptyState>
        <Link className="btn center" to="/">{t('bots.home')}</Link>
      </main>
    )
  }

  const { match } = load
  const bySeat = new Map(match.players.map((p) => [p.seat, p]))
  const name = (seat: number) => bySeat.get(seat)?.name ?? String(seat)

  return (
    <main className="screen match">
      <h2 className="center">{t('arena.match.title')}</h2>
      <div className="match-players">
        {match.players.map((p) => (
          <span key={p.seat} className="pill">
            {p.avatar && <Avatar player={p} size="s" />}
            <Name p={p} />
          </span>
        ))}
      </div>
      {match.rounds.map((r) => {
        const stages = [0, 1].filter((st) => r.statements.some((s) => s.stage === st) || r.votes.some((v) => v.stage === st))
        return (
          <section key={r.round} className="card match-round">
            <span className="pill round-pill">{t('arena.match.round', { n: r.round })}</span>
            {stages.map((st) => (
              <div key={st} className="match-stage">
                {st === 1 && <p className="muted">{t('arena.match.tiebreak')}</p>}
                {r.statements.filter((s) => s.stage === st).map((s) => (
                  <div key={`${s.seat}-${s.stage}`} className="bubble wrap">{name(s.seat)}: {s.text}</div>
                ))}
                <div className="vote-chips">
                  {r.votes.filter((v) => v.stage === st).map((v) => (
                    <span key={`${v.voter}-${v.stage}`} className="tag wrap">
                      {v.target === null
                        ? t('arena.match.abstain', { voter: name(v.voter) })
                        : t('arena.match.vote', { voter: name(v.voter), target: name(v.target) })}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="match-out">{r.eliminated === null ? t('arena.match.nobody') : t('arena.match.out', { name: name(r.eliminated) })}</p>
          </section>
        )
      })}
      <section className="card match-reveal">
        <h3>{t('arena.match.reveal')}</h3>
        {match.players.map((p) => (
          <p key={p.seat} className="reveal-line wrap">
            <span>{p.name}:</span> <span className={`role ${p.role}`}>{t(`arena.role.${p.role}`)}</span>
          </p>
        ))}
        <p>{t('arena.match.words', match.words)}</p>
        <p className="winner-banner">{t(`arena.match.winner.${match.winner}`)}</p>
      </section>
      <Link className="btn center" to="/">{t('bots.home')}</Link>
    </main>
  )
}
