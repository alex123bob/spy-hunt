import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { BotCard } from '../api/types'
import { Avatar } from './Avatar'
import { Sheet } from './Sheet'

/** "+ Bot" pill that opens a sheet: Random bot (host only) and the player's own bots. */
export function AddBotMenu({ isHost, myBots, ownBotIn, onAdd }:
  { isHost: boolean; myBots: BotCard[]; ownBotIn: BotCard | null; onAdd: (botId?: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const noteId = useId()
  const headingId = useId()

  // Sheet restores focus to whatever was active on open; Safari doesn't focus a button on click, so reclaim it.
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  if (!isHost && myBots.length === 0) return null

  // Close first: a failed add reports in the page's alert, which a modal backdrop would hide.
  const pick = (botId?: string) => { setOpen(false); if (botId === undefined) onAdd(); else onAdd(botId) }
  const showNote = myBots.length > 0 && ownBotIn !== null
  const showMine = myBots.length > 0 && ownBotIn === null

  return (
    <>
      <button type="button" ref={trigger} className="pill addbot-pill" aria-label={t('lobby.addBotRow')} aria-haspopup="dialog"
        onClick={() => setOpen(true)}>{t('lobby.addBotPill')}</button>
      {open && (
        <Sheet label={t('lobby.addBotRow')} onClose={() => setOpen(false)}>
          <h3 className="addbot-title">{t('lobby.addBotRow')}</h3>
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
        </Sheet>
      )}
    </>
  )
}
