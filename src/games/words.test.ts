import { expect, test } from 'vitest'
import type { WordsByRole } from '../api/types'
import { wordFor } from './words'

const words: WordsByRole = {
  civilian: { en: 'Coffee', 'zh-Hans': '咖啡' },
  spy: { en: 'Tea' },
}

test('wordFor prefers the viewer language', () => {
  expect(wordFor(words, 'civilian', 'zh-Hans', 'en')).toBe('咖啡')
})

test('wordFor falls back to the game language when the viewer language is missing', () => {
  expect(wordFor(words, 'spy', 'zh-Hans', 'en')).toBe('Tea')
})

test('wordFor falls back to any available word', () => {
  const only: WordsByRole = { civilian: { 'zh-Hans': '咖啡' }, spy: {} }
  expect(wordFor(only, 'civilian', 'en', 'en')).toBe('咖啡')
})

test('wordFor returns an empty string for a role with no entry', () => {
  expect(wordFor({} as WordsByRole, 'spy', 'en', 'en')).toBe('')
})
