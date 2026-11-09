import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { DailyResult as Result, DailyState } from '../api/types'
import { getDaily, getResult, guessSpy, guessWord } from '../daily/api'
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
  useEffect(() => {
    if (stage !== 'done') return
    getResult().then(setResult).catch(() => setFailure('error'))
  }, [stage])

  if (failure === 'no_puzzle') {
    return (
      <main className="screen">
        <p className="center">{t('daily.noPuzzle')}</p>
        <button type="button" className="btn" onClick={() => nav('/')}>{t('daily.home')}</button>
      </main>
    )
  }
  if (failure === 'error') {
    return (
      <main className="screen">
        <p role="alert" className="error center">{t('error.generic')}</p>
        <button type="button" className="btn primary" onClick={load}>{t('daily.retry')}</button>
      </main>
    )
  }
  if (!state) return <main className="screen"><p className="muted center">{t('daily.loading')}</p></main>

  if (state.me.stage === 'spy') {
    const onGuess = async (seat: number) => {
      const r = await guessSpy(seat)
      setState((s) => (s ? { ...s, me: { stage: r.stage, tries: r.tries, tries_left: r.tries_left } } : s))
      return r
    }
    return <DailyPlay puzzle={state.puzzle} me={state.me} onGuess={onGuess} />
  }
  if (state.me.stage === 'word') {
    const onPick = async (option: number | null) => {
      await guessWord(option)
      setState((s) => (s ? { ...s, me: { ...s.me, stage: 'done' } } : s))
    }
    return <DailyWord puzzle={state.puzzle} onPick={onPick} />
  }
  if (!result) return <main className="screen"><p className="muted center">{t('daily.loading')}</p></main>
  return <DailyResult puzzle={state.puzzle} result={result} />
}
