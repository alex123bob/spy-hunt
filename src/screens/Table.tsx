import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import { errorText } from '../api/errors'
import type { Snapshot } from '../api/types'
import { Avatar } from '../components/Avatar'
import { Countdown } from '../components/Countdown'
import { LangMenu } from '../components/LangMenu'
import { StatementBubble } from '../components/StatementBubble'
import { setLang, t, useLang } from '../i18n'
import { patchMyLang } from '../state/accounts'
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
    void patchMyLang(l)
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
        <span className="pill">{t('table.round', { n: state.round })}</span>
        <LangMenu variant="short" label={t('lang.menuLabel')} value={lang} onChange={pickLang} />
      </header>
      <WordCard word={state.me.my_word} />
      <section className="feed" aria-live="polite">
        {state.messages.map((m) => (
          <StatementBubble
            key={m.id}
            message={m}
            name={nameOf(m.seat)}
            viewerLang={viewerLang}
            mine={m.seat === state.me.seat}
            avatar={m.kind === 'host' || m.kind === 'skipped' ? undefined : state.players.find((p) => p.seat === m.seat)}
          />
        ))}
        <div ref={endRef} />
      </section>
      <section className="turnbar">
        {speaker ? (
          <div className="turn-line">
            <span className={`turn-text wrap${myTurn ? ' my-turn' : ''}`}>
              <Avatar player={speaker} size="s" />
              {myTurn ? t('table.yourTurn') : t('table.speaking', { name: speaker.name })}
              {!myTurn && <span className="typing" aria-hidden="true"><i /><i /><i /></span>}
            </span>
            <Countdown deadline={state.phase_deadline} offset={offset} total={state.config.turn_seconds} />
          </div>
        ) : holdUntil != null ? (
          <div className="turn-line">
            <span className="turn-text">{t('table.votingSoon')}</span>
            <Countdown deadline={holdUntil} vibrate={false} />
          </div>
        ) : null}
        {eliminated && <p className="ghost-note">👻 {t('table.eliminated')}</p>}
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
