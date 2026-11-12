import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { DailyResult as Result, DailyState } from '../api/types'
import { getDaily, getResult, guessSpy, guessWord } from '../daily/api'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { t } from '../i18n'
import { DailyPlay } from './DailyPlay'
import { DailyResult } from './DailyResult'
import { DailyWord } from './DailyWord'

type Failure = 'no_puzzle' | 'error' | null

export function Daily() {
  const nav = useNavigate()
  const [state, setState] = useState<DailyState | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState<Failure>(null)

  const load = useCallback(() => {
    setFailure(null)
    getDaily()
      .then(setState)
      .catch((e) => setFailure(e instanceof ApiError && e.code === 'no_puzzle' ? 'no_puzzle' : 'error'))
  }, [])
  useEffect(load, [load])

  const stage = state?.me.stage
  const day = state?.puzzle.day
  useEffect(() => {
    if (stage !== 'done' || !day) return
    getResult(day).then(setResult).catch(() => setFailure('error'))
  }, [stage, day])

  if (failure === 'no_puzzle') {
    return (
      <main className="screen">
        <EmptyState emoji="😴" title={t('daily.noPuzzle')}>
          <button type="button" className="btn" onClick={() => nav('/')}>{t('daily.home')}</button>
        </EmptyState>
      </main>
    )
  }
  if (failure === 'error') {
    return (
      <main className="screen">
        <EmptyState emoji="🙈" title={t('error.generic')} role="alert">
          <button type="button" className="btn primary" onClick={load}>{t('daily.retry')}</button>
        </EmptyState>
      </main>
    )
  }
  if (!state) return <main className="screen"><Loader label={t('daily.loading')} /></main>

  if (state.me.stage === 'spy') {
    const onGuess = async (seat: number) => {
      const r = await guessSpy(seat, state.puzzle.day)
      setState((s) =>
        s
          ? { ...s, me: { stage: r.stage, tries: r.tries, tries_left: r.tries_left, wrong: r.correct ? s.me.wrong : [...s.me.wrong, seat] } }
          : s,
      )
      return r
    }
    return <DailyPlay puzzle={state.puzzle} me={state.me} onGuess={onGuess} />
  }
  if (state.me.stage === 'word') {
    const onPick = async (option: number | null) => {
      await guessWord(option, state.puzzle.day)
      setState((s) => (s ? { ...s, me: { ...s.me, stage: 'done' } } : s))
    }
    return <DailyWord puzzle={state.puzzle} onPick={onPick} />
  }
  if (!result) return <main className="screen"><Loader label={t('daily.loading')} /></main>
  return <DailyResult puzzle={state.puzzle} result={result} />
}
