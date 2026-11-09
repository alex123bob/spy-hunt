import { useState } from 'react'
import { request } from '../api/client'
import type { Snapshot } from '../api/types'
import { Countdown } from '../components/Countdown'
import { t } from '../i18n'
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
      setErr((e as Error).message || t('error.generic'))
    }
  }

  return (
    <main className="screen">
      <header className="row between">
        <h2>{t('vote.title')}</h2>
        <Countdown deadline={state.phase_deadline} offset={offset} />
      </header>
      <WordCard word={state.me.my_word} />
      {out && <p className="muted">{t('vote.out')}</p>}
      {iAmTied && <p className="muted">{t('vote.waitingTied')}</p>}
      {canVote && (
        <div className="targets">
          {targets.map((p) => (
            <button key={p.seat} type="button" className="btn target wrap" onClick={() => vote(p.seat)}>
              {p.name}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => vote(null)}>{t('vote.abstain')}</button>
        </div>
      )}
      {locked && !out && (
        <p className="ok center" role="status">{t('vote.locked')} · {t('vote.waiting')}</p>
      )}
      {err && <p role="alert" className="error">{err}</p>}
    </main>
  )
}
