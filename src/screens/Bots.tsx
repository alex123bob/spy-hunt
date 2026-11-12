import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import type { BotCard, BotCatalog, Recap } from '../api/types'
import { deleteBot, getBotCard, getCatalog, getRecaps, listMyBots, markRecapsSeen } from '../bots/api'
import { BotCardView } from '../bots/BotCardView'
import { BotForm } from '../bots/BotForm'
import { RecapList } from '../bots/RecapList'
import { EmptyState } from '../components/EmptyState'
import { Loader } from '../components/Loader'
import { t, useLang } from '../i18n'

const MAX_BOTS = 3

type Remix = { kind: 'none' } | { kind: 'loading' } | { kind: 'denied' } | { kind: 'error' } | { kind: 'ok'; card: BotCard }
type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; bots: BotCard[]; catalog: BotCatalog }

export function Bots() {
  useLang()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [form, setForm] = useState<{ bot?: BotCard } | null>(null)
  const [confirming, setConfirming] = useState('')
  const [err, setErr] = useState('')
  const [params, setParams] = useSearchParams()
  const remixId = params.get('remix') ?? ''
  const [remix, setRemix] = useState<Remix>({ kind: 'none' })
  const [recaps, setRecaps] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; list: Recap[]; unseen: number }>({ kind: 'loading' })
  const count = load.kind === 'ok' ? load.bots.length : -1
  const canRemix = count >= 0 && count < MAX_BOTS

  useEffect(() => {
    if (!remixId || !canRemix) {
      setRemix({ kind: 'none' })
      return
    }
    let live = true
    setRemix({ kind: 'loading' })
    getBotCard(remixId).then(
      (card) => live && setRemix(card.remixable ? { kind: 'ok', card } : { kind: 'denied' }),
      (e) => live && setRemix({ kind: e instanceof ApiError && e.status === 404 ? 'denied' : 'error' }),
    )
    return () => {
      live = false
    }
  }, [remixId, canRemix])

  const endRemix = () => {
    if (remixId) setParams({}, { replace: true })
  }

  const fetchAll = useCallback(() => {
    setLoad({ kind: 'loading' })
    Promise.all([listMyBots(), getCatalog()]).then(
      ([bots, catalog]) => setLoad({ kind: 'ok', bots, catalog }),
      () => setLoad({ kind: 'error' }),
    )
  }, [])
  useEffect(fetchAll, [fetchAll])

  useEffect(() => {
    let live = true
    getRecaps().then(
      (r) => live && setRecaps({ kind: 'ok', list: r.recaps, unseen: r.unseen }),
      () => live && setRecaps({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [])

  const unseen = recaps.kind === 'ok' ? recaps.unseen : 0
  useEffect(() => {
    if (unseen <= 0) return
    let live = true
    Promise.resolve().then(() => {
      if (live) markRecapsSeen().catch(() => {})
    })
    return () => {
      live = false
    }
  }, [unseen])

  const setBots = (f: (b: BotCard[]) => BotCard[]) =>
    setLoad((l) => (l.kind === 'ok' ? { ...l, bots: f(l.bots) } : l))

  const remove = async (id: string) => {
    if (confirming !== id) {
      setConfirming(id)
      return
    }
    setConfirming('')
    setErr('')
    try {
      await deleteBot(id)
      setBots((bs) => bs.filter((b) => b.id !== id))
      setForm((f) => (f?.bot?.id === id ? null : f))
    } catch (e) {
      setErr(errorText(e))
    }
  }

  const saved = (bot: BotCard) => {
    setBots((bs) => (bs.some((b) => b.id === bot.id) ? bs.map((b) => (b.id === bot.id ? bot : b)) : [...bs, bot]))
    setForm(null)
    endRemix()
  }

  return (
    <main className="screen">
      <h1>{t('bots.title')}</h1>
      {recaps.kind === 'ok' && <RecapList recaps={recaps.list} />}
      {recaps.kind === 'error' && <p className="muted">{t('arena.recapsError')}</p>}
      {load.kind === 'loading' && <Loader label={t('bots.loading')} />}
      {load.kind === 'error' && (
        <EmptyState emoji="🤖" title={t('bots.listError')} role="alert">
          <button type="button" className="btn" onClick={fetchAll}>{t('room.retry')}</button>
        </EmptyState>
      )}
      {load.kind === 'ok' && (
        <>
          {load.bots.map((b) => (
            <div key={b.id} className="bot-item">
              <BotCardView bot={b} />
              <div className="row bot-actions">
                <button type="button" className="btn" onClick={() => { setForm({ bot: b }); setConfirming('') }}>{t('bots.edit')}</button>
                <button type="button" className={confirming === b.id ? 'btn primary' : 'btn'} onClick={() => remove(b.id)}>
                  {confirming === b.id ? t('bots.confirmDelete') : t('bots.delete')}
                </button>
              </div>
            </div>
          ))}
          {err && <p role="alert" className="error">{err}</p>}
          <button type="button" className="btn primary" disabled={load.bots.length >= MAX_BOTS} onClick={() => setForm({})}>
            {t('bots.new')}
          </button>
          {load.bots.length >= MAX_BOTS && <p className="muted">{t('bots.limit')}</p>}
          {remixId && remix.kind === 'denied' && <p role="alert" className="error">{t('bots.remixNotAllowed')}</p>}
          {remixId && remix.kind === 'error' && <p role="alert" className="error">{t('bots.error')}</p>}
          {form ? (
            <BotForm key={form.bot?.id ?? 'new'} initial={form.bot} catalog={load.catalog} onSaved={saved} onCancel={() => { setForm(null); endRemix() }} />
          ) : remixId && remix.kind === 'ok' && (
            <BotForm key={`remix-${remix.card.id}`} remix={remix.card} catalog={load.catalog} onSaved={saved} onCancel={endRemix} />
          )}
        </>
      )}
      <Link to="/" className="btn">{t('bots.home')}</Link>
    </main>
  )
}
