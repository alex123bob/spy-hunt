import { expect, test } from '@playwright/test'

// On a short screen the sticky turn bar overlays the bottom of the page; the newest
// statement must still end up above it, not hidden behind it.
test('the newest statement is never hidden behind the turn bar', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 520 } })).newPage()
  await page.goto('/')
  await page.getByLabel('Your name').fill('Hosty')
  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForURL(/\/r\/[A-Z0-9]+$/)
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.getByTestId('screen-Table').waitFor({ timeout: 30_000 })

  const state = () => page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.table .feed .bubble')]
    const last = bubbles[bubbles.length - 1]
    const bar = document.querySelector('.turnbar')
    if (!last || !bar) return null
    return { n: bubbles.length, gap: Math.round(bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom) }
  })

  const checked = new Set<number>()
  const end = Date.now() + 120_000
  while (Date.now() < end && checked.size < 6) {
    const s = await state()
    if (s && !checked.has(s.n)) {
      await page.waitForTimeout(250) // let the scroll effect settle
      const settled = await state()
      if (settled && settled.n === s.n) {
        // gap >= 0: the bubble's bottom edge is above the bar's top edge
        expect(settled.gap, `message ${s.n} is hidden behind the turn bar`).toBeGreaterThanOrEqual(0)
        checked.add(s.n)
      }
    }
    await page.waitForTimeout(200)
  }
  expect(checked.size).toBeGreaterThanOrEqual(6)
})
