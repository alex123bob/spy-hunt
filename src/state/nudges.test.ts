import {
  dismiss, pendingNudge, recordPageLoadVisit, recordStreakMilestone, recordVisit, recordWin, resetNudgesForTests,
} from './nudges'

beforeEach(() => {
  localStorage.clear()
  resetNudgesForTests()
})
afterEach(() => vi.restoreAllMocks())

test('a streak below the milestone does not arm the nudge', () => {
  recordStreakMilestone(2)
  expect(pendingNudge()).toBeNull()
})

test('a streak at the milestone arms the streak nudge', () => {
  recordStreakMilestone(3)
  expect(pendingNudge()).toBe('streak')
})

test('the return nudge arms on the third visit only', () => {
  recordVisit()
  recordVisit()
  expect(pendingNudge()).toBeNull()
  recordVisit()
  expect(pendingNudge()).toBe('return')
})

test('streak beats win beats return, and dismissal falls through per trigger', () => {
  recordVisit(); recordVisit(); recordVisit()
  recordWin()
  expect(pendingNudge()).toBe('win')
  recordStreakMilestone(3)
  expect(pendingNudge()).toBe('streak')
  dismiss('streak')
  expect(pendingNudge()).toBe('win')
  dismiss('win')
  expect(pendingNudge()).toBe('return')
})

test('dismissing one trigger does not suppress a later occurrence of it', () => {
  recordWin()
  dismiss('win')
  expect(pendingNudge()).toBeNull()
  recordWin()
  expect(pendingNudge()).toBe('win')
})

test('visits past the threshold do not re-arm a dismissed return nudge', () => {
  recordVisit(); recordVisit(); recordVisit()
  dismiss('return')
  recordVisit()
  expect(pendingNudge()).toBeNull()
})

test('state survives a reload via storage', () => {
  recordWin()
  resetNudgesForTests(false)
  expect(pendingNudge()).toBe('win')
})

test('every function is a safe no-op when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => {
    recordStreakMilestone(5); recordWin(); recordVisit(); dismiss('win'); pendingNudge()
  }).not.toThrow()
})

test('seeing the same streak again does not re-arm a dismissed streak nudge', () => {
  recordStreakMilestone(5)
  dismiss('streak')
  recordStreakMilestone(5) // reopening the result screen
  recordStreakMilestone(6) // the next day
  expect(pendingNudge()).toBeNull()
})

test('a streak that drops and climbs back to the milestone arms the nudge again', () => {
  recordStreakMilestone(3)
  dismiss('streak')
  recordStreakMilestone(0)
  recordStreakMilestone(3)
  expect(pendingNudge()).toBe('streak')
})

test('a visit is counted once per page load, however often Landing mounts', () => {
  recordPageLoadVisit()
  recordPageLoadVisit()
  recordPageLoadVisit()
  expect(pendingNudge()).toBeNull() // three mounts, still one visit
  resetNudgesForTests(false) // a fresh page load, storage kept
  recordPageLoadVisit()
  resetNudgesForTests(false)
  recordPageLoadVisit()
  expect(pendingNudge()).toBe('return') // the third page load
})
