import { Link } from 'react-router-dom'
import type { Avatar as AvatarData, BotOutfit, BotRanked, BotRecord } from '../api/types'
import { Avatar } from '../components/Avatar'
import { t } from '../i18n'

export interface BotDraftPreview {
  name: string
  avatar: AvatarData
  outfit: BotOutfit
  record?: BotRecord
  arena_record?: BotRanked
  remix_of?: { id: string; name: string } | null
  remixes?: number
}

const ICON = { voice: '🗣️', style: '🎨', quirk: '✨' } as const

export function BotCardView({ bot, float }: { bot: BotDraftPreview; float?: boolean }) {
  const { record } = bot
  const rules = Array.isArray(bot.outfit.rules) ? bot.outfit.rules : []
  return (
    <section className={`card trading-card${float ? ' float' : ''}`} data-testid="bot-card">
      <div className="tc-band" style={{ background: bot.avatar.color }}>
        <Avatar player={bot} size="l" />
      </div>
      <div className="tc-body">
        <strong className="tc-name wrap">{bot.name}</strong>
        {bot.remix_of && (
          <p className="wrap tc-sub">
            <Link to={`/bot/${encodeURIComponent(bot.remix_of.id)}`}>{t('bots.remixedFrom', { name: bot.remix_of.name })}</Link>
          </p>
        )}
        {(bot.remixes ?? 0) > 0 && <p className="tc-sub">{t('bots.remixes', { n: bot.remixes ?? 0 })}</p>}
        <div className="tc-lines">
          {(['voice', 'style', 'quirk'] as const).map((slot) => (
            <p key={slot} className="wrap tc-line">
              <span aria-hidden>{ICON[slot]}</span>
              <span>{t('bots.line', { label: t(`bots.slot.${slot}`), value: t(`bots.${slot}.${bot.outfit[slot]}`) })}</span>
            </p>
          ))}
        </div>
        {rules.length > 0 && (
          <div>
            <span className="tc-sub">{t('bots.rules')}</span>
            <ul className="tc-rules">
              {rules.map((r, i) => (
                <li key={i} className="wrap tc-rule">
                  {t('bots.rules.line', { when: t(`bots.when.${r.when}`), do: t(`bots.do.${r.do}`) })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(record || (bot.arena_record && bot.arena_record.games > 0)) && (
          <div className="tc-stats">
            {record && (
              <span className="tag stat">
                {t('bots.record', { games: record.games, wins: record.wins })} · {t('bots.fooled', { n: record.spy_wins })}
              </span>
            )}
            {bot.arena_record && bot.arena_record.games > 0 && (
              <span className="tag stat">{t('arena.record', { games: bot.arena_record.games, wins: bot.arena_record.wins })}</span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
