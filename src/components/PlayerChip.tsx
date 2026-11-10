import type { Player } from '../api/types'
import { Avatar } from './Avatar'
import { t } from '../i18n'

export function PlayerChip({ player, isMe, status }: { player: Player; isMe?: boolean; status?: string }) {
  return (
    <div className={`chip-row ${player.alive ? '' : 'out'}`}>
      <Avatar player={player} />
      {player.bot_id ? (
        <a className="name wrap" href={`/bot/${encodeURIComponent(player.bot_id)}`} target="_blank" rel="noopener">{player.name}</a>
      ) : (
        <span className="name wrap">{player.name}</span>
      )}
      {isMe && <span className="tag">{t('lobby.you')}</span>}
      {player.is_host && <span className="tag">{t('lobby.host')}</span>}
      {player.is_bot && <span className="tag">{t('lobby.bot')}</span>}
      {status && <span className="tag ok">{status}</span>}
    </div>
  )
}
