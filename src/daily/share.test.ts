import { shareResult, shareText } from './share'

const base = { number: 12, tries: 2, solved: true, elapsedMs: 72000, wordCorrect: true as boolean | null, streak: 4, url: 'https://x/daily' }

test('solved on try two with the word right', () => {
  expect(shareText(base)).toBe('Spy Hunter #12 🕵️\n🟥🟩 ⏱ 1:12 ✅ word\nStreak 4 🔥 https://x/daily')
})

test('solved on try one has no red square', () => {
  expect(shareText({ ...base, tries: 1 })).toContain('\n🟩 ⏱ 1:12')
})

test('unsolved shows a red square per tap and no green', () => {
  const t = shareText({ ...base, solved: false, wordCorrect: null, streak: 0 })
  expect(t).toBe('Spy Hunter #12 🕵️\n🟥🟥 ⏱ 1:12\nStreak 0 https://x/daily')
})

test('skipped word has no suffix, wrong word shows a cross', () => {
  expect(shareText({ ...base, wordCorrect: null })).not.toMatch(/word/)
  expect(shareText({ ...base, wordCorrect: false })).toContain(' ❌ word')
})

test('only the exact line formats appear: no words, names or seats', () => {
  const re = /^Spy Hunter #\d+ 🕵️\n🟥*🟩? ⏱ \d+:\d\d( ✅ word| ❌ word)?\nStreak \d+( 🔥)? \S+$/u
  for (const o of [base, { ...base, tries: 1, wordCorrect: false }, { ...base, solved: false, wordCorrect: null, streak: 0 }]) {
    expect(shareText(o)).toMatch(re)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('shareResult uses navigator.share when present', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { share })
  expect(await shareResult('hi')).toBe('shared')
  expect(share).toHaveBeenCalledWith({ text: 'hi' })
})

test('shareResult falls back to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  expect(await shareResult('hi')).toBe('copied')
  expect(writeText).toHaveBeenCalledWith('hi')
})

test('shareResult reports failure when both throw', async () => {
  vi.stubGlobal('navigator', {
    share: vi.fn().mockRejectedValue(new Error('x')),
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('y')) },
  })
  expect(await shareResult('hi')).toBe('failed')
})
