import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { BotCard } from '../api/types'
import { getBotCard, listMyBots } from '../bots/api'
import { BotCardView } from '../bots/BotCardView'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { Toast } from '../components/Toast'
import { shareResult } from '../daily/share'
import { t, useLang } from '../i18n'
import { getSession } from '../state/session'

type Load = { kind: 'loading' } | { kind: 'ok'; bot: BotCard } | { kind: 'notFound' } | { kind: 'error' }

export function BotPage() {
  const { id = '' } = useParams()
  useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [mine, setMine] = useState(false)
  const [count, setCount] = useState(0)
  const [known, setKnown] = useState(false)
  const navigate = useNavigate()
  const [shareState, setShareState] = useState({ text: '', n: 0 })

  useEffect(() => {
    let live = true
    setLoad({ kind: 'loading' })
    setMine(false)
    setCount(0)
    setKnown(!getSession().playerId)
    getBotCard(id).then(
      (bot) => live && setLoad({ kind: 'ok', bot }),
      (e) => live && setLoad({ kind: e instanceof ApiError && e.status === 404 ? 'notFound' : 'error' }),
    )
    if (getSession().playerId) {
      listMyBots().then(
        (bots) => {
          if (!live) return
          setMine(bots.some((b) => b.id === id))
          setCount(bots.length)
          setKnown(true)
        },
        () => live && setKnown(true),
      )
    }
    return () => {
      live = false
    }
  }, [id])

  const share = async () => {
    const r = await shareResult(window.location.href)
    setShareState((s) => ({ text: r === 'shared' ? t('result.shared') : r === 'copied' ? t('result.copied') : t('result.shareFailed'), n: s.n + 1 }))
  }

  if (load.kind === 'loading') return <main className="screen"><Loader label={t('bots.loading')} /></main>
  if (load.kind !== 'ok') {
    return (
      <main className="screen">
        <EmptyState emoji="🤖❓" title={t(load.kind === 'notFound' ? 'bots.notFound' : 'bots.error')} body={load.kind === 'notFound' ? t('bots.notFoundBody') : undefined}>
          <Link className="btn" to="/">{t('bots.home')}</Link>
        </EmptyState>
      </main>
    )
  }
  return (
    <main className="screen">
      <BotCardView bot={load.bot} float />
      <button type="button" className="btn" onClick={share}>{t('bots.copyLink')}</button>
      <Toast text={shareState.text} nonce={shareState.n} />
      {known && !mine && load.bot.remixable && (count >= 3
        ? <p className="muted center">{t('bots.limit')}</p>
        : <button type="button" className="btn primary" onClick={() => navigate(`/bots?remix=${load.bot.id}`)}>{t('bots.remix')}</button>)}
      {mine && <Link className="btn" to="/bots">{t('bots.edit')}</Link>}
      <Link className="btn center" to="/top">{t('top.title')}</Link>
      <Link className="btn center" to="/">{t('bots.home')}</Link>
    </main>
  )
}
