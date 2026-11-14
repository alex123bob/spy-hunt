import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { BotCard } from '../api/types'
import { Avatar } from './Avatar'

/** Dashed "Add a bot" row that opens a menu: Random bot (host only) and the player's own bots. */
export function AddBotMenu({ isHost, myBots, ownBotIn, onAdd }:
  { isHost: boolean; myBots: BotCard[]; ownBotIn: BotCard | null; onAdd: (botId?: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const noteId = useId()
  const headingId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const onDown = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (!isHost && myBots.length === 0) return null

  const pick = (botId?: string) => { setOpen(false); if (botId === undefined) onAdd(); else onAdd(botId); trigger.current?.focus() }
  const showNote = myBots.length > 0 && ownBotIn !== null
  const showMine = myBots.length > 0 && ownBotIn === null

  return (
    <div className="addbot" ref={root}>
      <button type="button" className="addbot-row" ref={trigger} aria-haspopup="menu" aria-expanded={open}
        aria-describedby={open && showNote ? noteId : undefined}
        onClick={() => setOpen(o => !o)}><span aria-hidden>+ </span>{t('lobby.addBotRow')}<span aria-hidden> ▾</span></button>
      {open && (
        <div className="addbot-pop">
          {isHost && (
            <div className="addbot-menu" role="menu" aria-label={t('lobby.addBotRow')}>
              <button type="button" role="menuitem" className="addbot-item" onClick={() => pick()}>
                <span aria-hidden>🎲</span> {t('lobby.randomBot')}
              </button>
            </div>
          )}
          {showNote && <p id={noteId} className="addbot-note">{t('lobby.ownBotIn', { name: ownBotIn.name })}</p>}
          {showMine && (
            <>
              <p id={headingId} className="addbot-heading">{t('lobby.myBotsHeading')}</p>
              <div className="addbot-menu" role="menu" aria-labelledby={headingId}>
                {myBots.map(b => (
                  <button key={b.id} type="button" role="menuitem" className="addbot-item" onClick={() => pick(b.id)}>
                    <Avatar player={b} size="s" /> {b.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
