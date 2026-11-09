import { expect, test } from '@playwright/test'

test('a player solves the daily puzzle and sees it done on the landing page', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: /Daily Spy Hunter/ }).click()
  await page.waitForURL(/\/daily$/)

  await expect(page.getByText(/The civilians' word is piano/)).toBeVisible()
  await expect(page.getByText('Tries left: 2')).toBeVisible()

  await page.getByRole('button', { name: 'Milo' }).click()
  await expect(page.getByText('Milo is not the spy.')).toBeVisible()
  await expect(page.getByText('Tries left: 1')).toBeVisible()

  await page.getByRole('button', { name: 'Pip' }).click()
  await expect(page.getByText("What was the spy's word?")).toBeVisible()
  await page.getByRole('button', { name: 'organ' }).click()

  await expect(page.getByText('You found the spy!')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  await expect(page.getByTestId('share-preview')).toContainText('🟥🟩')

  await page.reload()
  await expect(page.getByText('You found the spy!')).toBeVisible()

  await page.getByRole('button', { name: 'Play a real round' }).click()
  await page.waitForURL(/\/$/)
  await expect(page.getByText('Done today ✅')).toBeVisible()
  await expect(page.getByText('Streak 1 🔥')).toBeVisible()
})
