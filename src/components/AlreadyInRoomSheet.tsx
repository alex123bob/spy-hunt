import { Sheet } from './Sheet'
import { t, useLang } from '../i18n'

// Shown when create/join is refused because the player already holds a seat in another
// active room. Return goes back to that room; Leave-and-continue leaves it, then retries.
export function AlreadyInRoomSheet({
  code,
  status,
  onReturn,
  onLeaveAndContinue,
  onClose,
}: {
  code: string
  status: 'lobby' | 'playing'
  onReturn: () => void
  onLeaveAndContinue: () => void
  onClose: () => void
}) {
  useLang()
  return (
    <Sheet label={t('room.blocked.title')} onClose={onClose}>
      <h2>{t('room.blocked.title')}</h2>
      <p>{t('room.blocked.body', { code })}</p>
      {status === 'playing' && <p className="muted">{t('room.blocked.playingWarn')}</p>}
      <button type="button" className="btn primary" onClick={onReturn}>{t('room.return')}</button>
      <button type="button" className="btn secondary" onClick={onLeaveAndContinue}>{t('room.blocked.leave')}</button>
    </Sheet>
  )
}
