import { describe, expect, it } from 'vitest'
import { revealDelays } from './revealTiming'

describe('revealDelays', () => {
  it('one vote', () => expect(revealDelays(1)).toEqual([220, 400, 500]))
  it('nine votes fit the budget', () => {
    const d = revealDelays(9)
    expect(d.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2500)
    expect(d).toHaveLength(11)
  })
  it('zero votes', () => expect(revealDelays(0)).toEqual([400, 500]))
})
