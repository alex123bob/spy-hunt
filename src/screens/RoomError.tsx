import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { t } from '../i18n'

export type RoomErrorKind = 'notFound' | 'started' | 'full' | 'network' | 'closed'

const EMOJI: Record<RoomErrorKind, string> = { notFound: '🔍', started: '⏳', full: '🪑', network: '📡', closed: '🚪' }

export function RoomError({ kind, onRetry }: { kind: RoomErrorKind; onRetry?: () => void }) {
  return (
    <main className="screen center">
      <EmptyState role="alert" emoji={EMOJI[kind]} title={t(`room.${kind}`)} body={t(`room.${kind}Body`)}>
        {kind === 'network' && onRetry && (
          <button type="button" className="btn primary" onClick={onRetry}>{t('room.retry')}</button>
        )}
        <Link className="btn" to="/">{t('room.home')}</Link>
      </EmptyState>
    </main>
  )
}
