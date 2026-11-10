import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { MatchPlayer, MatchView } from '../api/types'
import { getMatch } from '../bots/api'
import { Avatar } from '../components/Avatar'
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

  if (load.kind === 'loading') return <main className="screen"><p className="muted center">{t('bots.loading')}</p></main>
  if (load.kind !== 'ok') {
    return (
      <main className="screen">
        <h2 className="center">{t(load.kind === 'notFound' ? 'arena.match.notFound' : 'arena.match.error')}</h2>
        {load.kind === 'notFound' && <p className="muted center">{t('arena.match.notFoundBody')}</p>}
        {load.kind === 'error' && <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>{t('room.retry')}</button>}
        <Link className="btn center" to="/">{t('bots.home')}</Link>
      </main>
    )
  }

  const { match } = load
  const bySeat = new Map(match.players.map((p) => [p.seat, p]))
  const name = (seat: number) => bySeat.get(seat)?.name ?? String(seat)

  return (
    <main className="screen">
      <h2 className="center">{t('arena.match.title')}</h2>
      <div className="row">
        {match.players.map((p) => (
          <span key={p.seat} className="row">
            {p.avatar && <Avatar player={p} />}
            <Name p={p} />
          </span>
        ))}
      </div>
      {match.rounds.map((r) => {
        const stages = [0, 1].filter((st) => r.statements.some((s) => s.stage === st) || r.votes.some((v) => v.stage === st))
        return (
          <section key={r.round}>
            <h3>{t('arena.match.round', { n: r.round })}</h3>
            {stages.map((st) => (
              <div key={st}>
                {st === 1 && <p className="muted">{t('arena.match.tiebreak')}</p>}
                {r.statements.filter((s) => s.stage === st).map((s) => (
                  <p key={`${s.seat}-${s.stage}`}>{name(s.seat)}: {s.text}</p>
                ))}
                {r.votes.filter((v) => v.stage === st).map((v) => (
                  <p key={`${v.voter}-${v.stage}`} className="muted">
                    {v.target === null
                      ? t('arena.match.abstain', { voter: name(v.voter) })
                      : t('arena.match.vote', { voter: name(v.voter), target: name(v.target) })}
                  </p>
                ))}
              </div>
            ))}
            <p>{r.eliminated === null ? t('arena.match.nobody') : t('arena.match.out', { name: name(r.eliminated) })}</p>
          </section>
        )
      })}
      <section>
        <h3>{t('arena.match.reveal')}</h3>
        {match.players.map((p) => (
          <p key={p.seat}>{p.name}: {t(`arena.role.${p.role}`)}</p>
        ))}
        <p>{t('arena.match.words', match.words)}</p>
        <p>{t(`arena.match.winner.${match.winner}`)}</p>
      </section>
      <Link className="btn center" to="/">{t('bots.home')}</Link>
    </main>
  )
}
