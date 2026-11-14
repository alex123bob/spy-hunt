import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Profile } from './Profile'
import { getCredits } from '../credits/api'
import { RANKS } from '../game/rank'
import { t } from '../i18n'
import { getMyGameDetail, getMyGames } from '../games/api'
import type { GameDetail } from '../api/types'

vi.mock('../looks/LookEditor', () => ({ LookEditor: () => <div data-testid="look-editor" /> }))
vi.mock('../games/api', () => ({ getMyGames: vi.fn(), getMyGameDetail: vi.fn() }))
const detailFor = (name: string): GameDetail => ({
  finished_at: 0, winner: 'spies', lang: 'en', words: { civilian: { en: 'Coffee' }, spy: { en: 'Tea' } },
  roles: [{ seat: 0, role: 'civilian', is_bot: false, name, is_you: true }],
})
beforeEach(() => { vi.mocked(getMyGames).mockResolvedValue([]) })
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

test('an info tile next to the credits opens the how-to-earn page', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  const { container } = render(tree)
  await waitFor(() => expect(screen.getByText('40')).toBeInTheDocument())
  expect(container.querySelector('[data-testid="earn-guide"]')).toBeNull()
  const link = screen.getByTestId('how-to-earn')
  expect(link).toHaveAttribute('href', '/credits/how')
  expect(link.closest('.stats-trio')).not.toBeNull()
})

test('the how-to-earn entry is there even when /credits fails', async () => {
  vi.mocked(getCredits).mockRejectedValue(new Error('boom'))
  render(tree)
  await waitFor(() => expect(getCredits).toHaveBeenCalled())
  expect(screen.getByTestId('how-to-earn')).toBeInTheDocument()
})

test('opening a recent game shows its recap with a link to the full screen', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 0, winner: 'civilians', your_role: 'civilian', won: true, credits_earned: 20 },
  ])
  vi.mocked(getMyGameDetail).mockResolvedValue(detailFor('Mia'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: (n) => n.includes(t('profile.gameOutcome.won', { credits: 20 })) }))
  const link = await screen.findByRole('link', { name: t('profile.game.fullRecap') })
  expect(link).toHaveAttribute('href', '/games/r1/1')
  expect(screen.getByText('Mia')).toBeInTheDocument()
})

test('two recent games can be open at once, one request each', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 0, winner: 'spies', your_role: 'spy', won: true, credits_earned: 20 },
    { room_id: 'r2', game_no: 2, finished_at: 0, winner: 'spies', your_role: 'civilian', won: false, credits_earned: 10 },
  ])
  vi.mocked(getMyGameDetail).mockImplementation(async (room) => detailFor(room === 'r1' ? 'Ana' : 'Bo'))
  render(tree)
  const toggles = await screen.findAllByRole('button', { expanded: false })
  fireEvent.click(toggles[0])
  fireEvent.click(toggles[1])
  await screen.findByText('Ana')
  await screen.findByText('Bo')
  expect(getMyGameDetail).toHaveBeenCalledTimes(2)
  expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2)
})

test('each recent game row shows the role you played', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 1_794_398_400_000, winner: 'spies', your_role: 'spy', won: true, credits_earned: 20 },
    { room_id: 'r2', game_no: 2, finished_at: 1_794_398_500_000, winner: 'spies', your_role: 'civilian', won: false, credits_earned: 10 },
  ])
  const { container } = render(tree)
  await waitFor(() => expect(container.querySelectorAll('.game-list li')).toHaveLength(2))
  const rows = container.querySelectorAll('.game-list li')
  expect(rows[0].textContent).toContain(t('arena.role.spy'))
  expect(rows[1].textContent).toContain(t('arena.role.civilian'))
})

test('recent games sit between the stats and the look editor', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 0, winner: 'spies', your_role: 'spy', won: true, credits_earned: 20 },
  ])
  const { container } = render(tree)
  await waitFor(() => expect(container.querySelector('.recent-games')).not.toBeNull())
  const trio = container.querySelector('.stats-trio') as Element
  const recent = container.querySelector('.recent-games') as Element
  expect(trio.nextElementSibling).toBe(recent)
  expect(recent.nextElementSibling).toBe(screen.getByTestId('look-editor'))
})

test('a game with no winner shows a neutral outcome, not Lost', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 0, winner: null, your_role: 'civilian', won: null, credits_earned: 0 },
  ])
  const { container } = render(tree)
  await waitFor(() => expect(container.querySelectorAll('.game-list li')).toHaveLength(1))
  expect(container.querySelector('.game-list')?.textContent).not.toContain('Lost')
  expect(container.querySelector('.game-list')?.textContent).toContain(t('profile.gameOutcome.none', { credits: 0 }))
})
