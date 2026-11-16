import { expect, test } from '@playwright/test'

test('a player can always get back to their room, and only has one', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Your name').fill('Hosty')
  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForURL(/\/r\/[A-Z0-9]+$/)
  const code = page.url().split('/r/')[1]

  // walk away to the home page: the banner offers the way back
  await page.goto('/')
  await expect(page.getByText(`You're in room ${code}`)).toBeVisible()
  await page.getByRole('button', { name: 'Return' }).click()
  await page.waitForURL(new RegExp(`/r/${code}$`))

  // other pages show the floating chip, and it survives a reload
  await page.goto('/top')
  const chip = page.getByRole('link', { name: `In room ${code}` })
  await expect(chip).toBeVisible()
  await page.reload()
  await expect(chip).toBeVisible()
  await chip.click()
  await page.waitForURL(new RegExp(`/r/${code}$`))

  // a second room is refused with a dialog; leaving the first lets the second be created
  await page.goto('/')
  await page.getByRole('button', { name: 'Create room' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(`room ${code}`)).toBeVisible()
  await dialog.getByRole('button', { name: 'Leave and continue' }).click()
  await page.waitForURL(/\/r\/[A-Z0-9]+$/)
  expect(page.url().split('/r/')[1]).not.toBe(code)
})
