import { useState } from 'react'
import { request } from '../api/client'
import { errorText } from '../api/errors'
import type { Snapshot } from '../api/types'
import { Avatar } from '../components/Avatar'
import { Countdown } from '../components/Countdown'
import { t } from '../i18n'
import { StatementHistory } from '../components/StatementHistory'
import { WordCard } from './WordCard'

export function Vote({ state, offset = 0 }: { state: Snapshot; offset?: number }) {
  const me = state.players.find((p) => p.seat === state.me.seat)
  const revote = state.phase === 'revote'
  const tied = state.tied ?? null
  const iAmTied = revote && !!tied && tied.includes(state.me.seat)
  const out = !!me && !me.alive
  const [picked, setPicked] = useState<number | 'abstain' | null>(null)
  const [err, setErr] = useState('')
  const locked = picked !== null || (state.locked ?? []).includes(state.me.seat)

  let targets = state.players.filter((p) => p.alive && p.seat !== state.me.seat)
  if (revote && tied) targets = targets.filter((p) => tied.includes(p.seat))
  const canVote = !out && !iAmTied && !locked

  const vote = async (target: number | null) => {
    setErr('')
    setPicked(target === null ? 'abstain' : target)
    try {
      await request('POST', `/rooms/${state.code}/vote`, { target_seat: target })
    } catch (e) {
      setPicked(null)
      setErr(errorText(e))
    }
  }

  return (
    <main className="screen">
      <header className="row between">
        <h2>{t('vote.title')}</h2>
        <Countdown deadline={state.phase_deadline} offset={offset} total={state.config.vote_seconds} />
      </header>
      <WordCard word={state.me.my_word} compact />
      <StatementHistory state={state} />
      {out && <p className="note">{t('vote.out')}</p>}
      {iAmTied && <p className="note">{t('vote.waitingTied')}</p>}
      {(canVote || (locked && !out)) && (
        <div className={`targets${locked ? ' is-locked' : ''}`}>
          {targets.map((p) => (
            <button
              key={p.seat}
              type="button"
              className={`btn target${picked === p.seat ? ' stamped' : ''}`}
              aria-disabled={!canVote || undefined}
              onClick={() => canVote && vote(p.seat)}
            >
              <Avatar player={p} size="m" />
              <span className="wrap">{p.name}</span>
              {picked === p.seat && <span className="sticker" aria-hidden>✓</span>}
            </button>
          ))}
          {canVote && (
            <button type="button" className="btn ghost abstain" onClick={() => vote(null)}>{t('vote.abstain')}</button>
          )}
        </div>
      )}
      {locked && !out && (
        <p className="note ok center" role="status">{t('vote.locked')} · {t('vote.waiting')}</p>
      )}
      {err && <p role="alert" className="error">{err}</p>}
    </main>
  )
}
