import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailyPuzzle, DailyResult as Result } from '../api/types'
import { Confetti } from '../components/Confetti'
import { Toast } from '../components/Toast'
import { shareResult, shareText } from '../daily/share'
import { t, useLang } from '../i18n'
import { recordStreakMilestone } from '../state/nudges'

function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DailyResult({ puzzle, result }: { puzzle: DailyPuzzle; result: Result }) {
  const nav = useNavigate()
  const lang = useLang()
  const [shareState, setShareState] = useState('')
  useEffect(() => recordStreakMilestone(result.streak), [])
  const spy = puzzle.players.find((p) => p.seat === result.answer.spy_seat)?.name ?? ''
  const text = shareText({
    number: puzzle.number, tries: result.tries, solved: result.solved, elapsedMs: result.elapsed_ms,
    wordCorrect: result.word_correct, streak: result.streak, url: `${window.location.origin}/daily`,
  })

  const share = async () => {
    const r = await shareResult(text)
    setShareState(r === 'shared' ? t('daily.shared') : r === 'copied' ? t('daily.copied') : t('daily.shareFailed'))
  }

  return (
    <main className="screen daily">
      <Confetti run={result.solved} fullscreen />
      <h2 className={`center big daily-banner${result.solved ? '' : ' droop'}`}>{result.solved ? t('daily.found') : t('daily.missed')}</h2>
      <section className="card spy-panel">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <p className="wrap center">{t('daily.spyWas', { name: spy, word: result.answer.spy_word[lang] })}</p>
      </section>
      <section className="stats-trio">
        <div className="tile c-sun"><span>{t('daily.score')}</span> <strong className="big">{result.score}</strong></div>
        <div className="tile c-sky"><span>{t('daily.time')}</span> <strong className="big">{clock(result.elapsed_ms)}</strong></div>
        <div className="tile c-pink"><span>{t('daily.tries')}</span> <strong className="big">{result.tries}</strong></div>
      </section>
      <p className="muted center">{t('daily.stats', { pct: result.stats.solved_pct, n: result.stats.players })}</p>
      <div className="streak-row"><span className="flame" aria-hidden>🔥</span><p>{t('daily.streak', { n: result.streak })}</p></div>
      <pre className="ticket share torn" data-testid="share-preview">{text}</pre>
      <button type="button" className="btn primary" onClick={share}>{t('daily.share')}</button>
      <Toast text={shareState} />
      <button type="button" className="btn" onClick={() => nav('/')}>{t('daily.playReal')}</button>
      <button type="button" className="btn" onClick={() => nav('/bots')}>{t('daily.dressUp')}</button>
    </main>
  )
}
