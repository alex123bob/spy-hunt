import { useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../api/client'
import { LANGS, type Role } from '../api/types'
import { Avatar } from '../components/Avatar'
import { shareResult } from '../daily/share'
import { resultInfo, resultShareText } from '../game/result'
import { t, useLang } from '../i18n'
import type { Snapshot } from '../api/types'

export function Result({ state }: { state: Snapshot }) {
  const lang = useLang()
  const [shareState, setShareState] = useState('')
  const isHost = state.me.is_host
  const rematch = () => void request('POST', `/rooms/${state.code}/rematch`).catch(() => {})
  const leave = () => void request('POST', `/rooms/${state.code}/leave`).catch(() => {})
  const roles: Role[] = ['civilian', 'spy']
  const info = resultInfo(state, lang)
  const card = info.outcome === 'ended' ? null : resultShareText(state, info, `${window.location.origin}/`)

  const share = async () => {
    if (!card) return
    const r = await shareResult(card)
    setShareState(r === 'shared' ? t('result.shared') : r === 'copied' ? t('result.copied') : t('result.shareFailed'))
  }

  return (
    <main className="screen">
      <h2 className="center">{t('result.title')}</h2>
      <p className="center big">{t(`result.${info.outcome}`)}</p>
      {info.myRole && (
        <div className="center">
          <p>{t('result.yourRole', { role: t(`role.${info.myRole}`) })}</p>
          {info.myWord && <p className="muted">{t('result.yourWord', { word: info.myWord })}</p>}
        </div>
      )}
      {info.spies.length > 0 && (
        <section className="panel spy-panel" data-testid="spy-panel">
          <p className="muted">{t(info.spies.length > 1 ? 'result.theSpies' : 'result.theSpy')}</p>
          {info.spies.map((s) => (
            <div key={s.name} className="row between">
              <strong className="wrap">{s.name}</strong>
              {s.word && <span className="wrap">{s.word}</span>}
            </div>
          ))}
        </section>
      )}
      {state.words && (
        <section className="panel" data-testid="words-panel">
          <p className="muted">{t('result.words')}</p>
          {roles.map((r) => (
            <div key={r} className="wrap">
              <strong>{t(`role.${r}`)}</strong>: {LANGS.map((l) => state.words?.[r]?.[l]).filter(Boolean).join(' / ')}
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <p className="muted">{t('result.everyone')}</p>
        {state.players.map((p) => (
          <div key={p.seat} className="row between">
            <span className="wrap"><Avatar player={p} /> {p.name}</span>
            <span className={`role ${p.role ?? ''}`}>{p.role ? t(`role.${p.role}`) : ''}</span>
          </div>
        ))}
      </section>
      <p className="muted center">{t('result.rounds', { n: info.rounds })}</p>
      {card && (
        <>
          <pre className="panel share" data-testid="share-preview">{card}</pre>
          <button type="button" className="btn" onClick={share}>{t('result.share')}</button>
          {shareState && <p role="status" className="muted center">{shareState}</p>}
        </>
      )}
      {isHost ? (
        <button type="button" className="btn primary" onClick={rematch}>{t('result.rematch')}</button>
      ) : (
        <p className="muted center">{t('result.waitingRematch')}</p>
      )}
      <Link className="btn center" to="/" onClick={leave}>{t('result.home')}</Link>
    </main>
  )
}
