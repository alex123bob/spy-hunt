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
