import { expect, test } from '@playwright/test'

test('a player dresses up a bot, shares its page, and plays it in a room', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await owner.goto('/bots')
  await owner.getByRole('button', { name: 'New bot' }).click()
  await owner.getByLabel('Name', { exact: true }).fill('Mochi')
  await owner.getByRole('radiogroup', { name: 'Avatar' }).getByRole('radio').nth(3).click()
  await owner.getByRole('radio', { name: 'Pirate' }).click()
  await owner.getByRole('radio', { name: 'Metaphor' }).click()
  await owner.getByRole('radio', { name: 'Ends with a question' }).click()
  await owner.getByRole('button', { name: 'Add rule' }).click()
  await owner.getByLabel('When', { exact: true }).selectOption({ label: 'I am accused' })
  await owner.getByLabel('Then', { exact: true }).selectOption({ label: 'vote for who voted for me' })

  const created = owner.waitForResponse((r) => r.url().endsWith('/bots') && r.request().method() === 'POST')
  await owner.getByRole('button', { name: 'Save' }).click()
  const id = ((await (await created).json()) as { id: string }).id

  const card = owner.getByTestId('bot-card')
  await expect(card).toContainText('Mochi')
  await expect(card).toContainText('Voice: Pirate')
  await expect(card).toContainText('Style: Metaphor')
  await expect(card).toContainText('Quirk: Ends with a question')
  await expect(card).toContainText('When I am accused → vote for who voted for me')

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/bot/${id}`)
  await expect(visitor.getByText('Mochi')).toBeVisible()
  await expect(visitor.getByText('0 games · 0 wins · fooled the table 0 times')).toBeVisible()
  await expect(visitor.getByText('When I am accused → vote for who voted for me')).toBeVisible()

  await owner.goto('/')
  await owner.getByLabel('Your name').fill('Hosty')
  await owner.getByRole('button', { name: 'Create room' }).click()
  await owner.waitForURL(/\/r\/[A-Z0-9]+$/)
  await owner.getByRole('button', { name: 'Add my bot' }).click()
  const row = owner.locator('li, div').filter({ hasText: 'Mochi' }).filter({ hasText: 'Bot' }).first()
  await expect(row).toBeVisible()

  await owner.getByRole('button', { name: 'Start game' }).click()
  await expect(owner.getByTestId('screen-Table')).toBeVisible({ timeout: 30_000 })
})
