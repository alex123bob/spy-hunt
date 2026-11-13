import { shareCardModel, shareDailyResult, shareText } from './share'
import { setLang } from '../i18n'

const base = {
  number: 12, tries: 2, solved: true, elapsedMs: 72000,
  wordCorrect: true as boolean | null, streak: 4, url: 'https://x/daily',
}

beforeEach(() => setLang('en'))
afterEach(() => {
  vi.unstubAllGlobals()
  setLang('en')
})

describe('shareCardModel', () => {
  test('solved result reads as a find, with localized tiles', () => {
    const m = shareCardModel(base)
    expect(m.solved).toBe(true)
    expect(m.verdict).toBe('Spy found!')
    expect(m.tiles.map((t) => t.value)).toEqual(['1:12', '2', '4'])
    expect(m.tiles.map((t) => t.label)).toEqual(['Time', 'Tries', 'Streak'])
  })

  test('first-try find earns the first-try badge', () => {
    expect(shareCardModel({ ...base, tries: 1, wordCorrect: false }).badge).toBe('First try!')
  })

  test('getting the word on a multi-try find earns the word badge', () => {
    expect(shareCardModel(base).badge).toBe('Nailed the word too!')
  })

  test('a first-try find that also got the word says both', () => {
    expect(shareCardModel({ ...base, tries: 1 }).badge).toBe('First try, word too!')
  })

  test('a plain find with the word skipped has no badge', () => {
    expect(shareCardModel({ ...base, wordCorrect: null }).badge).toBeNull()
  })

  test('a miss reads as the spy getting away, no badge', () => {
    const m = shareCardModel({ ...base, solved: false, wordCorrect: null })
    expect(m.verdict).toBe('Spy got away')
    expect(m.badge).toBeNull()
  })

  test('follows the active language', () => {
    setLang('zh-Hans')
    const m = shareCardModel(base)
    expect(m.verdict).toBe('揪出间谍！')
    expect(m.tiles[0].label).toBe('用时')
  })
})

describe('shareText', () => {
  test('a find is a readable, localized sentence with the link', () => {
    expect(shareText(base)).toBe('I found the spy and their word in Spy Hunter #12 🕵️ — 1:12, streak 4 🔥\nhttps://x/daily')
  })

  test('a find without the word does not claim the word', () => {
    expect(shareText({ ...base, wordCorrect: false })).toBe('I found the spy in Spy Hunter #12 🕵️ — 1:12, streak 4 🔥\nhttps://x/daily')
  })

  test('a miss invites a rematch', () => {
    expect(shareText({ ...base, solved: false, streak: 0 })).toBe(
      'The spy got away in Spy Hunter #12 🕵️ — can you do better? Streak 0\nhttps://x/daily',
    )
  })

  test('is localized', () => {
    setLang('zh-Hans')
    expect(shareText(base)).toContain('《谍影追踪》第 12 期')
  })
})

describe('shareResult', () => {
  // jsdom has no real canvas; stub document.createElement to skip the image path
  const noCanvas = () => vi.stubGlobal('document', undefined)

  test('shares the plain text when no image can be produced', async () => {
    noCanvas()
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await shareDailyResult(base)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining('Spy Hunter #12') })
  })

  test('falls back to the clipboard when share is unavailable', async () => {
    noCanvas()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await shareDailyResult(base)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://x/daily'))
  })

  test('reports failure when both share and clipboard throw', async () => {
    noCanvas()
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('x')),
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('y')) },
    })
    expect(await shareDailyResult(base)).toBe('failed')
  })

  test('a cancelled native share does not fall through to the clipboard', async () => {
    noCanvas()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(Object.assign(new DOMException('cancel', 'AbortError'))),
      clipboard: { writeText },
    })
    expect(await shareDailyResult(base)).toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('shareCardModel hero', () => {
  test('rank index picks the hero and localized title', () => {
    const m = shareCardModel({ ...base, rankIndex: 3 })
    expect(m.hero).toBe('🦉')
    expect(m.rankTitle).toBe('Senior Hunter')
  })
  test('defaults to Rookie', () => {
    expect(shareCardModel(base).hero).toBe('🐣')
  })
})
