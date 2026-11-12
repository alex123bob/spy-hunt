import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Recap } from '../api/types'
import { Avatar } from '../components/Avatar'
import { t } from '../i18n'

function sentence(r: Recap) {
  const parts: string[] = []
  if (r.accused > 0) parts.push(t('arena.recap.accused', { n: r.accused }))
  parts.push(r.out_round != null ? t('arena.recap.out', { n: r.out_round }) : t('arena.recap.survived'))
  parts.push(r.role === 'spy' && r.won ? t('arena.recap.fooled') : r.won ? t('arena.recap.won') : t('arena.recap.lost'))
  const head = t(r.role === 'spy' ? 'arena.recap.spy' : 'arena.recap.civilian', { name: r.bot_name })
  return head + t('arena.sep') + parts.join(t('arena.sep')) + t('arena.end')
}

export function RecapList({ recaps }: { recaps: Recap[] }) {
  if (recaps.length === 0) return null
  return (
    <section className="recaps">
      <h2>{t('arena.title')}</h2>
      <div className="stagger recap-list">
      {recaps.map((r, i) => (
        <div key={`${r.match_id}-${r.bot_id}`} className={r.seen ? 'recap card' : 'recap recap-new card'} style={{ '--i': i } as CSSProperties}>
          {!r.seen && <span className="new-dot" aria-hidden />}
          <Avatar player={{ name: r.bot_name, avatar: r.avatar }} />
          <div>
            <p>{sentence(r)}</p>
            {r.quote && <p className="quote">“{r.quote}”</p>}
            <Link to={`/match/${r.match_id}`}>{t('arena.see')}</Link>
          </div>
        </div>
      ))}
      </div>
    </section>
  )
}
