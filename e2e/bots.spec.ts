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
  await owner.getByLabel('When, rule 1', { exact: true }).selectOption({ label: 'I am accused' })
  await owner.getByLabel('Then, rule 1', { exact: true }).selectOption({ label: 'vote for who voted for me' })

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

test('a visitor remixes a bot and the top bots board starts empty', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await owner.goto('/bots')
  await owner.getByRole('button', { name: 'New bot' }).click()
  await owner.getByLabel('Name', { exact: true }).fill('Mochi')
  await owner.getByRole('radio', { name: 'Pirate' }).click()
  const created = owner.waitForResponse((r) => r.url().endsWith('/bots') && r.request().method() === 'POST')
  await owner.getByRole('button', { name: 'Save' }).click()
  const id = ((await (await created).json()) as { id: string }).id

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/bot/${id}`)
  await visitor.getByRole('button', { name: 'Remix' }).click()
  await expect(visitor.getByRole('radio', { name: 'Pirate' })).toBeChecked()
  await visitor.getByLabel('Name', { exact: true }).fill('Mochi Jr')
  await visitor.getByRole('button', { name: 'Save' }).click()
  await expect(visitor.locator('.bot-item').getByTestId('bot-card')).toContainText('Remixed from Mochi')

  await owner.goto(`/bot/${id}`)
  await expect(owner.getByText('Remixes: 1')).toBeVisible()

  await visitor.goto('/top')
  const empty = 'No ranked bots yet. Play a room with 3 or more people to get on the board.'
  await expect(visitor.getByText('Ranked games need 3+ people in the room.')).toBeVisible()
  await expect(visitor.getByText(empty)).toBeVisible()
  await visitor.getByRole('tab', { name: 'Best spies' }).click()
  await expect(visitor.getByText(empty)).toBeVisible()
})

test('a bot plays the daily arena and its owner reads the recap', async ({ browser, request }) => {
  const arena = () => request.post('http://127.0.0.1:8010/e2e/arena-night')
  const owner = await (await browser.newContext()).newPage()
  await owner.goto('/bots')
  await owner.getByRole('button', { name: 'New bot' }).click()
  await owner.getByLabel('Name', { exact: true }).fill('Mochi')
  const created = owner.waitForResponse((r) => r.url().endsWith('/bots') && r.request().method() === 'POST')
  await owner.getByRole('button', { name: 'Save' }).click()
  await created

  const quiet = await (await browser.newContext()).newPage()
  await quiet.goto('/bots')
  await quiet.getByRole('button', { name: 'New bot' }).click()
  await quiet.getByLabel('Name', { exact: true }).fill('Shy')
  await quiet.getByLabel('Let my bot play in the daily arena').uncheck()
  const shy = quiet.waitForResponse((r) => r.url().endsWith('/bots') && r.request().method() === 'POST')
  await quiet.getByRole('button', { name: 'Save' }).click()
  await shy

  const res = await arena()
  expect(((await res.json()) as { played: number }).played).toBe(1)

  await quiet.goto('/bots')
  await expect(quiet.getByTestId('bot-card')).toBeVisible()
  await expect(quiet.getByText('While you were away')).toHaveCount(0)

  await owner.goto('/')
  await expect(owner.getByText('1 new')).toBeVisible()
  await owner.goto('/bots')
  await expect(owner.getByText('While you were away')).toBeVisible()
  await expect(owner.getByText(/^Mochi( \d)? was/)).toBeVisible()
  await owner.getByRole('link', { name: 'See the match' }).click()
  await owner.waitForURL(/\/match\/.+/)
  await expect(owner.getByText('Arena match')).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Round 1' })).toBeVisible()
  await expect(owner.getByText(/Civilians:/)).toBeVisible()

  await owner.goto('/')
  await expect(owner.getByText('1 new')).toHaveCount(0)
  await owner.goto('/bots')
  await expect(owner.getByTestId('bot-card')).toContainText('Arena: 1 games')

  await arena()
  await quiet.goto('/bots')
  await expect(quiet.getByTestId('bot-card')).toBeVisible()
  await expect(quiet.getByText('While you were away')).toHaveCount(0)
})
