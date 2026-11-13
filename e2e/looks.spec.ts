import { expect, test } from '@playwright/test'

test('a guest picks a look on the profile and wears it in a room', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('link', { name: 'Profile' }).click()
  await page.waitForURL(/\/me$/)

  await page.getByRole('radio', { name: '🐙' }).click()
  await page.getByRole('radio', { name: 'Purple' }).click()
  await expect(page.getByRole('radio', { name: /Crown — Unlocks at Legend/ })).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('look-preview').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/visual/looks-profile.png', fullPage: true })
  await page.getByRole('button', { name: 'Save look' }).click()
  await expect(page.getByText('Look saved')).toBeVisible()

  await page.goto('/')
  await page.getByLabel('Your name').fill('Ann')
  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForURL(/\/r\/[A-Z0-9]+$/)
  await expect(page.locator('.avatar', { hasText: '🐙' }).first()).toBeVisible()
})

test('a clan creator builds a badge and the leader changes it', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Register / log in' }).click()
  await page.getByLabel('Email').fill(`looks-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('longenough')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('.auth-form')).toHaveCount(0)
  await page.goto('/clan')

  await page.getByLabel('Clan name').fill(`Bat${Date.now() % 100000}`)
  await page.getByRole('radio', { name: '🦇' }).click()
  await page.getByRole('radio', { name: 'Teal' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/visual/looks-clan-builder.png', fullPage: true })
  await page.getByRole('button', { name: 'Create clan' }).click()
  await expect(page.locator('.clan-crest .clan-badge')).toHaveText('🦇')

  await page.getByRole('button', { name: 'Change badge' }).click()
  await page.getByRole('radio', { name: '🌙' }).click()
  await page.getByRole('button', { name: 'Save badge' }).click()
  await expect(page.locator('.clan-crest .clan-badge')).toHaveText('🌙')
})
