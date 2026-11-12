import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../api/client'
import { LANGS, type Role } from '../api/types'
import { Avatar } from '../components/Avatar'
import { ClanTag } from '../components/ClanTag'
import { Confetti } from '../components/Confetti'
import { FlipCard } from '../components/FlipCard'
import { Toast } from '../components/Toast'
import { useStaged } from '../motion/useStaged'
import { shareResult } from '../daily/share'
import { resultInfo, resultShareText } from '../game/result'
import { t, useLang } from '../i18n'
import { recordWin } from '../state/nudges'
import type { Snapshot } from '../api/types'

export function Result({ state }: { state: Snapshot }) {
  const lang = useLang()
  const [shareState, setShareState] = useState('')
  const isHost = state.me.is_host
  const rematch = () => void request('POST', `/rooms/${state.code}/rematch`).catch(() => {})
  const leave = () => void request('POST', `/rooms/${state.code}/leave`).catch(() => {})
  const roles: Role[] = ['civilian', 'spy']
  const info = resultInfo(state, lang)
  const step = useStaged([300, 250])
  useEffect(() => {
    if (info.outcome === 'won') recordWin(`${state.code}:${state.game_no}`)
  }, [])
  const card = info.outcome === 'ended' ? null : resultShareText(state, info, `${window.location.origin}/`)

  const share = async () => {
    if (!card) return
    const r = await shareResult(card)
    setShareState(r === 'shared' ? t('result.shared') : r === 'copied' ? t('result.copied') : t('result.shareFailed'))
  }

  return (
    <main className="screen result">
      <h2 className="center">{t('result.title')}</h2>
      <div className="result-hero">
        <Confetti run={info.outcome === 'won'} />
        <p className={`center big result-banner${info.outcome === 'lost' ? ' droop' : ''}`}>{t(`result.${info.outcome}`)}</p>
        {state.winner && (
          <p className="center muted result-side">{t(state.winner === 'spies' ? 'result.sideSpies' : 'result.sideCivilians')}</p>
        )}
      </div>
      {info.myRole && (
        <div className="center">
          <p>{t('result.yourRole', { role: t(`role.${info.myRole}`) })}</p>
          {info.myWord && <p className="muted">{t('result.yourWord', { word: info.myWord })}</p>}
        </div>
      )}
      {info.spies.length > 0 && (
        <section className="card spy-panel" data-testid="spy-panel">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <p className="spy-title">{t(info.spies.length > 1 ? 'result.theSpies' : 'result.theSpy')}</p>
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
          <div className="word-cards">
            {roles.map((r, n) => (
              <FlipCard
                key={r}
                size="sm"
                flipped={step > n}
                label={t(`role.${r}`)}
                back={<span className="word-q">?</span>}
                front={
                  <div className="wrap">
                    <strong>{t(`role.${r}`)}</strong><span className="colon">: </span>{LANGS.map((l) => state.words?.[r]?.[l]).filter(Boolean).join(' / ')}
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <p className="muted">{t('result.everyone')}</p>
        <div className="stagger everyone">
        {state.players.map((p, i) => (
          <div key={p.seat} className="row between" style={{ '--i': i } as React.CSSProperties}>
            <span className="wrap"><Avatar player={p} /> {p.name} <ClanTag clan={p.clan} /></span>
            <span className={`role ${p.role ?? ''}`}>{p.role ? t(`role.${p.role}`) : ''}</span>
          </div>
        ))}
        </div>
      </section>
      <p className="muted center">{t('result.rounds', { n: info.rounds })}</p>
      {card && (
        <>
          <pre className="ticket share torn" data-testid="share-preview">{card}</pre>
          <button type="button" className="btn" onClick={share}>{t('result.share')}</button>
          <Toast text={shareState} />
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
