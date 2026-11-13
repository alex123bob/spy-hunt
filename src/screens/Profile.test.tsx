import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Profile } from './Profile'
import { getCredits } from '../credits/api'
import { RANKS } from '../game/rank'
import { t } from '../i18n'

vi.mock('../credits/api', () => ({ getCredits: vi.fn() }))
vi.mock('../state/looks', () => ({ getLooks: vi.fn().mockRejectedValue(new Error('offline')), saveLook: vi.fn() }))

const summary = {
  credits: 900, today: 40,
  rank: { index: 2, key: 'hunter', min: 750 },
  next: { key: 'senior', min: 2000, remaining: 1100 },
}
const tree = <MemoryRouter><Profile /></MemoryRouter>

test('renders hero card, credits and the six-rank ladder with the current one marked', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  const { container } = render(tree)
  await waitFor(() => expect(screen.getAllByText('900').length).toBeGreaterThan(1))
  expect(container.querySelector('.hero-card')).not.toBeNull()
  expect(screen.getByText('40')).toBeInTheDocument()
  const rows = container.querySelectorAll('.ladder-row')
  expect(rows).toHaveLength(6)
  RANKS.forEach((r, i) => {
    expect(rows[i].textContent).toContain(t(`rank.${r.key}`))
    expect(rows[i].textContent).toContain(String(r.min))
  })
  const current = container.querySelectorAll('.ladder-row[aria-current="true"]')
  expect(current).toHaveLength(1)
  expect(current[0]).toBe(rows[2])
})

test('failed getCredits still renders the ladder with Rookie current', async () => {
  vi.mocked(getCredits).mockRejectedValue(new Error('boom'))
  const { container } = render(tree)
  await waitFor(() => expect(getCredits).toHaveBeenCalled())
  expect(container.querySelectorAll('.ladder-row')).toHaveLength(6)
  expect(container.querySelector('.ladder-row[aria-current="true"]')).toBe(container.querySelectorAll('.ladder-row')[0])
  expect(container.querySelector('.hero-card')).not.toBeNull()
})
