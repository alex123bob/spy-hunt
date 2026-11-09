import type { Lang, Role, Snapshot } from '../api/types'
import { t } from '../i18n'

export type Outcome = 'won' | 'lost' | 'ended'

export interface ResultInfo {
  outcome: Outcome
  myRole: Role | null
  myWord: string | null
  spies: { name: string; word: string | null }[]
  rounds: number
}

export function resultInfo(state: Snapshot, lang: Lang): ResultInfo {
  const me = state.players.find((p) => p.seat === state.me.seat)
  const myRole = me?.role ?? null
  const winner = state.winner
  let outcome: Outcome = 'ended'
  if (winner && myRole) {
    const mine = myRole === 'spy' ? 'spies' : 'civilians'
    outcome = winner === mine ? 'won' : 'lost'
  }
  return {
    outcome,
    myRole,
    myWord: myRole ? (state.words?.[myRole]?.[lang] ?? null) : null,
    spies: state.players
      .filter((p) => p.role === 'spy')
      .map((p) => ({ name: p.name, word: state.words?.spy?.[lang] ?? null })),
    rounds: state.round,
  }
}

export function resultShareText(state: Snapshot, info: ResultInfo, url: string): string {
  const head = t(state.winner === 'spies' ? 'result.cardSpies' : 'result.cardCivilians', { n: info.rounds })
  const spies = info.spies.map((s) => (s.word ? `${s.name} (${s.word})` : s.name)).join(', ')
  const role = info.myRole ? t(`role.${info.myRole}`).toLowerCase() : ''
  const mark = info.outcome === 'won' ? '✅' : '❌'
  return `${head}\n${t('result.cardLine', { spies, role, mark })}\n${url}`
}
