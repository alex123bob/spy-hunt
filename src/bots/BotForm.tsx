import { useState } from 'react'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import type { BotCard, BotCatalog, BotDraft, BotRule } from '../api/types'
import { t } from '../i18n'
import { createBot, updateBot } from './api'
import { BotCardView } from './BotCardView'
import { WhyButton } from '../components/WhyButton'
import { colorName } from '../looks/Picker'
import { MIND_DEFAULTS, withMind } from './mind'
import { FieldHelp } from './FieldHelp'

type Slot = 'voice' | 'style' | 'quirk'
const GROUPS: { slot: Slot; key: 'voices' | 'styles' | 'quirks' }[] = [
  { slot: 'voice', key: 'voices' },
  { slot: 'style', key: 'styles' },
  { slot: 'quirk', key: 'quirks' },
]


function Label({ text, help }: { text: string; help?: string }) {
  return <span className="field-label">{text}{help && <FieldHelp label={text} text={help} />}</span>
}

function Group({ label, help, desc, children }: { label: string; help?: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label text={label} help={help} />
      <div role="radiogroup" aria-label={label} className="picker">{children}</div>
      {desc && <p className="field-desc" aria-live="polite">{desc}</p>}
    </div>
  )
}

export function BotForm({ initial, remix, catalog, onSaved, onCancel }: {
  initial?: BotCard
  remix?: BotCard
  catalog: BotCatalog
  onSaved: (bot: BotCard) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<BotDraft>(() => {
    const src = initial ?? remix
    if (src) {
      return {
        name: initial ? initial.name : '',
        avatar: { ...src.avatar },
        outfit: { ...withMind(src.outfit), rules: Array.isArray(src.outfit.rules) ? src.outfit.rules.map((r) => ({ ...r })) : [] },
        listed: initial ? initial.listed : true,
        arena: initial ? initial.arena : true,
      }
    }
    return {
      name: '',
      avatar: { emoji: catalog.emojis[0] ?? '', color: catalog.colors[0] ?? '' },
      outfit: { voice: catalog.voices[0] ?? '', style: catalog.styles[0] ?? '', quirk: catalog.quirks[0] ?? '', rules: [], ...MIND_DEFAULTS },
      listed: true,
      arena: true,
    }
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const radio = (on: boolean, label: string, pick: () => void, extra: { className?: string; style?: React.CSSProperties; text?: string }) => (
    <button
      key={label} type="button" role="radio" aria-checked={on} aria-label={label}
      className={`btn chip ${on ? 'primary pick' : ''} ${extra.className ?? ''}`} style={extra.style} onClick={pick}
    >
      {extra.text}
    </button>
  )

  const mind = withMind(draft.outfit)
  const setOutfit = (patch: Partial<BotDraft['outfit']>) => setDraft({ ...draft, outfit: { ...draft.outfit, ...patch } })
  const dial = (key: 'words' | 'suspicion', label: string) => (
    <div className="dial">
      <Label text={label} help={t(`bots.help.${key}`)} />
      <span className="row">
        <input type="range" min={1} max={5} step={1} aria-label={label} value={mind[key]}
          onChange={(e) => setOutfit({ [key]: Number(e.target.value) })} />
        <output>{mind[key]}</output>
      </span>
      <p className="field-desc" aria-live="polite">{t(`bots.${key}.${mind[key]}.desc`)}</p>
    </div>
  )
  const picker = (field: 'form' | 'think' | 'reaction', ids: string[] | undefined) => (
    <Group label={t(`bots.${field}`)} help={t(`bots.help.${field}`)} desc={t(`bots.${field}.${mind[field]}.desc`)}>
      {(ids ?? []).map((id) =>
        radio(mind[field] === id, t(`bots.${field}.${id}`), () => setOutfit({ [field]: id }), { text: t(`bots.${field}.${id}`) }))}
    </Group>
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
      onSaved(initial ? await updateBot(initial.id, body) : await createBot(remix ? { ...body, remix_of: remix.id } : body))
    } catch (e) {
      setErr(e instanceof ApiError ? errorText(e) : t('bots.saveError'))
      setBusy(false)
    }
  }

  return (
    <section className="card bot-form">
      <label className="form-sec">
        <span className="field-label">{t('bots.name')}</span>
        <input value={draft.name} maxLength={16} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <div className="form-sec"><Group label={t('bots.emoji')}>
        {catalog.emojis.map((em) =>
          radio(draft.avatar.emoji === em, em, () => setDraft({ ...draft, avatar: { ...draft.avatar, emoji: em } }), { text: em }))}
      </Group></div>
      <div className="form-sec"><Group label={t('bots.color')}>
        {catalog.colors.map((c) =>
          radio(draft.avatar.color === c, colorName(c), () => setDraft({ ...draft, avatar: { ...draft.avatar, color: c } }),
            { className: 'swatch', style: { background: c }, text: draft.avatar.color === c ? '✓' : '' }))}
      </Group></div>
      <div className="form-sec">{GROUPS.map(({ slot, key }) => (
        <Group key={slot} label={t(`bots.slot.${slot}`)} help={t(`bots.help.${slot}`)} desc={t(`bots.${slot}.${draft.outfit[slot]}.desc`)}>
          {catalog[key].map((id) =>
            radio(draft.outfit[slot] === id, t(`bots.${slot}.${id}`), () => setDraft({ ...draft, outfit: { ...draft.outfit, [slot]: id } }),
              { text: t(`bots.${slot}.${id}`) }))}
        </Group>
      ))}</div>
      <div className="form-sec">
        <h3 className="field-label">{t('bots.group.mouth')}</h3>
        {dial('words', t('bots.words'))}
        {picker('form', catalog.forms)}
      </div>
      <div className="form-sec">
        <h3 className="field-label">{t('bots.group.mind')}</h3>
        {picker('think', catalog.thinks)}
        {dial('suspicion', t('bots.suspicion'))}
        {picker('reaction', catalog.reactions)}
      </div>
      <div className="form-sec">
        <Label text={t('bots.rules')} help={t('bots.help.rules')} />
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
        <WhyButton why={rules.length >= catalog.max_rules && t('bots.rules.limit')} onClick={() => setRules([...rules, nextPair()])}>
          {t('bots.rules.add')}
        </WhyButton>
        {duplicate && <p role="alert" className="error">{t('bots.rules.duplicate')}</p>}
      </div>
      <div className="form-sec"><label className="row toggle">
        <input type="checkbox" checked={draft.listed ?? true} onChange={(e) => setDraft({ ...draft, listed: e.target.checked })} />
        <span>{t('bots.listed')}</span>
      </label>
      <label className="row toggle">
        <input type="checkbox" checked={draft.arena ?? true} onChange={(e) => setDraft({ ...draft, arena: e.target.checked })} />
        <span>{t('arena.opt')}</span>
      </label></div>
      <div className="preview-frame">
        <h3 className="preview-title"><span aria-hidden="true">👀</span> {t('bots.preview')}</h3>
        <BotCardView bot={{ name: draft.name.trim() || ' ', avatar: draft.avatar, outfit: draft.outfit }} />
      </div>
      {err && <p role="alert" className="error wrap">{err}</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || duplicate || !draft.name.trim()} onClick={save}>{t('bots.save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('bots.cancel')}</button>
      </div>
    </section>
  )
}
