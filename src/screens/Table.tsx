import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import { errorText } from '../api/errors'
import type { Snapshot } from '../api/types'
import { Avatar } from '../components/Avatar'
import { Countdown } from '../components/Countdown'
import { LangPicker } from '../components/LangPicker'
import { StatementBubble } from '../components/StatementBubble'
import { setLang, t, useLang } from '../i18n'
import { setSessionLang } from '../state/session'
import { WordCard } from './WordCard'

export function Table({ state, offset = 0, holdUntil = null }: { state: Snapshot; offset?: number; holdUntil?: number | null }) {
  const lang = useLang()
  const me = state.players.find((p) => p.seat === state.me.seat)
  const viewerLang = me?.lang ?? lang
  const speaker = state.players.find((p) => p.seat === state.current_speaker)
  const myTurn = state.current_speaker === state.me.seat && !!me?.alive
  const eliminated = !!me && !me.alive
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const nameOf = (seat: number | null) => state.players.find((p) => p.seat === seat)?.name ?? ''

  // The turn bar is sticky over the bottom of the page, so "in view" is not enough: leave room for it,
  // or the newest statement stays hidden behind the bar whenever the page itself is scrolling.
  // The bar's height changes with the turn banner and error line, so follow it as well.
  useEffect(() => {
    const end = endRef.current
    const bar = end?.closest('.table')?.querySelector('.turnbar')
    if (!end || !bar) return
    const settle = () => {
      end.style.scrollMarginBottom = `${bar.getBoundingClientRect().height + 8}px`
      end.scrollIntoView?.({ block: 'end' })
    }
    settle()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(settle)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [state.messages.length])

  const pickLang = (l: typeof lang) => {
    setLang(l)
    setSessionLang(l)
    void request('PATCH', `/rooms/${state.code}/me`, { lang: l }).catch(() => {})
  }

  const send = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true)
    setErr('')
    try {
      await request('POST', `/rooms/${state.code}/statement`, { text: v })
      setText('')
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? t('table.rejected') : errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen table" data-testid="screen-Table">
      <header className="row between">
        <strong>{t('table.round', { n: state.round })}</strong>
        <LangPicker value={lang} onChange={pickLang} label={t('lobby.yourLang')} />
      </header>
      <WordCard word={state.me.my_word} />
      <section className="feed" aria-live="polite">
        {state.messages.map((m) => (
          <StatementBubble key={m.id} message={m} name={nameOf(m.seat)} viewerLang={viewerLang} mine={m.seat === state.me.seat} />
        ))}
        <div ref={endRef} />
      </section>
      <section className="panel turnbar">
        {speaker ? (
          <div className="row between">
            <span className="wrap">{myTurn ? t('table.yourTurn') : <><Avatar player={speaker} /> {t('table.speaking', { name: speaker.name })}</>}</span>
            <Countdown deadline={state.phase_deadline} offset={offset} />
          </div>
        ) : holdUntil != null ? (
          <div className="row between">
            <span>{t('table.votingSoon')}</span>
            <Countdown deadline={holdUntil} vibrate={false} />
          </div>
        ) : null}
        {eliminated && <p className="muted">{t('table.eliminated')}</p>}
        <div className="row">
          <input
            value={text}
            maxLength={state.config.statement_max_chars}
            disabled={!myTurn || busy}
            placeholder={t('table.placeholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            aria-label={t('table.placeholder')}
          />
          <button type="button" className="btn primary narrow" disabled={!myTurn || busy || !text.trim()} onClick={send}>
            {t('table.send')}
          </button>
        </div>
        {err && <p role="alert" className="error">{err}</p>}
      </section>
    </main>
  )
}
