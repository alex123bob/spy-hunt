import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CreditSummary, GameSummary } from '../api/types'
import { HeroCard } from '../components/HeroCard'
import { GameRow } from '../components/GameRow'
import { LookEditor } from '../looks/LookEditor'
import { getCredits } from '../credits/api'
import { getMyGames } from '../games/api'
import { RANKS, rankByIndex, rankTitleKey } from '../game/rank'
import { t, useLang } from '../i18n'

export function Profile() {
  useLang()
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  useEffect(() => {
    let live = true
    getCredits().then((s) => { if (live) setSummary(s) }).catch(() => {})
    return () => { live = false }
  }, [])
  const [games, setGames] = useState<GameSummary[] | null>(null)
  useEffect(() => {
    let live = true
    getMyGames().then((g) => { if (live) setGames(g) }).catch(() => {})
    return () => { live = false }
  }, [])
  const current = summary ? summary.rank.index : 0

  return (
    <main className="screen profile">
      <h2 className="center big">{t('credits.title')}</h2>
      <HeroCard summary={summary} />
      <section className="stats-trio">
        {summary && (
          <>
            <div className="tile c-sun"><span>{t('credits.lifetime')}</span> <strong className="big">{summary.credits}</strong></div>
            <div className="tile c-mint"><span>{t('credits.today')}</span> <strong className="big">{summary.today}</strong></div>
          </>
        )}
        <Link to="/credits/how" className="tile c-lilac earn-link" data-testid="how-to-earn">
            <span className="earn-link-icon" aria-hidden="true">i</span>
            <span>{t('credits.howLink')}</span>
        </Link>
      </section>
      {games && games.length > 0 && (
        <section className="recent-games">
          <h3 className="center">{t('profile.recentGames')}</h3>
          <ol className="game-list">
            {games.map((gm) => <GameRow key={`${gm.room_id}-${gm.game_no}`} game={gm} />)}
          </ol>
        </section>
      )}
      <LookEditor name={t('credits.profile')} />
      <h3 className="center">{t('credits.ranksTitle')}</h3>
      <ol className="ladder">
        {RANKS.map((r, i) => (
          <li key={r.key} className={`ladder-row ladder-${i}${i === current ? ' current' : ''}`}
            aria-current={i === current ? 'true' : undefined}>
            <span className="ladder-hero" aria-hidden="true">{rankByIndex(i).hero}</span>
            <span className="ladder-title">{t(rankTitleKey(i))}</span>
            <span className="ladder-min">{r.min}</span>
          </li>
        ))}
      </ol>
      <Link to="/" className="btn center">{t('bots.home')}</Link>
    </main>
  )
}
