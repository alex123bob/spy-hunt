import { useEffect, useState } from 'react'
import type { Frame, Look, LooksCatalog } from '../api/types'
import { Avatar } from '../components/Avatar'
import { Toast } from '../components/Toast'
import { rankTitleKey } from '../game/rank'
import { t } from '../i18n'
import { getLooks, saveLook } from '../state/looks'
import { colorName, Pick, PickGroup } from './Picker'

/** "Your look" card: emoji × colour × frame, extras locked until the player's rank. */
export function LookEditor({ name }: { name: string }) {
  const [cat, setCat] = useState<LooksCatalog | null>(null)
  const [draft, setDraft] = useState<Look | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState({ text: '', n: 0 })

  useEffect(() => {
    let live = true
    getLooks().then((c) => {
      if (!live) return
      setCat(c)
      setDraft(c.mine ?? { emoji: c.emojis[0].emoji, color: c.colors[0], frame: 'none' })
    }, () => {})
    return () => { live = false }
  }, [])

  if (!cat || !draft) return null
  const hint = (rank: number) => t('looks.locked', { title: t(rankTitleKey(rank)) })
  const same = cat.mine && cat.mine.emoji === draft.emoji && cat.mine.color === draft.color && cat.mine.frame === draft.frame

  const save = async () => {
    setBusy(true)
    try {
      const next = await saveLook(draft)
      setCat(next)
      setNote((s) => ({ text: t('looks.saved'), n: s.n + 1 }))
    } catch {
      setNote((s) => ({ text: t('looks.failed'), n: s.n + 1 }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card look-card" aria-labelledby="look-title">
      <h2 id="look-title">{t('looks.title')}</h2>
      <div className="look-preview" data-testid="look-preview">
        <Avatar player={{ name, avatar: draft }} size="l" />
      </div>
      <PickGroup label={t('looks.emoji')}>
        {cat.emojis.map(({ emoji, rank }) => (
          <Pick key={emoji} on={draft.emoji === emoji} label={emoji} locked={rank > cat.rank} hint={hint(rank)}
            onPick={() => setDraft({ ...draft, emoji })}>{emoji}</Pick>
        ))}
      </PickGroup>
      <PickGroup label={t('looks.color')}>
        {cat.colors.map((c) => (
          <Pick key={c} on={draft.color === c} label={colorName(c)} className="swatch" style={{ background: c }}
            onPick={() => setDraft({ ...draft, color: c })}>{draft.color === c ? '✓' : ''}</Pick>
        ))}
      </PickGroup>
      <PickGroup label={t('looks.frame')}>
        {cat.frames.map(({ key, rank }) => (
          <Pick key={key} on={draft.frame === key} label={t(`looks.frame.${key}`)} locked={rank > cat.rank} hint={hint(rank)}
            onPick={() => setDraft({ ...draft, frame: key as Frame })}>
            <Avatar player={{ name, avatar: { emoji: draft.emoji, color: draft.color, frame: key } }} size="s" />
          </Pick>
        ))}
      </PickGroup>
      <button type="button" className="btn primary" disabled={busy || !!same} onClick={save}>{t('looks.save')}</button>
      <Toast text={note.text} nonce={note.n} />
    </section>
  )
}
