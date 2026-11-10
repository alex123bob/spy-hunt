import { useState } from 'react'
import { ApiError } from '../api/client'
import type { BotCard, BotCatalog, BotDraft } from '../api/types'
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
    ? { name: initial.name, avatar: { ...initial.avatar }, outfit: { ...initial.outfit } }
    : {
        name: '',
        avatar: { emoji: catalog.emojis[0] ?? '', color: catalog.colors[0] ?? '' },
        outfit: { voice: catalog.voices[0] ?? '', style: catalog.styles[0] ?? '', quirk: catalog.quirks[0] ?? '' },
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

  const save = async () => {
    const body = { ...draft, name: draft.name.trim() }
    setBusy(true)
    setErr('')
    try {
      onSaved(initial ? await updateBot(initial.id, body) : await createBot(body))
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setErr(code === 'bot_limit' ? t('bots.limit') : e instanceof ApiError && e.message && code !== 'network' ? e.message : t('bots.saveError'))
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
      <BotCardView bot={{ ...draft, name: draft.name.trim() || ' ' }} />
      {err && <p role="alert" className="error wrap">{err}</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || !draft.name.trim()} onClick={save}>{t('bots.save')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('bots.cancel')}</button>
      </div>
    </section>
  )
}
