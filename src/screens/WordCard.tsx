import { useEffect, useRef, useState } from 'react'
import { FlipCard } from '../components/FlipCard'
import { Sparkles } from '../components/Sparkles'
import { t } from '../i18n'

export function WordCard({ word, compact = false }: { word: string | null; compact?: boolean }) {
  const [shown, setShown] = useState(true)
  const [burst, setBurst] = useState(0)
  const was = useRef(shown)
  useEffect(() => {
    if (shown && !was.current) setBurst((b) => b + 1)
    was.current = shown
  }, [shown])
  if (!word) return null
  return (
    <div className="wordcard-wrap">
      <FlipCard
        flipped={shown}
        size={compact ? 'sm' : 'lg'}
        label={shown ? t('word.hide') : t('word.show')}
        onClick={() => setShown((s) => !s)}
        front={
          <>
            <span className="lbl">{t('word.yourWord')}</span>
            <span className="word wrap">{word}</span>
            <span className="hint">👀 {t('word.hide')}</span>
          </>
        }
        back={
          <>
            <div className="seal" aria-hidden="true">🔒</div>
            <h3>{t('word.secret')}</h3>
            <p>{t('word.peek')}</p>
          </>
        }
      />
      <Sparkles burstKey={burst} />
    </div>
  )
}
