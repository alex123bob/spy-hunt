import type { Player } from '../api/types'
import { t } from '../i18n'

export function PlayerChip({ player, isMe, status }: { player: Player; isMe?: boolean; status?: string }) {
  return (
    <div className={`chip-row ${player.alive ? '' : 'out'}`}>
      <span className="avatar" aria-hidden>{[...player.name][0] ?? '?'}</span>
      <span className="name wrap">{player.name}</span>
      {isMe && <span className="tag">{t('lobby.you')}</span>}
      {player.is_host && <span className="tag">{t('lobby.host')}</span>}
      {player.is_bot && <span className="tag">{t('lobby.bot')}</span>}
      {status && <span className="tag ok">{status}</span>}
    </div>
  )
}
