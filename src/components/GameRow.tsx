import { useEffect, useRef, useState } from 'react'
import type { GameDetail, GameSummary } from '../api/types'
import { getMyGameDetail } from '../games/api'
import { t, useLang } from '../i18n'
import { GameRecap } from './GameRecap'

type Load = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; detail: GameDetail } | { kind: 'error' }

/** One row of Recent games: a summary that opens in place to the stored detail, fetched on first open. */
export function GameRow({ game }: { game: GameSummary }) {
  useLang()
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ kind: 'idle' })
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  const fetchDetail = () => {
    setLoad({ kind: 'loading' })
    getMyGameDetail(game.room_id, game.game_no).then(
      (detail) => { if (live.current) setLoad({ kind: 'ok', detail }) },
      () => { if (live.current) setLoad({ kind: 'error' }) },
    )
  }
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && load.kind === 'idle') fetchDetail()
  }

  const outcome = game.won === null ? 'none' : game.won ? 'won' : 'lost'
  const panelId = `game-${game.room_id}-${game.game_no}`
  return (
    <li className={`game-row${open ? ' open' : ''}`}>
      <button type="button" className="game-row-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className={`game-badge badge-${outcome}`}>{t(`profile.gameOutcome.${outcome}`, { credits: game.credits_earned })}</span>
        <span className="game-meta">
          <span className={`role ${game.your_role}`}>{t(`arena.role.${game.your_role}`)}</span>
          <span className="muted">{t(`profile.game.winner.${game.winner ?? 'none'}`)}</span>
          <span className="muted">{new Date(game.finished_at).toLocaleString()}</span>
        </span>
        <span className="game-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div id={panelId} className="game-row-panel">
          {load.kind === 'loading' && <p className="muted">{t('profile.game.loading')}</p>}
          {load.kind === 'error' && (
            <div className="game-row-error">
              <p role="alert">{t('profile.game.error')}</p>
              <button type="button" className="btn small" onClick={fetchDetail}>{t('room.retry')}</button>
            </div>
          )}
          {load.kind === 'ok' && <GameRecap detail={load.detail} roomId={game.room_id} gameNo={game.game_no} />}
        </div>
      )}
    </li>
  )
}
