import { useState } from 'react'
import type { DailyPuzzle } from '../api/types'
import { t, useLang } from '../i18n'

export function DailyWord({ puzzle, onPick }: { puzzle: DailyPuzzle; onPick: (option: number | null) => Promise<void> }) {
  const lang = useLang()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const pick = async (option: number | null) => {
    if (busy) return
    setBusy(true)
    setErr(false)
    try {
      await onPick(option)
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <main className="screen daily">
      <h2>{t('daily.wordTitle')}</h2>
      {err && <p role="alert" className="error">{t('error.generic')}</p>}
      <div className="targets">
        {puzzle.options.map((o, i) => (
          <button key={i} type="button" className="btn target" disabled={busy} onClick={() => pick(i)}>
            {o[lang]}
          </button>
        ))}
        <button type="button" className="btn" disabled={busy} onClick={() => pick(null)}>
          {t('daily.skip')}
        </button>
      </div>
    </main>
  )
}
