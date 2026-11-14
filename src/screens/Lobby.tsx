import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { request } from '../api/client'
import { errorText } from '../api/errors'
import type { BotCard, Snapshot } from '../api/types'
import { listMyBots } from '../bots/api'
import { AddBotMenu } from '../components/AddBotMenu'
import { LangMenu } from '../components/LangMenu'
import { Loader } from '../components/Loader'
import { Toast, TOAST_MS } from '../components/Toast'
import { PlayerChip } from '../components/PlayerChip'
import { QrCode } from '../components/QrCode'
import { t, useLang } from '../i18n'

export function Lobby({ state }: { state: Snapshot }) {
  const lang = useLang()
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  const [myBots, setMyBots] = useState<BotCard[]>([])
  const code = state.code
  const link = `${window.location.origin}${import.meta.env.BASE_URL}r/${code}`
  const isHost = state.me.is_host
  const short = state.players.length < state.config.min_players
  const full = state.players.length >= state.config.max_players
  const me = state.players.find((p) => p.seat === state.me.seat)
  const myLang = me?.lang

  // The top bar changes the UI language; keep my seat's language (secret word, translations) in step.
  useEffect(() => {
    if (myLang === undefined || lang === myLang) return
    request('PATCH', `/rooms/${code}/me`, { lang }).catch(() => {})
  }, [lang, myLang, code])

  useEffect(() => {
    let live = true
    listMyBots().then((b) => { if (live) setMyBots(b) }, () => {})
    return () => { live = false }
  }, [])

  const myIds = new Set(myBots.map((b) => b.id))
  const seatedMine = state.players.find((p) => p.bot_id && myIds.has(p.bot_id))
  const ownBotIn = (seatedMine && myBots.find((b) => b.id === seatedMine.bot_id)) || null

  const call = async (method: string, path: string, body?: unknown) => {
    try {
      setErr('')
      await request(method, `/rooms/${code}${path}`, body)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), TOAST_MS)
    } catch {
      // clipboard blocked: the link is selectable text
    }
  }

  const empty = Math.max(0, state.config.min_players - state.players.length)
  return (
    <main className={`screen lobby${isHost ? ' has-dock' : ''}`}>
      <header className="ticket lobby-head">
        <div>
          <p className="muted">{t('lobby.title')}</p>
          <p className="lobby-code" aria-label={code}>{code}</p>
        </div>
        <button type="button" className="pill" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
      </header>
      <Toast text={copied ? t('lobby.copied') : ''} />
      <section className="card">
        <div className="cardhead">
          <div className="cardhead-title">
            <p className="muted">{t('lobby.players')} ({state.players.length}/{state.config.max_players})</p>
            {full && <span className="full-badge">{t('lobby.fullBadge')}</span>}
          </div>
          {isHost ? (
            <LangMenu variant="room" prefix={t('lobby.roomPrefix')} label={t('lobby.mainLang')} value={state.main_lang}
              onChange={(l) => call('PATCH', '/settings', { main_lang: l })} />
          ) : (
            <span className="roomlang ro">{t('lobby.roomPrefix')} {t(`lang.${state.main_lang}`)}</span>
          )}
        </div>
        <div className="seats stagger">
          {state.players.map((p, i) => (
            <div key={p.seat} className="row between seat" style={{ '--i': i } as CSSProperties}>
              <div className="grow"><PlayerChip player={p} isMe={p.seat === state.me.seat} /></div>
              {p.is_bot && (isHost || (p.bot_id && myIds.has(p.bot_id))) && (
                <button type="button" className="btn ghost small remove-btn" onClick={() => call('POST', '/bots', { action: 'remove', seat: p.seat })}>
                  <span aria-hidden>✕ </span>{t('lobby.removeMine')}
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: empty }, (_, k) => (
            <div key={`e${k}`} className="seat empty" aria-hidden style={{ '--i': state.players.length + k } as CSSProperties}>
              {t('lobby.emptySeat')}
            </div>
          ))}
        </div>
        {short && (
          <p className="muted">
            {state.config.bot_fill
              ? t('lobby.fillHint', { min: state.config.min_players, n: state.config.min_players - state.players.length })
              : t('lobby.needMore', { min: state.config.min_players })}
          </p>
        )}
        {!full && (
          <AddBotMenu isHost={isHost} myBots={myBots} ownBotIn={ownBotIn}
            onAdd={(botId) => call('POST', '/bots', botId === undefined ? { action: 'add' } : { action: 'add', bot_id: botId })} />
        )}
      </section>
      <section className="card center">
        <p className="muted">{t('lobby.invite')}</p>
        <QrCode text={link} />
        <p data-testid="invite-link" className="wrap link">{link}</p>
      </section>
      {err && <p role="alert" className="error">{err}</p>}
      {isHost ? (
        <div className="start-bar">
          <button type="button" className="btn primary" onClick={() => call('POST', '/start')}>{t('lobby.start')}</button>
        </div>
      ) : (
        <Loader label={t('lobby.waitingHost')} />
      )}
    </main>
  )
}
