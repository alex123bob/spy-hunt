import { expect, test, type Browser, type Page } from '@playwright/test'

// Screenshot sweep: no pixel diffs, only "no horizontal overflow" asserts. PNGs go to test-results/visual/.
const VIEWPORTS = { phone: { width: 320, height: 640 }, desktop: { width: 1280, height: 800 } }
const LANGS = { en: 'English', zh: '简体中文' } as const
type Lang = keyof typeof LANGS

async function open(browser: Browser, vp: keyof typeof VIEWPORTS, reduced = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], reducedMotion: reduced ? 'reduce' : 'no-preference' })
  return ctx.newPage()
}

async function setLang(page: Page, lang: Lang) {
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('option', { name: LANGS[lang] }).click()
}

async function go(page: Page, path: string, lang: Lang) {
  await page.goto(path)
  await setLang(page, lang)
  await page.waitForTimeout(300)
}

async function shot(page: Page, name: string, vp: string, lang: string) {
  await page.waitForTimeout(450)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await page.screenshot({ path: `test-results/visual/${name}-${vp}-${lang}.png`, fullPage: true })
  expect(over, `${name}-${vp}-${lang} overflows horizontally`).toBeLessThanOrEqual(0)
}

for (const vp of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
  for (const lang of Object.keys(LANGS) as Lang[]) {
    test.describe(`${vp} ${lang}`, () => {
      test('static screens, daily, bots, top, clan', async ({ browser }) => {
        const page = await open(browser, vp)
        await go(page, '/', lang)
        await shot(page, 'landing', vp, lang)

        // Daily: play, word, result
        await go(page, '/daily', lang)
        await page.locator('main button').nth(0).waitFor()
        await shot(page, 'daily-play', vp, lang)
        await page.getByRole('button', { name: 'Pip' }).click()
        await page.waitForTimeout(400)
        await shot(page, 'daily-word', vp, lang)
        // Option 0 is always the spy's word (puzzle_fixtures.sample_puzzle), but its label is
        // localized ("organ" / "风琴"), so pick it by position rather than by name.
        await page.locator('main .targets button.target').first().click()
        await page.waitForTimeout(800)
        await expect(page.getByTestId('credits-earned').locator('.credit-chip').first()).toBeVisible()
        await page.waitForTimeout(1200)
        await shot(page, 'daily-result', vp, lang)

        // Profile, then the how-to-earn page behind its info tile, and back
        await go(page, '/me', lang)
        await shot(page, 'profile', vp, lang)
        await page.getByTestId('how-to-earn').click()
        await expect(page.getByTestId('earn-guide')).toBeVisible()
        await shot(page, 'how-to-earn', vp, lang)
        await page.locator('.back-btn').click()
        await expect(page).toHaveURL(/\/me$/)

        // Bots: empty, form, list, page
        await go(page, '/bots', lang)
        await shot(page, 'bots-empty', vp, lang)
        await page.locator('main button.btn.primary, main button').filter({ hasText: /New bot|新建机器人/ }).first().click()
        await page.locator('input[type=text], input:not([type])').first().fill('Mochi the Very Long Named Fox Detective')
        await shot(page, 'bots-form', vp, lang)
        const created = page.waitForResponse((r) => r.url().endsWith('/bots') && r.request().method() === 'POST')
        await page.locator('.preview-frame ~ .row button.primary').click()
        const id = ((await (await created).json()) as { id: string }).id
        await expect(page.getByTestId('bot-card')).toBeVisible()
        await shot(page, 'bots-list', vp, lang)
        await go(page, `/bot/${id}`, lang)
        await shot(page, 'bot-page', vp, lang)

        await go(page, '/top', lang)
        await shot(page, 'top', vp, lang)

        // Clan: signed out, registered with no clan, member
        await go(page, '/clan', lang)
        await shot(page, 'clan-signed-out', vp, lang)
        await go(page, '/', lang)
        await page.locator('.topbar-right .account-btn').click()
        await shot(page, 'account-menu-guest', vp, lang)
        await page.locator('.account-pop button.primary').click()
        await shot(page, 'auth-modal', vp, lang)
        await page.locator('input[type=email]').fill(`vis-${vp}-${lang}-${Date.now()}@example.com`)
        await page.locator('input[type=password]').first().fill('longenough')
        await page.locator('form button[type=submit], form button.primary').first().click()
        await expect(page.locator('.auth-form')).toHaveCount(0)
        await page.locator('.topbar-right .account-btn').click()
        await expect(page.locator('.account-pop a[href="/clan"]')).toBeVisible()
        await shot(page, 'account-menu', vp, lang)
        await page.locator('.account-pop a[href="/clan"]').click()
        await page.waitForTimeout(500)
        await shot(page, 'clan-none', vp, lang)
        await page.locator('main input').first().fill(`Foxes${Date.now() % 100000}`)
        await page.locator('main form button[type=submit]').first().click()
        await expect(page.locator('strong.code')).toBeVisible()
        await shot(page, 'clan-member', vp, lang)
      })

      test('room flow', async ({ browser }) => {
        await roomFlow(await open(browser, vp), vp, lang, '')
      })
    })
  }
}

test('reduced motion: landing, table, reveal, result', async ({ browser }) => {
  const page = await open(browser, 'phone', true)
  await roomFlow(page, 'phone', 'en', 'reduced-')
})

async function roomFlow(page: Page, vp: string, lang: Lang, prefix: string) {
  await go(page, '/', lang)
  await shot(page, `${prefix}landing`, vp, lang)
  await page.locator('main input').first().fill('Hosty')
  await page.locator('main form button[type=submit], main button.primary').first().click()
  await page.waitForURL(/\/r\/[A-Z0-9]+$/)
  await page.waitForTimeout(500)
  await shot(page, `${prefix}lobby`, vp, lang)
  await page.locator('main button.primary').first().click()

  const seen = new Set<string>()
  const snap = async (key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    await shot(page, `${prefix}${key}`, vp, lang)
  }
  const deadline = Date.now() + 200_000
  while (Date.now() < deadline) {
    if (await page.getByText(/You (won|lost)|你(赢|输)了|获胜|失败/).count() && await page.getByTestId('words-panel').count()) {
      await snap('result')
      break
    }
    if (await page.locator('.reveal-screen').count()) await snap('reveal')
    else if (await page.locator('button.target').count()) {
      await snap('vote')
      await page.locator('button.target').first().click({ timeout: 2000 }).catch(() => {})
    } else if (await page.getByTestId('screen-Table').count()) {
      const input = page.locator('main textarea, main input[type=text]').last()
      if ((await input.count()) && (await input.isEnabled().catch(() => false))) {
        await snap('table-my-turn')
        await input.fill('something vague').catch(() => {})
        await page.locator('.turnbar button').first().click({ timeout: 2000 }).catch(() => {})
      } else await snap('table')
    }
    await page.waitForTimeout(300)
  }
  expect(seen.has('result'), `reached result (${[...seen].join(',')})`).toBe(true)
}
