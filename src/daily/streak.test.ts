import { currentStreak, loadStreak, playedToday, previousDay, recordResult, resetStreakForTests } from './streak'

beforeEach(() => {
  localStorage.clear()
  resetStreakForTests()
})

test('first solve starts the streak at 1', () => {
  expect(recordResult('2026-11-10', true, 120)).toMatchObject({ streak: 1, best: 1, lastSolvedDay: '2026-11-10' })
})

test('consecutive days increment', () => {
  recordResult('2026-11-10', true, 100)
  recordResult('2026-11-11', true, 100)
  expect(recordResult('2026-11-12', true, 100)).toMatchObject({ streak: 3, best: 3 })
})

test('a missed day resets to 1 on the next solve', () => {
  recordResult('2026-11-10', true, 100)
  recordResult('2026-11-11', true, 100)
  expect(recordResult('2026-11-13', true, 100)).toMatchObject({ streak: 1, best: 2 })
})

test('an unsolved day resets to 0 and keeps best', () => {
  recordResult('2026-11-10', true, 100)
  recordResult('2026-11-11', true, 100)
  expect(recordResult('2026-11-12', false, 0)).toMatchObject({ streak: 0, best: 2 })
  expect(recordResult('2026-11-13', true, 100)).toMatchObject({ streak: 1 })
})

test('recording the same day twice does not double count', () => {
  recordResult('2026-11-10', true, 100)
  recordResult('2026-11-11', true, 100)
  expect(recordResult('2026-11-11', true, 100)).toMatchObject({ streak: 2 })
  expect(recordResult('2026-11-11', false, 0)).toMatchObject({ streak: 2 })
})

test('previousDay handles month and year boundaries', () => {
  expect(previousDay('2027-01-01')).toBe('2026-12-31')
  expect(previousDay('2026-03-01')).toBe('2026-02-28')
  expect(previousDay('2028-03-01')).toBe('2028-02-29')
})

test('corrupt storage falls back to an empty state', () => {
  localStorage.setItem('spy-hunt.daily', '{nope')
  expect(loadStreak()).toMatchObject({ streak: 0, best: 0, lastDay: null, history: {} })
  localStorage.setItem('spy-hunt.daily', JSON.stringify({ streak: 'x' }))
  expect(loadStreak().streak).toBe(0)
})

test('blocked storage does not throw and still remembers in memory', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => recordResult('2026-11-10', true, 100)).not.toThrow()
  expect(loadStreak().streak).toBe(1)
  vi.restoreAllMocks()
})

test('playedToday is true once the day is recorded', () => {
  expect(playedToday('2026-11-10')).toBe(false)
  recordResult('2026-11-10', false, 0)
  expect(playedToday('2026-11-10')).toBe(true)
})

test('currentStreak shows the streak only while it is still alive', () => {
  recordResult('2026-11-10', true, 100)
  expect(currentStreak('2026-11-10')).toBe(1)
  expect(currentStreak('2026-11-11')).toBe(1)
  expect(currentStreak('2026-11-12')).toBe(0)
})
