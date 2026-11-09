import { useState } from 'react'
import type { DailyMe, DailyPuzzle, GuessResult } from '../api/types'
import { StatementBubble } from '../components/StatementBubble'
import { t, useLang } from '../i18n'

interface Props {
  puzzle: DailyPuzzle
  me: DailyMe
  onGuess: (seat: number) => Promise<GuessResult>
}

export function DailyPlay({ puzzle, me, onGuess }: Props) {
  const lang = useLang()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const nameOf = (seat: number | null) => puzzle.players.find((p) => p.seat === seat)?.name ?? ''
  const rounds = [...new Set(puzzle.statements.map((m) => m.round))].sort((a, b) => a - b)

  const guess = async (seat: number) => {
    if (busy) return
    setBusy(true)
    setErr(false)
    try {
      await onGuess(seat)
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const wrong = me.wrong
  const last = wrong[wrong.length - 1]
  return (
    <main className="screen daily">
      <header className="row between">
        <h2>{t('daily.number', { n: puzzle.number })}</h2>
        <span className="muted">{t(`daily.difficulty.${puzzle.difficulty}`)}</span>
      </header>
      <div className="wordcard">
        <span className="word wrap">{t('daily.civilianWord', { word: puzzle.civilian_word[lang] })}</span>
      </div>
      <p className="muted">{t('daily.intro')}</p>
      <section className="panel history">
        {rounds.map((r) => (
          <div key={r} className="round">
            <p className="muted small">{t('table.round', { n: r })}</p>
            {puzzle.statements
              .filter((m) => m.round === r)
              .map((m) => (
                <StatementBubble key={m.id} message={m} name={nameOf(m.seat)} viewerLang={lang} />
              ))}
          </div>
        ))}
      </section>
      <div className="row between">
        <span className="muted">{t('daily.triesLeft', { n: me.tries_left })}</span>
        {last !== undefined && <span role="status" className="error wrap">{t('daily.wrong', { name: nameOf(last) })}</span>}
      </div>
      {err && <p role="alert" className="error">{t('error.generic')}</p>}
      <div className="targets">
        {puzzle.players.map((p) => (
          <button key={p.seat} type="button" className="btn target" disabled={busy || wrong.includes(p.seat)} onClick={() => guess(p.seat)}>
            {p.name}
          </button>
        ))}
      </div>
    </main>
  )
}
