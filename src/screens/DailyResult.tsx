import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailyPuzzle, DailyResult as Result } from '../api/types'
import { shareResult, shareText } from '../daily/share'
import { t, useLang } from '../i18n'

function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DailyResult({ puzzle, result }: { puzzle: DailyPuzzle; result: Result }) {
  const nav = useNavigate()
  const lang = useLang()
  const [shareState, setShareState] = useState('')
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
      <h2>{result.solved ? t('daily.found') : t('daily.missed')}</h2>
      <p className="wrap">{t('daily.spyWas', { name: spy, word: result.answer.spy_word[lang] })}</p>
      <section className="panel stats">
        <div><span className="muted">{t('daily.score')}</span> <strong className="big">{result.score}</strong></div>
        <div><span className="muted">{t('daily.time')}</span> {clock(result.elapsed_ms)}</div>
        <div><span className="muted">{t('daily.tries')}</span> {result.tries}</div>
      </section>
      <p className="muted">{t('daily.stats', { pct: result.stats.solved_pct, n: result.stats.players })}</p>
      <p>{t('daily.streak', { n: result.streak })}</p>
      <pre className="panel share" data-testid="share-preview">{text}</pre>
      <button type="button" className="btn primary" onClick={share}>{t('daily.share')}</button>
      {shareState && <p role="status" className="muted center">{shareState}</p>}
      <button type="button" className="btn" onClick={() => nav('/')}>{t('daily.playReal')}</button>
      <button type="button" className="btn" onClick={() => nav('/bots')}>{t('daily.dressUp')}</button>
    </main>
  )
}
