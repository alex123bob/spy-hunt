import type { Lang, Role, WordsByRole } from '../api/types'

/** The word for a role in the viewer's language, falling back to the game's language, then any. */
export function wordFor(words: WordsByRole, role: Role, prefer: Lang, fallback: Lang): string {
  const w = words[role] ?? {}
  return w[prefer] ?? w[fallback] ?? Object.values(w)[0] ?? ''
}
