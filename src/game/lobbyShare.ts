import type { ShareCardModel } from '../daily/share'
import { t } from '../i18n'

/** Image share card for a room invite — same look as the result card, pre-game content. */
export function lobbyInviteCardModel(
  code: string, playerCount: number, maxPlayers: number, url: string,
): ShareCardModel {
  return {
    title: t('app.title'),
    puzzle: t('lobby.shareRoomLine', { code }),
    solved: true,
    verdict: t('lobby.shareInviteVerdict'),
    mascot: '🕵️',
    hero: '',
    rankTitle: '',
    tiles: [{ label: t('share.players'), value: `${playerCount}/${maxPlayers}`, color: '--sky' }],
    badge: null,
    scanHint: t('lobby.scanToJoin'),
    url,
  }
}
