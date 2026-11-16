import { Link } from 'react-router-dom'
import type { Player } from '../api/types'
import { Avatar } from './Avatar'
import { ClanTag } from './ClanTag'
import { t } from '../i18n'

export function PlayerChip({ player, isMe, status }: { player: Player; isMe?: boolean; status?: string }) {
  return (
    <div className={`chip-row ${player.alive ? '' : 'out'}`}>
      <Avatar player={player} size="m" out={!player.alive} />
      {player.bot_id ? (
        <Link className="name wrap" to={`/bot/${encodeURIComponent(player.bot_id)}`} target="_blank" rel="noopener">{player.name}</Link>
      ) : (
        <span className="name wrap">{player.name}</span>
      )}
      <ClanTag clan={player.clan} />
      {isMe && <span className="tag">{t('lobby.you')}</span>}
      {player.is_host && <span className="tag">{t('lobby.host')}</span>}
      {player.is_bot && <span className="tag"><span aria-hidden>🤖</span> {t('lobby.bot')}</span>}
      {status && <span className="tag ok">{status}</span>}
    </div>
  )
}
