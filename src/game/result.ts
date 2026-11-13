import type { Lang, Role, Snapshot } from '../api/types'
import { t } from '../i18n'
import type { ShareCardModel } from '../daily/share'
import { rankByIndex, rankTitleKey } from './rank'

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

/** Image share card for a finished room game — same look as the daily card, room content. */
export function roomCardModel(
  state: Snapshot, info: ResultInfo, opts: { url: string; earned: number; rankIndex?: number },
): ShareCardModel {
  const won = info.outcome === 'won'
  const rank = opts.rankIndex ?? 0
  return {
    title: t('app.title'),
    puzzle: t(state.winner === 'spies' ? 'result.sideSpies' : 'result.sideCivilians'),
    solved: won,
    verdict: won ? t('share.roomWon') : t('share.roomLost'),
    mascot: won ? (info.myRole === 'spy' ? '😎' : '🕵️') : '🫥',
    hero: rankByIndex(rank).hero,
    rankTitle: t(rankTitleKey(rank)),
    tiles: [
      { label: t('share.role'), value: info.myRole ? t(`role.${info.myRole}`) : '—', color: '--sky' },
      { label: t('share.rounds'), value: String(info.rounds), color: '--pink' },
      { label: t('share.credits'), value: `+${opts.earned}`, color: '--sun' },
    ],
    badge: null,
    scanHint: t('share.scanToRoom'),
    url: opts.url,
  }
}
