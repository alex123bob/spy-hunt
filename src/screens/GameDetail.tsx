import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { GameDetail as Detail, Role, WordsByRole } from '../api/types'
import { CreditBurst } from '../components/CreditBurst'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { getMyGameDetail } from '../games/api'
import { t, useLang } from '../i18n'

type Load = { kind: 'loading' } | { kind: 'ok'; detail: Detail } | { kind: 'notFound' } | { kind: 'error' }

function wordFor(words: WordsByRole, role: Role, prefer: Detail['lang'], fallback: Detail['lang']): string {
  const w = words[role] ?? {}
  return w[prefer] ?? w[fallback] ?? Object.values(w)[0] ?? ''
}

export function GameDetail() {
  const { roomId = '', gameNo = '' } = useParams()
  const viewerLang = useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
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
  return (
    <main className="screen match">
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
