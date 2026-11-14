import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { GameDetail as Detail, GameReplay, Message } from '../api/types'
import { CreditBurst } from '../components/CreditBurst'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { StatementBubble } from '../components/StatementBubble'
import { getMyGameDetail, getMyGameReplay } from '../games/api'
import { wordFor } from '../games/words'
import { t, useLang } from '../i18n'

type Load = { kind: 'loading' } | { kind: 'ok'; detail: Detail } | { kind: 'notFound' } | { kind: 'error' }
type ReplayLoad = { kind: 'loading' } | { kind: 'ok'; replay: GameReplay } | { kind: 'none' }

export function GameDetail() {
  const { roomId = '', gameNo = '' } = useParams()
  const viewerLang = useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [replayLoad, setReplayLoad] = useState<ReplayLoad>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ kind: 'loading' })
    if (!/^\d+$/.test(gameNo)) {
      setLoad({ kind: 'notFound' })
      return
    }
    getMyGameDetail(roomId, Number(gameNo)).then(
      (detail) => live && setLoad({ kind: 'ok', detail }),
      (e) => live && setLoad({ kind: e instanceof ApiError && e.status === 404 ? 'notFound' : 'error' }),
    )
    return () => {
      live = false
    }
  }, [roomId, gameNo, attempt])

  useEffect(() => {
    let live = true
    setReplayLoad({ kind: 'loading' })
    if (!/^\d+$/.test(gameNo)) return
    getMyGameReplay(roomId, Number(gameNo)).then(
      (replay) => live && setReplayLoad({ kind: 'ok', replay }),
      () => live && setReplayLoad({ kind: 'none' }),
    )
    return () => {
      live = false
    }
  }, [roomId, gameNo, attempt])

  if (load.kind === 'loading') return <main className="screen"><Loader label={t('bots.loading')} /></main>
  if (load.kind !== 'ok') {
    const nf = load.kind === 'notFound'
    return (
      <main className="screen">
        <EmptyState emoji={nf ? '🕵️' : '😵'} title={t(nf ? 'profile.gameDetail.notFound' : 'profile.gameDetail.error')}>
          {!nf && <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>{t('room.retry')}</button>}
        </EmptyState>
        <Link className="btn center" to="/me">{t('bots.home')}</Link>
      </main>
    )
  }

  const { detail } = load
  const words = {
    civilian: wordFor(detail.words, 'civilian', viewerLang, detail.lang),
    spy: wordFor(detail.words, 'spy', viewerLang, detail.lang),
  }
  const hasWords = !!(words.civilian || words.spy)

  const replay = replayLoad.kind === 'ok' ? replayLoad.replay : null
  const bySeat = new Map(replay?.players.map((p) => [p.seat, p]) ?? [])
  const name = (seat: number | null) => (seat === null ? '' : bySeat.get(seat)?.name ?? String(seat))

  return (
    <main className="screen match">
      {replay && (
        <>
          <h2 className="center">{t('profile.gameDetail.replayTitle')}</h2>
          {replay.rounds.map((r) => {
            const stages = [0, 1].filter((st) => r.statements.some((s) => s.stage === st) || r.votes.some((v) => v.stage === st))
            return (
              <section key={r.round} className="card match-round">
                <h3 className="pill round-pill">{t('arena.match.round', { n: r.round })}</h3>
                {stages.map((st) => (
                  <div key={st} className="match-stage">
                    {st === 1 && <p className="muted">{t('arena.match.tiebreak')}</p>}
                    {r.statements.filter((s) => s.stage === st).map((s, i) => (
                      <StatementBubble
                        key={`${s.seat}-${s.stage}-${i}`}
                        message={{
                          id: r.round * 1000 + i, round: r.round, stage: s.stage, seat: s.seat,
                          kind: s.kind, text: s.text, lang: s.lang, translations: s.translations,
                          created_at: 0,
                        } as Message}
                        name={name(s.seat)}
                        viewerLang={viewerLang}
                      />
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
        </>
      )}
      <section className="card match-reveal">
        <h3>{t('profile.gameDetail.title')}</h3>
        {detail.roles.map((r) => (
          <p key={r.seat} className={`reveal-line wrap${r.is_you ? ' is-you' : ''}`}>
            <span>{r.name}:</span> <span className={`role ${r.role}`}>{t(`arena.role.${r.role}`)}</span>
          </p>
        ))}
        {hasWords && <p>{t('arena.match.words', words)}</p>}
        {detail.winner && <p className="winner-banner">{t(`arena.match.winner.${detail.winner}`)}</p>}
      </section>
      {detail.roles.filter((r) => r.is_you).map((r) => (
        <CreditBurst key={r.seat} total={r.credits_earned ?? 0} parts={r.credit_parts} />
      ))}
      <Link to="/me" className="btn center">{t('bots.home')}</Link>
    </main>
  )
}
