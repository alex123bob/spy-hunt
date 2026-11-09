import { expect, test, type Page } from '@playwright/test'

const ROLE_TEXT = /\b(Spy|Civilian)\b|卧底|平民/

async function actOnce(page: Page): Promise<void> {
  const input = page.getByPlaceholder('Describe your word…')
  if ((await input.count()) > 0 && (await input.isEnabled({ timeout: 500 }))) {
    await input.fill('something vague')
    await page.getByRole('button', { name: 'Send' }).click({ timeout: 2000 })
    return
  }
  const target = page.locator('button.target').first()
  if ((await target.count()) > 0) {
    await target.click({ timeout: 2000 })
  }
}

test('two players create, join, play with bots to game over', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const guest = await (await browser.newContext()).newPage()

  await host.goto('/')
  await host.getByLabel('Your name').fill('Hosty')
  await host.getByRole('button', { name: 'Create room' }).click()
  await host.waitForURL(/\/r\/[A-Z0-9]+$/)
  const code = host.url().split('/r/')[1]

  await guest.goto(`/r/${code}`)
  await guest.getByLabel('Your name').fill('Guesty')
  await guest.getByRole('button', { name: 'Join room' }).click()
  await expect(guest.getByText('Hosty')).toBeVisible()
  await expect(host.getByText('Guesty')).toBeVisible()

  await expect(guest.getByRole('button', { name: 'Start game' })).toHaveCount(0)
  await host.getByRole('button', { name: 'Start game' }).click()

  const pages = [host, guest]
  const deadline = Date.now() + 200_000
  let finished = false
  while (Date.now() < deadline && !finished) {
    for (const p of pages) {
      const onPlayScreen =
        (await p.getByTestId('screen-Table').count()) > 0 || (await p.locator('button.target').count()) > 0
      if (onPlayScreen) {
        expect(await p.locator('main').innerText()).not.toMatch(ROLE_TEXT)
      }
      await actOnce(p)
    }
    finished = (await host.getByText('Game over').count()) > 0 && (await guest.getByText('Game over').count()) > 0
    await host.waitForTimeout(500)
  }
  expect(finished).toBe(true)

  for (const p of pages) {
    await expect(p.getByText('Words')).toBeVisible()
    await expect(p.getByText(/Civilian:/)).toBeVisible()
    await expect(p.getByText(/Spy:/)).toBeVisible()
  }
})
