import { groupVotes } from './votes'

test('groups by target, most votes first', () => {
  const r = groupVotes([
    { voter: 0, target: 2 }, { voter: 1, target: 3 }, { voter: 2, target: 3 }, { voter: 3, target: 3 },
  ])
  expect(r.groups).toEqual([{ target: 3, voters: [1, 2, 3] }, { target: 2, voters: [0] }])
})

test('ties on count sort by target seat', () => {
  const r = groupVotes([{ voter: 0, target: 3 }, { voter: 1, target: 2 }])
  expect(r.groups.map((g) => g.target)).toEqual([2, 3])
})

test('abstentions are separated and sorted', () => {
  const r = groupVotes([{ voter: 3, target: null }, { voter: 1, target: null }, { voter: 0, target: 2 }])
  expect(r.abstained).toEqual([1, 3])
  expect(r.groups).toEqual([{ target: 2, voters: [0] }])
})

test('no votes gives empty groups', () => {
  expect(groupVotes([])).toEqual({ groups: [], abstained: [] })
})

test('voters are sorted by seat', () => {
  const r = groupVotes([{ voter: 5, target: 1 }, { voter: 2, target: 1 }, { voter: 4, target: 1 }])
  expect(r.groups[0].voters).toEqual([2, 4, 5])
})
