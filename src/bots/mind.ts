import type { BotOutfit } from '../api/types'

export const MIND_DEFAULTS = { words: 3, form: 'plain', think: 'instinct', suspicion: 3, reaction: 'blend_in' } as const

const dial = (v: unknown, d: number) => (typeof v === 'number' && v >= 1 && v <= 5 ? v : d)
const id = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)

/** Fill the Mouth and Mind fields an older server or saved card may lack. */
export function withMind(o: BotOutfit) {
  return {
    ...o,
    words: dial(o.words, MIND_DEFAULTS.words),
    form: id(o.form, MIND_DEFAULTS.form),
    think: id(o.think, MIND_DEFAULTS.think),
    suspicion: dial(o.suspicion, MIND_DEFAULTS.suspicion),
    reaction: id(o.reaction, MIND_DEFAULTS.reaction),
  }
}
