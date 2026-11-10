import type { Avatar as AvatarData, BotOutfit, BotRecord } from '../api/types'
import { Avatar } from '../components/Avatar'
import { t } from '../i18n'

export interface BotDraftPreview {
  name: string
  avatar: AvatarData
  outfit: BotOutfit
  record?: BotRecord
}

export function BotCardView({ bot }: { bot: BotDraftPreview }) {
  const { record } = bot
  const rules = Array.isArray(bot.outfit.rules) ? bot.outfit.rules : []
  return (
    <section className="panel bot-card" data-testid="bot-card">
      <div className="row">
        <Avatar player={bot} />
        <strong className="wrap">{bot.name}</strong>
      </div>
      {(['voice', 'style', 'quirk'] as const).map((slot) => (
        <p key={slot} className="wrap">
          {t('bots.line', { label: t(`bots.slot.${slot}`), value: t(`bots.${slot}.${bot.outfit[slot]}`) })}
        </p>
      ))}
      {rules.length > 0 && (
        <div>
          <span className="muted">{t('bots.rules')}</span>
          <ul>
            {rules.map((r, i) => (
              <li key={i} className="wrap">
                {t('bots.rules.line', { when: t(`bots.when.${r.when}`), do: t(`bots.do.${r.do}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {record && (
        <p className="muted">
          {t('bots.record', { games: record.games, wins: record.wins })} · {t('bots.fooled', { n: record.spy_wins })}
        </p>
      )}
    </section>
  )
}
