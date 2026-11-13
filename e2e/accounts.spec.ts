import { expect, test } from '@playwright/test'

test('a guest registers, keeps their bot, and logs in on a second device', async ({ browser }) => {
  const email = `e2e-${Date.now()}@example.com`
  const password = 'longenough'

  const first = await (await browser.newContext()).newPage()
  await first.goto('/bots')
  await first.getByRole('button', { name: 'New bot' }).click()
  await first.getByLabel('Name', { exact: true }).fill('Mochi')
  await first.getByRole('radio', { name: 'Pirate' }).click()
  await first.getByRole('radio', { name: 'Metaphor' }).click()
  await first.getByRole('radio', { name: 'Ends with a question' }).click()
  await first.getByRole('button', { name: 'Save' }).click()
  await expect(first.getByTestId('bot-card')).toContainText('Mochi')

  await first.getByRole('button', { name: 'Account', exact: true }).click()
  await first.getByRole('button', { name: 'Register / log in' }).click()
  await first.getByLabel('Email').fill(email)
  await first.getByLabel('Password').fill(password)
  await first.getByRole('button', { name: 'Create account' }).click()
  await first.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(first.getByText(email)).toBeVisible()
  await expect(first.getByRole('button', { name: 'Register / log in' })).toHaveCount(0)
  await expect(first.getByTestId('bot-card')).toContainText('Mochi')

  const second = await (await browser.newContext()).newPage()
  await second.goto('/bots')
  await expect(second.getByTestId('bot-card')).toHaveCount(0)
  await second.getByRole('button', { name: 'Account', exact: true }).click()
  await second.getByRole('button', { name: 'Register / log in' }).click()
  await second.getByRole('tab', { name: 'Log in' }).click()
  await second.getByLabel('Email').fill(email)
  await second.getByLabel('Password').fill(password)
  await second.getByRole('button', { name: 'Log in', exact: true }).click()
  await second.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(second.getByText(email)).toBeVisible()
  await expect(second.getByTestId('bot-card')).toContainText('Mochi')

  await second.getByRole('button', { name: 'Log out' }).click()
  await second.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(second.getByRole('button', { name: 'Register / log in' })).toBeVisible()
  await first.reload()
  await first.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(first.getByText(email)).toBeVisible()
})
