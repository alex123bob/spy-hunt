import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TopBot, TopKind } from '../api/types'
import { getTopBots } from '../bots/api'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { t, useLang } from '../i18n'

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; bots: TopBot[] }

export function Top() {
  useLang()
  const [tab, setTab] = useState<TopKind>('winners')
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  const latest = useRef(0)

  const fetchTop = useCallback(() => {
    const mine = ++latest.current
    setLoad({ kind: 'loading' })
    getTopBots(tab).then(
      (bots) => latest.current === mine && setLoad({ kind: 'ok', bots }),
      () => latest.current === mine && setLoad({ kind: 'error' }),
    )
  }, [tab])
  useEffect(() => {
    fetchTop()
    return () => { latest.current++ }
  }, [fetchTop])

  return (
    <main className="screen top">
      <h1>{t('top.title')}</h1>
      <div role="tablist" className="segmented">
        {(['winners', 'spies'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`top.${k}`)}
          </button>
        ))}
      </div>
      <p className="muted">{t('top.hint')}</p>
      {load.kind === 'loading' && <Loader label={t('bots.loading')} />}
      {load.kind === 'error' && (
        <EmptyState emoji="😵" title={t('top.error')} role="alert">
          <button type="button" className="btn" onClick={fetchTop}>{t('room.retry')}</button>
        </EmptyState>
      )}
      {load.kind === 'ok' && load.bots.length === 0 && <EmptyState emoji="🏆" title={t('top.emptyTitle')} body={t('top.empty')} />}
      {load.kind === 'ok' && load.bots.length > 0 && (
        <div className="card top-list stagger">
          {load.bots.map((b, i) => (
            <div key={b.id} className="top-row" style={{ '--i': i } as CSSProperties}>
              <span className={`medal${b.rank <= 3 ? ` m${b.rank}` : ''}`}>{b.rank}</span>
              <Avatar player={b} />
              <strong className="grow wrap">{b.name}</strong>
              <Link className="btn small" to={`/bot/${b.id}`}>{t('top.open')}</Link>
              <div className="stats muted wrap">{t('top.row', { rate: b.rate, games: b.games, n: b.remixes })}</div>
            </div>
          ))}
        </div>
      )}
      <Link to="/" className="btn center">{t('bots.home')}</Link>
    </main>
  )
}
