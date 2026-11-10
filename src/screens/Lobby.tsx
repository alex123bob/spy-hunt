import { useEffect, useState } from 'react'
import { request } from '../api/client'
import type { BotCard, Lang, Snapshot } from '../api/types'
import { listMyBots } from '../bots/api'
import { Avatar } from '../components/Avatar'
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
  const link = `${window.location.origin}/r/${code}`
  const isHost = state.me.is_host
  const bots = state.players.filter((p) => p.is_bot).length
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
      setErr((e as Error).message || t('error.generic'))
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

  return (
    <main className="screen">
      <h2>{t('lobby.title')} · {code}</h2>
      <section>
        <p className="muted">{t('lobby.yourLang')}</p>
        <LangPicker value={lang} onChange={pickLang} label={t('lobby.yourLang')} />
      </section>
      <section className="panel">
        <p className="muted">{t('lobby.players')} ({state.players.length}/{state.config.max_players})</p>
        {state.players.map((p) => (
          <div key={p.seat} className="row between">
            <PlayerChip player={p} isMe={p.seat === state.me.seat} />
            {p.is_bot && (isHost || (p.bot_id && myIds.has(p.bot_id))) && (
              <button type="button" className="btn" onClick={() => call('POST', '/bots', { action: 'remove', seat: p.seat })}>
                {t('lobby.removeMine')}
              </button>
            )}
          </div>
        ))}
        {myBots.length > 0 && (
          <>
            <button type="button" className="btn" disabled={full || ownBotIn} onClick={() => setPicking((v) => !v)}>
              {t('lobby.addMyBot')}
            </button>
            {picking && !full && !ownBotIn && myBots.map((b) => (
              <button key={b.id} type="button" className="btn" onClick={() => { setPicking(false); void call('POST', '/bots', { action: 'add', bot_id: b.id }) }}>
                <Avatar player={b} /> {b.name}
              </button>
            ))}
          </>
        )}
      </section>
      <section className="panel center">
        <p className="muted">{t('lobby.invite')}</p>
        <QrCode text={link} />
        <p data-testid="invite-link" className="wrap link">{link}</p>
        <button type="button" className="btn" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
      </section>
      {isHost ? (
        <section className="panel">
          <p className="muted">{t('lobby.mainLang')}</p>
          <LangPicker label={t('lobby.mainLang')} value={state.main_lang} onChange={(l) => call('PATCH', '/settings', { main_lang: l })} />
          <div className="row">
            <button type="button" className="btn" disabled={full} onClick={() => call('POST', '/bots', { action: 'add' })}>
              {t('lobby.addBot')}
            </button>
            <button type="button" className="btn" disabled={bots === 0} onClick={() => call('POST', '/bots', { action: 'remove' })}>
              {t('lobby.removeBot')}
            </button>
          </div>
          <button type="button" className="btn primary" onClick={() => call('POST', '/start')}>{t('lobby.start')}</button>
        </section>
      ) : (
        <p className="muted center">{t('lobby.waitingHost')}</p>
      )}
      {err && <p role="alert" className="error">{err}</p>}
    </main>
  )
}
