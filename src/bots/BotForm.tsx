import { useState } from 'react'
import { ApiError } from '../api/client'
import type { BotCard, BotCatalog, BotDraft, BotRule } from '../api/types'
import { t } from '../i18n'
import { createBot, updateBot } from './api'
import { BotCardView } from './BotCardView'

type Slot = 'voice' | 'style' | 'quirk'
const GROUPS: { slot: Slot; key: 'voices' | 'styles' | 'quirks' }[] = [
  { slot: 'voice', key: 'voices' },
  { slot: 'style', key: 'styles' },
  { slot: 'quirk', key: 'quirks' },
]

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="picker">{children}</div>
    </div>
  )
}

export function BotForm({ initial, catalog, onSaved, onCancel }: {
  initial?: BotCard
  catalog: BotCatalog
  onSaved: (bot: BotCard) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<BotDraft>(() => initial
    ? { name: initial.name, avatar: { ...initial.avatar }, outfit: { ...initial.outfit, rules: Array.isArray(initial.outfit.rules) ? initial.outfit.rules.map((r) => ({ ...r })) : [] } }
    : {
        name: '',
        avatar: { emoji: catalog.emojis[0] ?? '', color: catalog.colors[0] ?? '' },
        outfit: { voice: catalog.voices[0] ?? '', style: catalog.styles[0] ?? '', quirk: catalog.quirks[0] ?? '', rules: [] },
      })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const radio = (on: boolean, label: string, pick: () => void, extra: { className?: string; style?: React.CSSProperties; text?: string }) => (
    <button
      key={label} type="button" role="radio" aria-checked={on} aria-label={label}
      className={`btn chip ${on ? 'primary' : ''} ${extra.className ?? ''}`} style={extra.style} onClick={pick}
    >
      {extra.text}
    </button>
  )

  const rules = draft.outfit.rules
  const setRules = (next: BotRule[]) => setDraft({ ...draft, outfit: { ...draft.outfit, rules: next } })
  const setRule = (i: number, patch: Partial<BotRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const used = new Set(rules.map((r) => `${r.when}|${r.do}`))
  const duplicate = used.size < rules.length
  const nextPair = (): BotRule => {
    for (const when of catalog.triggers) for (const d of catalog.actions) if (!used.has(`${when}|${d}`)) return { when, do: d }
    return { when: catalog.triggers[0] ?? '', do: catalog.actions[0] ?? '' }
  }

  const save = async () => {
    const body = { ...draft, name: draft.name.trim() }
    setBusy(true)
    setErr('')
    try {
      onSaved(initial ? await updateBot(initial.id, body) : await createBot(body))
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setErr(code === 'bot_limit' ? t('bots.limit') : code === 'bad_outfit' ? t('bots.rules.invalid') : e instanceof ApiError && e.message && code !== 'network' ? e.message : t('bots.saveError'))
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <label>
        <span className="muted">{t('bots.name')}</span>
        <input value={draft.name} maxLength={16} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <Group label={t('bots.emoji')}>
        {catalog.emojis.map((em) =>
          radio(draft.avatar.emoji === em, em, () => setDraft({ ...draft, avatar: { ...draft.avatar, emoji: em } }), { text: em }))}
      </Group>
      <Group label={t('bots.color')}>
        {catalog.colors.map((c) =>
          radio(draft.avatar.color === c, c, () => setDraft({ ...draft, avatar: { ...draft.avatar, color: c } }),
            { className: 'swatch', style: { background: c } }))}
      </Group>
      {GROUPS.map(({ slot, key }) => (
        <Group key={slot} label={t(`bots.slot.${slot}`)}>
          {catalog[key].map((id) =>
            radio(draft.outfit[slot] === id, t(`bots.${slot}.${id}`), () => setDraft({ ...draft, outfit: { ...draft.outfit, [slot]: id } }),
              { text: t(`bots.${slot}.${id}`) }))}
        </Group>
      ))}
      <div>
        <span className="muted">{t('bots.rules')}</span>
        {rules.map((r, i) => (
          <div key={i} className="rule-row">
            <select aria-label={t('bots.rules.whenN', { n: i + 1 })} value={r.when} onChange={(e) => setRule(i, { when: e.target.value })}>
              {catalog.triggers.map((id) => <option key={id} value={id}>{t(`bots.when.${id}`)}</option>)}
            </select>
            <select aria-label={t('bots.rules.thenN', { n: i + 1 })} value={r.do} onChange={(e) => setRule(i, { do: e.target.value })}>
              {catalog.actions.map((id) => <option key={id} value={id}>{t(`bots.do.${id}`)}</option>)}
            </select>
            <button type="button" className="btn" aria-label={t('bots.rules.removeN', { n: i + 1 })} onClick={() => setRules(rules.filter((_, j) => j !== i))}>{t('bots.rules.remove')}</button>
          </div>
        ))}
        <button
          type="button" className="btn" disabled={rules.length >= catalog.max_rules}
          onClick={() => setRules([...rules, nextPair()])}
        >
          {t('bots.rules.add')}
        </button>
        {duplicate && <p role="alert" className="error">{t('bots.rules.duplicate')}</p>}
        {rules.length >= catalog.max_rules && <p className="muted">{t('bots.rules.limit')}</p>}
      </div>
      <BotCardView bot={{ ...draft, name: draft.name.trim() || ' ' }} />
      {err && <p role="alert" className="error wrap">{err}</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || duplicate || !draft.name.trim()} onClick={save}>{t('bots.save')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('bots.cancel')}</button>
      </div>
    </section>
  )
}
