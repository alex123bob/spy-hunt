import { reloadDelay } from './backoff'

test('reload delay grows then caps', () => {
  expect([0, 1, 2, 3, 4, 5, 99].map(reloadDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000])
})

test('a negative count is treated as zero', () => {
  expect(reloadDelay(-3)).toBe(1000)
})
