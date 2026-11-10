import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorText } from '../api/errors'
import type { BotCard, BotCatalog } from '../api/types'
import { deleteBot, getBotCard, getCatalog, listMyBots } from '../bots/api'
import { BotCardView } from '../bots/BotCardView'
import { BotForm } from '../bots/BotForm'
import { t, useLang } from '../i18n'

const MAX_BOTS = 3

type Remix = { kind: 'none' } | { kind: 'loading' } | { kind: 'denied' } | { kind: 'ok'; card: BotCard }
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
      () => live && setRemix({ kind: 'denied' }),
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
      {load.kind === 'loading' && <p className="muted">{t('bots.loading')}</p>}
      {load.kind === 'error' && (
        <>
          <p role="alert" className="error">{t('bots.listError')}</p>
          <button type="button" className="btn" onClick={fetchAll}>{t('room.retry')}</button>
        </>
      )}
      {load.kind === 'ok' && (
        <>
          {load.bots.map((b) => (
            <div key={b.id} className="bot-item">
              <BotCardView bot={b} />
              <div className="row">
                <button type="button" className="btn" onClick={() => { setForm({ bot: b }); setConfirming('') }}>{t('bots.edit')}</button>
                <button type="button" className="btn" onClick={() => remove(b.id)}>
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
          {form ? (
            <BotForm key={form.bot?.id ?? 'new'} initial={form.bot} catalog={load.catalog} onSaved={saved} onCancel={() => { setForm(null); endRemix() }} />
          ) : remixId && remix.kind === 'ok' && (
            <BotForm key={`remix-${remix.card.id}`} remix={remix.card} catalog={load.catalog} onSaved={saved} onCancel={endRemix} />
          )}
        </>
      )}
      <Link to="/" className="muted center">{t('bots.home')}</Link>
    </main>
  )
}
