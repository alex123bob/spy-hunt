import { scoreParts } from './score'

test('first-try find with the word splits into find, speed and word', () => {
  expect(scoreParts({ solved: true, tries: 1, word_correct: true, score: 135 })).toEqual(
    [{ kind: 'find', n: 100 }, { kind: 'speed', n: 15 }, { kind: 'word', n: 20 }])
})

test('second-try find with the word skipped and no speed bonus is just the find', () => {
  expect(scoreParts({ solved: true, tries: 2, word_correct: null, score: 60 })).toEqual([{ kind: 'find', n: 60 }])
})

test('a wrong word adds nothing', () => {
  expect(scoreParts({ solved: true, tries: 2, word_correct: false, score: 80 })).toEqual(
    [{ kind: 'find', n: 60 }, { kind: 'speed', n: 20 }])
})

test('a miss has no parts', () => {
  expect(scoreParts({ solved: false, tries: 2, word_correct: null, score: 0 })).toEqual([])
})
