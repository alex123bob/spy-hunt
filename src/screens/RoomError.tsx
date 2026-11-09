import { Link } from 'react-router-dom'
import { t } from '../i18n'

export type RoomErrorKind = 'notFound' | 'started' | 'full' | 'network' | 'closed'

export function RoomError({ kind, onRetry }: { kind: RoomErrorKind; onRetry?: () => void }) {
  return (
    <main className="screen center" role="alert">
      <h2>{t(`room.${kind}`)}</h2>
      <p className="muted">{t(`room.${kind}Body`)}</p>
      {kind === 'network' && onRetry && (
        <button type="button" className="btn primary" onClick={onRetry}>{t('room.retry')}</button>
      )}
      <Link className="btn" to="/">{t('room.home')}</Link>
    </main>
  )
}
