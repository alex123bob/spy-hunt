import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { BotCard } from '../api/types'
import { getBotCard, listMyBots } from '../bots/api'
import { BotCardView } from '../bots/BotCardView'
import { shareResult } from '../daily/share'
import { t, useLang } from '../i18n'
import { getSession } from '../state/session'

type Load = { kind: 'loading' } | { kind: 'ok'; bot: BotCard } | { kind: 'notFound' } | { kind: 'error' }

export function BotPage() {
  const { id = '' } = useParams()
  useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [mine, setMine] = useState(false)
  const [shareState, setShareState] = useState('')

  useEffect(() => {
    let live = true
    setLoad({ kind: 'loading' })
    setMine(false)
    getBotCard(id).then(
      (bot) => live && setLoad({ kind: 'ok', bot }),
      (e) => live && setLoad({ kind: e instanceof ApiError && e.status === 404 ? 'notFound' : 'error' }),
    )
    if (getSession().playerId) {
      listMyBots().then(
        (bots) => live && setMine(bots.some((b) => b.id === id)),
        () => {},
      )
    }
    return () => {
      live = false
    }
  }, [id])

  const share = async () => {
    const r = await shareResult(window.location.href)
    setShareState(r === 'shared' ? t('result.shared') : r === 'copied' ? t('result.copied') : t('result.shareFailed'))
  }

  if (load.kind === 'loading') return <main className="screen"><p className="muted center">{t('bots.loading')}</p></main>
  if (load.kind !== 'ok') {
    return (
      <main className="screen">
        <h2 className="center">{t(load.kind === 'notFound' ? 'bots.notFound' : 'bots.error')}</h2>
        {load.kind === 'notFound' && <p className="muted center">{t('bots.notFoundBody')}</p>}
        <Link className="btn center" to="/">{t('bots.home')}</Link>
      </main>
    )
  }
  return (
    <main className="screen">
      <BotCardView bot={load.bot} />
      <button type="button" className="btn" onClick={share}>{t('bots.copyLink')}</button>
      {shareState && <p role="status" className="muted center">{shareState}</p>}
      {mine && <Link className="btn" to="/bots">{t('bots.edit')}</Link>}
      <Link className="btn center" to="/top">{t('top.title')}</Link>
      <Link className="btn center" to="/">{t('bots.home')}</Link>
    </main>
  )
}
