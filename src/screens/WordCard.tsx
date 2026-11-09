import { useState } from 'react'
import { t } from '../i18n'

export function WordCard({ word }: { word: string | null }) {
  const [shown, setShown] = useState(true)
  if (!word) return null
  return (
    <button type="button" className="wordcard" onClick={() => setShown((s) => !s)} aria-label={shown ? t('word.hide') : t('word.show')}>
      <span className="muted small">{t('word.yourWord')}</span>
      <span className="word wrap">{shown ? word : '••••'}</span>
      <span className="muted small">{shown ? t('word.hide') : t('word.show')}</span>
    </button>
  )
}
