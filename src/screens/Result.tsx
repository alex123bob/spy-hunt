import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../api/client'
import { LANGS, type Role } from '../api/types'
import { Avatar } from '../components/Avatar'
import { ClanTag } from '../components/ClanTag'
import { CreditBurst } from '../components/CreditBurst'
import { HeroCard } from '../components/HeroCard'
import { RankBadge } from '../components/RankBadge'
import { getCredits } from '../credits/api'
import { Confetti } from '../components/Confetti'
import { FlipCard } from '../components/FlipCard'
import { Toast } from '../components/Toast'
import { useStaged } from '../motion/useStaged'
import { drawCard, shareCard } from '../daily/share'
import { resultInfo, resultShareText, roomCardModel } from '../game/result'
import { t, useLang } from '../i18n'
import { recordWin } from '../state/nudges'
import type { CreditSummary, Snapshot } from '../api/types'

export function Result({ state }: { state: Snapshot }) {
  const lang = useLang()
  const [shareState, setShareState] = useState({ text: '', n: 0 })
  const isHost = state.me.is_host
  const rematch = () => void request('POST', `/rooms/${state.code}/rematch`).catch(() => {})
  const leave = () => void request('POST', `/rooms/${state.code}/leave`).catch(() => {})
  const roles: Role[] = ['civilian', 'spy']
  const info = resultInfo(state, lang)
  const step = useStaged([300, 250])
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  useEffect(() => {
    let live = true
    getCredits().then((s) => { if (live) setSummary(s) }).catch(() => {})
    return () => { live = false }
  }, [])
  const earned = state.credits?.[String(state.me.seat)] ?? 0
  useEffect(() => {
    if (info.outcome === 'won') recordWin(`${state.code}:${state.game_no}`)
  }, [])
  const url = `${window.location.origin}${import.meta.env.BASE_URL}`
  const shareable = info.outcome !== 'ended'
  const model = () => roomCardModel(state, info, { url, earned, rankIndex: summary?.rank.index })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // redraw the preview when the language or rank arrives
  useEffect(() => {
    if (shareable && canvasRef.current) void drawCard(canvasRef.current, model())
  }, [lang, summary, shareable])

  const share = async () => {
    if (!shareable) return
    const r = await shareCard({
      model: model(), text: resultShareText(state, info, url), filename: `spy-hunt-${state.code}-${state.game_no}.png`,
    })
    setShareState((s) => ({ text: r === 'shared' ? t('result.shared') : r === 'copied' ? t('result.copied') : t('result.shareFailed'), n: s.n + 1 }))
  }

  return (
    <main className="screen result">
      <h2 className="center">{t('result.title')}</h2>
      <div className="result-hero">
        <Confetti run={info.outcome === 'won'} fullscreen />
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
            <span className="wrap"><Avatar player={p} /> {p.name} <ClanTag clan={p.clan} /><RankBadge rank={p.rank} /></span>
            <span className={`role ${p.role ?? ''}`}>{p.role ? t(`role.${p.role}`) : ''}</span>
          </div>
        ))}
        </div>
      </section>
      <CreditBurst total={earned} parts={state.credit_parts?.[String(state.me.seat)]} />
      <HeroCard summary={summary} />
      <p className="muted center">{t('result.rounds', { n: info.rounds })}</p>
      {shareable && (
        <>
          <canvas ref={canvasRef} className="share-card" data-testid="share-card" role="img" aria-label={t('result.title')} />
          <button type="button" className="btn" onClick={share}>{t('result.share')}</button>
          <Toast text={shareState.text} nonce={shareState.n} />
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
