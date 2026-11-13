import type { PlayerClan } from '../api/types'
import { t } from '../i18n'
import { TapTip } from './TapTip'

export function ClanTag({ clan }: { clan?: PlayerClan | null }) {
  if (!clan) return null
  return (
    <TapTip label={t('clan.badgeLabel', { name: clan.name })} className="clan-badge tiny" style={{ background: clan.color }}>
      {clan.emoji}
    </TapTip>
  )
}
