import { Link } from 'react-router-dom'
import { request } from '../api/client'
import { LANGS, type Role, type Snapshot } from '../api/types'
import { t } from '../i18n'

export function Result({ state }: { state: Snapshot }) {
  const isHost = state.me.is_host
  const rematch = () => void request('POST', `/rooms/${state.code}/rematch`).catch(() => {})
  const leave = () => void request('POST', `/rooms/${state.code}/leave`).catch(() => {})
  const roles: Role[] = ['civilian', 'spy']
  return (
    <main className="screen">
      <h2 className="center">{t('result.title')}</h2>
      <p className="center big">{state.winner === 'spies' ? t('result.spies') : t('result.civilians')}</p>
      {state.words && (
        <section className="panel">
          <p className="muted">{t('result.words')}</p>
          {roles.map((r) => (
            <div key={r} className="wrap">
              <strong>{t(`role.${r}`)}</strong>: {LANGS.map((l) => state.words?.[r]?.[l]).filter(Boolean).join(' / ')}
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <p className="muted">{t('result.roles')}</p>
        {state.players.map((p) => (
          <div key={p.seat} className="row between">
            <span className="wrap">{p.name}</span>
            <span className={`role ${p.role ?? ''}`}>{p.role ? t(`role.${p.role}`) : ''}</span>
          </div>
        ))}
      </section>
      {isHost ? (
        <button type="button" className="btn primary" onClick={rematch}>{t('result.rematch')}</button>
      ) : (
        <p className="muted center">{t('result.waitingRematch')}</p>
      )}
      <Link className="btn center" to="/" onClick={leave}>{t('result.home')}</Link>
    </main>
  )
}
