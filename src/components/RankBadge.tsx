import { rankByIndex, rankTitleKey } from '../game/rank'
import { t } from '../i18n'

export function RankBadge({ rank }: { rank?: number | null }) {
  if (rank == null) return null
  return (
    <span className="rank-badge" role="img" aria-label={t(rankTitleKey(rank))} title={t(rankTitleKey(rank))}>
      {rankByIndex(rank).hero}
    </span>
  )
}
