import { resultInfo, resultShareText, roomCardModel } from './result'
import type { Role, Snapshot } from '../api/types'
import { setLang } from '../i18n'
import { player, snap } from '../test/fixtures'

const WORDS = { civilian: { en: 'piano', 'zh-Hans': '钢琴' }, spy: { en: 'organ', 'zh-Hans': '风琴' } }

// viewer is seat 1; Finn (seat 2) is the spy unless the viewer is
function finished(over: { me?: Role; winner?: Snapshot['winner']; words?: Snapshot['words'] } = {}): Snapshot {
  const me = over.me ?? 'civilian'
  return snap({
    status: 'finished', phase: null, round: 2,
    winner: over.winner === undefined ? 'civilians' : over.winner,
    words: 'words' in over ? over.words : WORDS,
    players: [
      player(0, { name: 'Ann', role: 'civilian' }),
      player(1, { name: 'Bob', role: me }),
      player(2, { name: 'Finn', role: me === 'spy' ? 'civilian' : 'spy' }),
      player(3, { name: 'Cleo', role: 'civilian' }),
    ],
  })
}

beforeEach(() => setLang('en'))

test('civilian viewer, civilians win -> won', () => {
  expect(resultInfo(finished(), 'en').outcome).toBe('won')
})
test('spy viewer, spies win -> won', () => {
  expect(resultInfo(finished({ me: 'spy', winner: 'spies' }), 'en').outcome).toBe('won')
})
test('civilian viewer, spies win -> lost', () => {
  expect(resultInfo(finished({ winner: 'spies' }), 'en').outcome).toBe('lost')
})
test('spy viewer, civilians win -> lost', () => {
  expect(resultInfo(finished({ me: 'spy' }), 'en').outcome).toBe('lost')
})
test('winner null -> ended', () => {
  expect(resultInfo(finished({ winner: null }), 'en').outcome).toBe('ended')
})
test('viewer missing from players -> ended', () => {
  const s = finished()
  s.players = s.players.filter((p) => p.seat !== s.me.seat)
  expect(resultInfo(s, 'en')).toMatchObject({ outcome: 'ended', myRole: null, myWord: null })
})

test('spies lists every spy with the word in the viewer language', () => {
  expect(resultInfo(finished(), 'en').spies).toEqual([{ name: 'Finn', word: 'organ' }])
  expect(resultInfo(finished(), 'zh-Hans').spies).toEqual([{ name: 'Finn', word: '风琴' }])
})
test('two spies are both listed', () => {
  const s = finished()
  s.players[3] = { ...s.players[3], role: 'spy' }
  expect(resultInfo(s, 'en').spies.map((x) => x.name)).toEqual(['Finn', 'Cleo'])
})
test('myWord follows the viewer role and language', () => {
  expect(resultInfo(finished(), 'en')).toMatchObject({ myRole: 'civilian', myWord: 'piano', rounds: 2 })
  expect(resultInfo(finished({ me: 'spy', winner: 'spies' }), 'zh-Hans').myWord).toBe('风琴')
})
test('words missing -> word null', () => {
  const info = resultInfo(finished({ words: undefined }), 'en')
  expect(info.myWord).toBeNull()
  expect(info.spies).toEqual([{ name: 'Finn', word: null }])
})

test('share text for a civilian win viewed by a civilian', () => {
  const s = finished()
  expect(resultShareText(s, resultInfo(s, 'en'), 'https://x/')).toBe(
    'Spy Hunt 🕵️ Civilians won in round 2\nSpy: Finn (organ) · You: civilian ✅\nhttps://x/',
  )
})
test('share text for a lost game uses the cross', () => {
  const s = finished({ winner: 'spies' })
  expect(resultShareText(s, resultInfo(s, 'en'), 'https://x/')).toBe(
    'Spy Hunt 🕵️ Spies won in round 2\nSpy: Finn (organ) · You: civilian ❌\nhttps://x/',
  )
})
test('two spies are joined with ", "', () => {
  const s = finished()
  s.players[3] = { ...s.players[3], role: 'spy' }
  expect(resultShareText(s, resultInfo(s, 'en'), 'u')).toContain('Spy: Finn (organ), Cleo (organ) ·')
})
test('words missing drops the parentheses', () => {
  const s = finished({ words: undefined })
  expect(resultShareText(s, resultInfo(s, 'en'), 'u')).toContain('Spy: Finn · You: civilian ✅')
})
test('Chinese share text uses Chinese copy', () => {
  setLang('zh-Hans')
  const s = finished()
  const text = resultShareText(s, resultInfo(s, 'zh-Hans'), 'u')
  expect(text).toContain('Finn')
  expect(text).toContain('✅')
  expect(text).toContain('风琴')
  expect(text).not.toContain('won')
})

describe('roomCardModel', () => {
  const opts = { url: 'https://x/', earned: 30, rankIndex: 2 }
  test('a win reads as a win with role, rounds and credits tiles', () => {
    const s = finished()
    const m = roomCardModel(s, resultInfo(s, 'en'), opts)
    expect(m.solved).toBe(true)
    expect(m.verdict).toBe('We won!')
    expect(m.puzzle).toBe('Civilians win')
    expect(m.tiles.map((x) => x.value)).toEqual(['Civilian', '2', '+30'])
    expect(m.url).toBe('https://x/')
  })
  test('a loss reads as outplayed', () => {
    const s = finished({ winner: 'spies' })
    const m = roomCardModel(s, resultInfo(s, 'en'), opts)
    expect(m.solved).toBe(false)
    expect(m.verdict).toBe('Got outplayed')
    expect(m.puzzle).toBe('Spies win')
  })
  test('a winning spy gets the cool mascot', () => {
    const s = finished({ me: 'spy', winner: 'spies' })
    expect(roomCardModel(s, resultInfo(s, 'en'), opts).mascot).toBe('😎')
  })
  test('no rank yet falls back to the first rank; Chinese copy follows the language', () => {
    setLang('zh-Hans')
    const s = finished()
    const m = roomCardModel(s, resultInfo(s, 'zh-Hans'), { url: 'u', earned: 0 })
    expect(m.verdict).toBe('赢啦！')
    expect(m.tiles[0].value).toBe('平民')
  })
})
