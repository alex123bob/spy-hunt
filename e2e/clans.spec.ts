import { expect, test, type Browser, type Page } from '@playwright/test'

async function registered(browser: Browser, tag: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Register / log in' }).click()
  await page.getByLabel('Email').fill(`e2e-${tag}-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('longenough')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Clan' })).toBeVisible()
  return page
}

test('two players form a clan and see the badge in a room', async ({ browser }) => {
  const clanName = `Fox${Date.now() % 100000}`
  const a = await registered(browser, 'a')
  await a.getByRole('link', { name: 'Clan' }).click()
  await a.getByLabel('Clan name').fill(clanName)
  await a.getByRole('radio', { name: '🐺' }).click()
  await a.getByRole('button', { name: 'Create clan' }).click()
  await expect(a.getByRole('heading', { name: new RegExp(clanName) })).toBeVisible()
  const code = (await a.locator('strong.code').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  const b = await registered(browser, 'b')
  await b.goto('/clan')
  await b.getByLabel('Invite code').fill(code.toLowerCase())
  await b.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(b.getByRole('heading', { name: new RegExp(clanName) })).toBeVisible()
  await expect(b.getByTestId('clan-member')).toHaveCount(2)
  await expect(b.getByText('Get to 3 members to face a rival next week.')).toBeVisible()

  await a.goto('/')
  await a.getByLabel('Your name').fill('Ann')
  await a.getByRole('button', { name: 'Create room' }).click()
  await a.waitForURL(/\/r\/[A-Z0-9]+$/)
  const room = a.url().split('/r/')[1]
  await b.goto(`/r/${room}`)
  await b.getByLabel('Your name').fill('Ben')
  await b.getByRole('button', { name: 'Join room' }).click()
  await expect(a.getByText('Ben')).toBeVisible()
  await expect(a.getByRole('button', { name: `Clan: ${clanName}` })).toHaveCount(2)

  await b.goto('/clan')
  await expect(b.getByTestId('clan-member').first()).toContainText(/Ann|Ben/)
  await b.getByRole('button', { name: 'Leave clan' }).click()
  await b.getByRole('button', { name: 'Yes, leave' }).click()
  await expect(b.getByRole('button', { name: 'Create clan' })).toBeVisible()
})
