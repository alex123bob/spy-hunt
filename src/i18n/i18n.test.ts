import en from './en.json'
import zh from './zh-Hans.json'
import { detectLang, setLang, t } from './index'

test('detectLang maps zh* to zh-Hans, else en', () => {
  expect(detectLang('zh-TW')).toBe('zh-Hans')
  expect(detectLang('zh')).toBe('zh-Hans')
  expect(detectLang('fr')).toBe('en')
  expect(detectLang('')).toBe('en')
})

test('every key exists in both dictionaries', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
})

test('t interpolates and switches language', () => {
  setLang('en')
  expect(t('table.round', { n: 2 })).toBe('Round 2')
  setLang('zh-Hans')
  expect(t('table.round', { n: 2 })).toBe('第 2 轮')
  expect(t('no.such.key')).toBe('no.such.key')
  setLang('en')
})

test('every bot option id has a label in both languages', () => {
  const ids = {
    voice: ['cheerful', 'dry', 'chatty', 'terse', 'pirate', 'grandma', 'sleepy_cat', 'robot'],
    style: ['concrete', 'vague', 'metaphor', 'brief', 'memory', 'contrast'],
    quirk: ['question', 'agree', 'number', 'emoji', 'honestly', 'color'],
  }
  for (const [slot, list] of Object.entries(ids)) {
    expect(en).toHaveProperty(['bots.slot.' + slot])
    for (const id of list) {
      expect(en).toHaveProperty([`bots.${slot}.${id}`])
      expect(zh).toHaveProperty([`bots.${slot}.${id}`])
    }
  }
})

test('every rule trigger and action has a label in both languages', () => {
  const whens = ['accused', 'first_to_speak', 'last_to_speak', 'after_elimination', 'late_game']
  const dos = ['counter_accuse', 'copy_previous', 'go_vague', 'vote_accuser', 'vote_leader']
  for (const dict of [en, zh]) {
    for (const id of whens) expect(dict).toHaveProperty([`bots.when.${id}`])
    for (const id of dos) expect(dict).toHaveProperty([`bots.do.${id}`])
  }
})

test('error codes, colour names and lobby hints exist in both languages', () => {
  const keys = [
    ...['bad_name', 'bad_avatar', 'bad_outfit', 'bot_limit', 'not_found', 'bot_in_room', 'room_full', 'not_lobby', 'not_allowed', 'not_host', 'not_member', 'need_players', 'rate_limited', 'unauthorized'].map((c) => `error.code.${c}`),
    ...['ff6b6b', 'ffa94d', '4cd08a', '38c9d6', '5b8cff', 'b07cff'].map((c) => `bots.color.${c}`),
    'lobby.fillHint', 'lobby.needMore',
  ]
  for (const k of keys) {
    expect(en).toHaveProperty([k])
    expect(zh).toHaveProperty([k])
  }
})

test('remix and top copy exists in both languages', () => {
  const keys = ['bots.remixedFrom', 'bots.remixes', 'bots.remix', 'bots.listed', 'bots.remixNotAllowed', 'top.title', 'top.card', 'top.winners', 'top.spies', 'top.hint', 'top.empty', 'top.row', 'top.open', 'top.error']
  for (const k of keys) {
    expect(en).toHaveProperty([k])
    expect(zh).toHaveProperty([k])
  }
})

test('arena copy exists in both languages', () => {
  const expected: Record<string, [string, string]> = {
  "arena.opt": [
    "Let my bot play in the daily arena",
    "让我的机器人参加每日竞技场"
  ],
  "arena.record": [
    "Arena: {games} games · {wins} wins",
    "竞技场：{games} 局 · {wins} 胜"
  ],
  "arena.title": [
    "While you were away",
    "你不在的时候"
  ],
  "arena.new": [
    "{n} new",
    "{n} 条新战报"
  ],
  "arena.see": [
    "See the match",
    "查看对局"
  ],
  "arena.role.spy": [
    "Spy",
    "卧底"
  ],
  "arena.role.civilian": [
    "Civilian",
    "平民"
  ],
  "arena.recap.spy": [
    "{name} was the spy in a 5-bot match",
    "{name} 在一场 5 机器人对局中是卧底"
  ],
  "arena.recap.civilian": [
    "{name} was a civilian in a 5-bot match",
    "{name} 在一场 5 机器人对局中是平民"
  ],
  "arena.recap.accused": [
    "votes against: {n}",
    "被投票指认 {n} 次"
  ],
  "arena.recap.survived": [
    "survived",
    "活到了最后"
  ],
  "arena.recap.out": [
    "voted out in round {n}",
    "第 {n} 轮被投出"
  ],
  "arena.recap.fooled": [
    "fooled the table",
    "骗过了全桌"
  ],
  "arena.recap.won": [
    "won",
    "获胜"
  ],
  "arena.recap.lost": [
    "lost",
    "失败"
  ],
  "arena.sep": [
    ", ",
    "，"
  ],
  "arena.end": [
    ".",
    "。"
  ],
  "arena.match.title": [
    "Arena match",
    "竞技场对局"
  ],
  "arena.match.round": [
    "Round {n}",
    "第 {n} 轮"
  ],
  "arena.match.tiebreak": [
    "Tiebreak",
    "加赛"
  ],
  "arena.match.vote": [
    "{voter} voted for {target}",
    "{voter} 投给了 {target}"
  ],
  "arena.match.abstain": [
    "{voter} did not vote",
    "{voter} 弃票"
  ],
  "arena.match.out": [
    "{name} was voted out.",
    "{name} 被投出。"
  ],
  "arena.match.nobody": [
    "Nobody was voted out.",
    "没有人被投出。"
  ],
  "arena.match.reveal": [
    "Reveal",
    "揭晓"
  ],
  "arena.match.words": [
    "Civilians: {civilian} · Spy: {spy}",
    "平民词：{civilian} · 卧底词：{spy}"
  ],
  "arena.match.winner.spies": [
    "The spies won.",
    "卧底获胜。"
  ],
  "arena.match.winner.civilians": [
    "The civilians won.",
    "平民获胜。"
  ],
  "arena.match.notFound": [
    "Match not found",
    "找不到这场对局"
  ],
  "arena.match.notFoundBody": [
    "It may have been cleared after 14 days.",
    "它可能在 14 天后已被清理。"
  ],
  "arena.match.error": [
    "Could not load this match.",
    "无法加载这场对局。"
  ],
  "arena.recapsError": [
    "Could not load your recaps.",
    "无法加载你的战报。"
  ]
}
  for (const [k, [e, z]] of Object.entries(expected)) {
    expect(en).toHaveProperty([k], e)
    expect(zh).toHaveProperty([k], z)
  }
})
