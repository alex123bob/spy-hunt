import type { Lang, Message } from '../api/types'
import { t } from '../i18n'

export function StatementBubble({ message, name, viewerLang, mine }: { message: Message; name: string; viewerLang: Lang; mine?: boolean }) {
  if (message.kind === 'skipped') {
    return <div className="bubble skipped muted">{t('table.skipped', { name })}</div>
  }
  const tr = message.lang !== viewerLang ? message.translations?.[viewerLang] : undefined
  return (
    <div className={`bubble ${mine ? 'mine' : ''} ${message.kind === 'host' ? 'host' : ''}`}>
      <div className="who muted wrap">{message.kind === 'host' ? t('table.host') : name}</div>
      <div className="orig wrap" dir="auto">{message.text}</div>
      {tr && <div className="tr wrap muted" dir="auto" data-testid="translation">{tr}</div>}
    </div>
  )
}
