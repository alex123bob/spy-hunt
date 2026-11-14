import { Link } from 'react-router-dom'
import type { GameDetail } from '../api/types'
import { wordFor } from '../games/words'
import { t, useLang } from '../i18n'

/** A finished game's stored detail: the words, who was what, and what you earned. */
export function GameRecap({ detail, roomId, gameNo }: { detail: GameDetail; roomId: string; gameNo: number }) {
  const viewerLang = useLang()
  const words = {
    civilian: wordFor(detail.words, 'civilian', viewerLang, detail.lang),
    spy: wordFor(detail.words, 'spy', viewerLang, detail.lang),
  }
  const me = detail.roles.find((r) => r.is_you)
  const myParts = me?.credit_parts?.length
    ? me.credit_parts.map((p) => ({ kind: p.kind as string, n: p.n, label: t(`credits.kind.${p.kind}`) }))
    : me && (me.credits_earned ?? 0) > 0
      ? [{ kind: 'played', n: me.credits_earned ?? 0, label: t('credits.title') }]
      : []
  return (
    <div className="game-recap">
      {(words.civilian || words.spy) && (
        <p className="recap-words">
          <span className="muted">{t('profile.game.words')}: </span>
          <span>{t('arena.match.words', words)}</span>
          {me && <span className="tag"> {t('profile.game.yourWord')}: {words[me.role]}</span>}
        </p>
      )}
      <ul className="recap-seats">
        {detail.roles.map((r) => (
          <li key={r.seat} className={`recap-seat wrap${r.is_you ? ' is-you' : ''}`}>
            <span className="recap-name">{r.name}</span>
            <span className={`role ${r.role}`}>{t(`arena.role.${r.role}`)}</span>
            {r.is_you && <span className="tag">{t('profile.game.you')}</span>}
            {r.is_bot && <span className="tag"><span aria-hidden>🤖</span> {t('profile.game.bot')}</span>}
          </li>
        ))}
      </ul>
      {myParts.length > 0 && (
        <ul className="credit-chips recap-credits" aria-label={t('profile.game.credits')}>
          {myParts.map((p, i) => (
            <li key={`${p.kind}-${i}`} className={`credit-chip chip-${p.kind}`}><strong>+{p.n}</strong> {p.label}</li>
          ))}
        </ul>
      )}
      <Link className="recap-link" to={`/games/${roomId}/${gameNo}`}>{t('profile.game.fullRecap')}</Link>
    </div>
  )
}
