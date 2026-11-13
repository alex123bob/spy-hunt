import { rankByIndex, rankTitleKey } from '../game/rank'
import { t } from '../i18n'
import { TapTip } from './TapTip'

export function RankBadge({ rank }: { rank?: number | null }) {
  if (rank == null || rank <= 0) return null
  return (
    <TapTip label={t(rankTitleKey(rank))} className="rank-badge">
      {rankByIndex(rank).hero}
    </TapTip>
  )
}
