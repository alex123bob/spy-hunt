import { useEffect, useState, type CSSProperties } from 'react'
import { request } from '../api/client'
import { errorText } from '../api/errors'
import type { BotCard, Lang, Snapshot } from '../api/types'
import { listMyBots } from '../bots/api'
import { Avatar } from '../components/Avatar'
import { Loader } from '../components/Loader'
import { Toast } from '../components/Toast'
import { LangPicker } from '../components/LangPicker'
import { PlayerChip } from '../components/PlayerChip'
import { QrCode } from '../components/QrCode'
import { setLang, t, useLang } from '../i18n'
import { setSessionLang } from '../state/session'

export function Lobby({ state }: { state: Snapshot }) {
  const lang = useLang()
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [myBots, setMyBots] = useState<BotCard[]>([])
  const [picking, setPicking] = useState(false)
  const code = state.code
  const link = `${window.location.origin}${import.meta.env.BASE_URL}r/${code}`
  const isHost = state.me.is_host
  const bots = state.players.filter((p) => p.is_bot).length
  const short = state.players.length < state.config.min_players
  const full = state.players.length >= state.config.max_players

  useEffect(() => {
    let live = true
    listMyBots().then((b) => { if (live) setMyBots(b) }, () => {})
    return () => { live = false }
  }, [])

  const myIds = new Set(myBots.map((b) => b.id))
  const ownBotIn = state.players.some((p) => p.bot_id && myIds.has(p.bot_id))

  const call = async (method: string, path: string, body?: unknown) => {
    try {
      setErr('')
      await request(method, `/rooms/${code}${path}`, body)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  const pickLang = (l: Lang) => {
    setLang(l)
    setSessionLang(l)
    void call('PATCH', '/me', { lang: l })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
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
      <section>
        <p className="muted">{t('lobby.yourLang')}</p>
        <LangPicker value={lang} onChange={pickLang} label={t('lobby.yourLang')} />
      </section>
      <section className="card">
        <p className="muted">{t('lobby.players')} ({state.players.length}/{state.config.max_players})</p>
        <div className="seats stagger">
          {state.players.map((p, i) => (
            <div key={p.seat} className="row between seat" style={{ '--i': i } as CSSProperties}>
              <div className="grow"><PlayerChip player={p} isMe={p.seat === state.me.seat} /></div>
              {p.is_bot && (isHost || (p.bot_id && myIds.has(p.bot_id))) && (
                <button type="button" className="btn ghost small" onClick={() => call('POST', '/bots', { action: 'remove', seat: p.seat })}>
                  {t('lobby.removeMine')}
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
        {myBots.length > 0 && (
          <>
            <button type="button" className="btn" disabled={full || ownBotIn} onClick={() => setPicking((v) => !v)}>
              {t('lobby.addMyBot')}
            </button>
            {picking && !full && !ownBotIn && (
              <div className="bot-picker">
                {myBots.map((b) => (
                  <button key={b.id} type="button" className="card bot-card" onClick={() => { setPicking(false); void call('POST', '/bots', { action: 'add', bot_id: b.id }) }}>
                    <Avatar player={b} /> <span className="wrap">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {isHost && (
        <section className="card room-controls">
          <p className="muted">{t('lobby.mainLang')}</p>
          <LangPicker label={t('lobby.mainLang')} value={state.main_lang} onChange={(l) => call('PATCH', '/settings', { main_lang: l })} />
          <div className="row bot-btns">
            <button type="button" className="btn" disabled={full} onClick={() => call('POST', '/bots', { action: 'add' })}>
              {t('lobby.addBot')}
            </button>
            <button type="button" className="btn" disabled={bots === 0} onClick={() => call('POST', '/bots', { action: 'remove' })}>
              {t('lobby.removeBot')}
            </button>
          </div>
        </section>
      )}
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
