import { RANKS, rankByIndex, rankTitleKey } from './rank'

describe('rank', () => {
  it('returns rank entries by index', () => {
    expect(rankByIndex(0).hero).toBe('🐣')
    expect(rankByIndex(5).key).toBe('legend')
  })
  it('builds the i18n title key', () => {
    expect(rankTitleKey(2)).toBe('rank.hunter')
  })
  it('clamps out-of-range indices', () => {
    expect(rankByIndex(-3).key).toBe('rookie')
    expect(rankByIndex(99).key).toBe('legend')
    expect(rankTitleKey(99)).toBe('rank.legend')
  })
  it('is ascending by min', () => {
    expect(RANKS.map((r) => r.min)).toEqual([0, 250, 750, 2000, 5000, 12000])
  })
})
