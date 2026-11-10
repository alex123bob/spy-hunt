import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TopBot, TopKind } from '../api/types'
import { getTopBots } from '../bots/api'
import { Avatar } from '../components/Avatar'
import { t, useLang } from '../i18n'

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; bots: TopBot[] }

export function Top() {
  useLang()
  const [tab, setTab] = useState<TopKind>('winners')
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  const fetchTop = useCallback(() => {
    let live = true
    setLoad({ kind: 'loading' })
    getTopBots(tab).then(
      (bots) => live && setLoad({ kind: 'ok', bots }),
      () => live && setLoad({ kind: 'error' }),
    )
    return () => { live = false }
  }, [tab])
  useEffect(() => fetchTop(), [fetchTop])

  return (
    <main className="screen">
      <h1>{t('top.title')}</h1>
      <div role="tablist" className="row">
        {(['winners', 'spies'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn${tab === k ? ' primary' : ''}`} onClick={() => setTab(k)}>
            {t(`top.${k}`)}
          </button>
        ))}
      </div>
      <p className="muted">{t('top.hint')}</p>
      {load.kind === 'loading' && <p className="muted">{t('bots.loading')}</p>}
      {load.kind === 'error' && (
        <>
          <p role="alert" className="error">{t('top.error')}</p>
          <button type="button" className="btn" onClick={fetchTop}>{t('room.retry')}</button>
        </>
      )}
      {load.kind === 'ok' && load.bots.length === 0 && <p className="muted">{t('top.empty')}</p>}
      {load.kind === 'ok' && load.bots.map((b) => (
        <div key={b.id} className="row">
          <span>{b.rank}</span>
          <Avatar player={b} />
          <div>
            <strong>{b.name}</strong>
            <div className="muted">{t('top.row', { rate: b.rate, games: b.games, n: b.remixes })}</div>
          </div>
          <Link className="btn" to={`/bot/${b.id}`}>{t('top.open')}</Link>
        </div>
      ))}
      <Link to="/" className="muted center">{t('bots.home')}</Link>
    </main>
  )
}
