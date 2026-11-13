import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreditSummary, DailyPuzzle, DailyResult as Result } from '../api/types'
import { Confetti } from '../components/Confetti'
import { CreditBurst } from '../components/CreditBurst'
import { HeroCard } from '../components/HeroCard'
import { getCredits } from '../credits/api'
import { Toast } from '../components/Toast'
import { drawShareCard, shareDailyResult, type ShareInput } from '../daily/share'
import { t, useLang } from '../i18n'
import { recordStreakMilestone } from '../state/nudges'

function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DailyResult({ puzzle, result }: { puzzle: DailyPuzzle; result: Result }) {
  const nav = useNavigate()
  const lang = useLang()
  const [shareState, setShareState] = useState({ text: '', n: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  useEffect(() => {
    let live = true
    getCredits().then((s) => { if (live) setSummary(s) }).catch(() => {})
    return () => { live = false }
  }, [])
  useEffect(() => recordStreakMilestone(result.streak), [])
  const spy = puzzle.players.find((p) => p.seat === result.answer.spy_seat)?.name ?? ''
  const input: ShareInput = {
    number: puzzle.number, tries: result.tries, solved: result.solved, elapsedMs: result.elapsed_ms,
    wordCorrect: result.word_correct, streak: result.streak, rankIndex: summary?.rank.index,
    url: `${window.location.origin}${import.meta.env.BASE_URL}daily`,
  }

  // redraw the preview when the result or language changes
  useEffect(() => {
    if (canvasRef.current) void drawShareCard(canvasRef.current, input)
  }, [lang, result, summary])

  const share = async () => {
    const r = await shareDailyResult(input)
    setShareState((s) => ({ text: r === 'shared' ? t('daily.shared') : r === 'copied' ? t('daily.copied') : t('daily.shareFailed'), n: s.n + 1 }))
  }

  return (
    <main className="screen daily">
      <Confetti run={result.solved} fullscreen />
      <h2 className={`center big daily-banner${result.solved ? '' : ' droop'}`}>{result.solved ? t('daily.found') : t('daily.missed')}</h2>
      <section className="card spy-panel daily-spy">
        <span className="tape" aria-hidden="true" />
        <p className="wrap center">{t('daily.spyWas', { name: spy, word: result.answer.spy_word[lang] })}</p>
      </section>
      <section className="stats-trio">
        <div className="tile c-sun"><span>{t('daily.score')}</span> <strong className="big">{result.score}</strong></div>
        <div className="tile c-sky"><span>{t('daily.time')}</span> <strong className="big">{clock(result.elapsed_ms)}</strong></div>
        <div className="tile c-pink"><span>{t('daily.tries')}</span> <strong className="big">{result.tries}</strong></div>
      </section>
      <p className="muted center">{t('daily.stats', { pct: result.stats.solved_pct, n: result.stats.players })}</p>
      <div className="streak-row"><p>{t('daily.streak', { n: result.streak })}</p></div>
      <HeroCard summary={summary} />
      <CreditBurst total={result.credits_earned ?? 0} parts={result.credit_parts} />
      <canvas ref={canvasRef} className="share-card" data-testid="share-card" role="img" aria-label={t('daily.title')} />
      <button type="button" className="btn primary" onClick={share}>{t('daily.share')}</button>
      <Toast text={shareState.text} nonce={shareState.n} />
      <button type="button" className="btn" onClick={() => nav('/')}>{t('daily.playReal')}</button>
      <button type="button" className="btn" onClick={() => nav('/bots')}>{t('daily.dressUp')}</button>
    </main>
  )
}
