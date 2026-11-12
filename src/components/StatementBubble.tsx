import type { Avatar as AvatarData, Lang, Message } from '../api/types'
import { Avatar } from './Avatar'
import { t } from '../i18n'

export function StatementBubble({ message, name, viewerLang, mine, avatar }: { message: Message; name: string; viewerLang: Lang; mine?: boolean; avatar?: { name: string; avatar?: AvatarData | null } }) {
  if (message.kind === 'skipped') {
    return <div className="bubble skipped muted">{t('table.skipped', { name })}</div>
  }
  const tr = message.lang !== viewerLang ? message.translations?.[viewerLang] : undefined
  const bubble = (
    <div className={`bubble ${mine ? 'mine' : ''} ${message.kind === 'host' ? 'host' : ''}`}>
      <div className="who muted wrap">{message.kind === 'host' ? t('table.host') : name}</div>
      <div className="orig wrap" dir="auto">{message.text}</div>
      {tr && <div className="tr wrap muted" dir="auto"><span aria-hidden>🌐 </span><span data-testid="translation">{tr}</span></div>}
    </div>
  )
  if (!avatar) return bubble
  return (
    <div className="bubble-row">
      <Avatar player={avatar} size="s" />
      {bubble}
    </div>
  )
}
