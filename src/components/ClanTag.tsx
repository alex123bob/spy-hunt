import type { PlayerClan } from '../api/types'
import { t } from '../i18n'

export function ClanTag({ clan }: { clan?: PlayerClan | null }) {
  if (!clan) return null
  return (
    <span className="clan-badge tiny" role="img" aria-label={t('clan.badgeLabel', { name: clan.name })}
      title={clan.name} style={{ background: clan.color }}>
      {clan.emoji}
    </span>
  )
}
