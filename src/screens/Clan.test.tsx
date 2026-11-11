import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Clan } from './Clan'
import type { MyClan, Season } from '../api/types'
import { setLang } from '../i18n'
import { useAccount } from '../state/accounts'
import { createClan, getBadges, getMyClan, joinClan, leaveClan, listOpenClans } from '../state/clans'

vi.mock('../state/accounts', () => ({ useAccount: vi.fn() }))
vi.mock('../state/clans', () => ({
  getMyClan: vi.fn(), getBadges: vi.fn(), createClan: vi.fn(), joinClan: vi.fn(),
  leaveClan: vi.fn(), listOpenClans: vi.fn(),
}))

const BADGES = [{ emoji: '🦊', color: '#ff6b6b' }, { emoji: '🐺', color: '#ffa94d' }]
const NOW = Date.UTC(2026, 10, 11, 12)

const season = (over: Partial<Season> = {}): Season => ({
  this_week: { week: '2026-11-09', own: 120, ghost: false, ends_at: Date.UTC(2026, 10, 16),
    rival: { name: 'Wolves', badge: BADGES[1], score: 90 } },
  streak: 2,
  history: [
    { week: '2026-11-02', result: 'won', own: 200, rival_score: 150, rival_name: 'Owls', ghost: false },
    { week: '2026-10-26', result: 'draw', own: 80, rival_score: 80, rival_name: null, ghost: true },
    { week: '2026-10-19', result: 'lost', own: 10, rival_score: 50, rival_name: 'Bees', ghost: false },
  ],
  members: [
    { name: 'Mochi', points: 70, is_leader: false },
    { name: 'Ann', points: 50, is_leader: true },
  ],
  ...over,
})

const memberOf = (s: Season): MyClan => ({
  clan: { id: 'c1', name: 'Foxes', badge: BADGES[0], code: 'ABC123', members: 2, is_leader: true },
  season: s,
})

const tree = <MemoryRouter><Clan /></MemoryRouter>

beforeEach(() => {
  setLang('en')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.mocked(useAccount).mockReturnValue({ email: 'a@b.com' })
  vi.mocked(getBadges).mockResolvedValue(BADGES)
  vi.mocked(getMyClan).mockReset().mockResolvedValue({ clan: null })
  vi.mocked(listOpenClans).mockReset().mockResolvedValue([
    { id: 'o1', name: 'Owls', badge: BADGES[1], code: 'OWL111', members: 4 },
  ])
  vi.mocked(createClan).mockReset()
  vi.mocked(joinClan).mockReset()
  vi.mocked(leaveClan).mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

test('signed-out user sees a register prompt and no clan calls', () => {
  vi.mocked(useAccount).mockReturnValue({ email: null })
  render(tree)
  expect(screen.getByText('Register an account to join a clan.')).toBeInTheDocument()
  expect(getMyClan).not.toHaveBeenCalled()
})

test('no-clan user sees create form, join by code and the open list', async () => {
  render(tree)
  expect(await screen.findByRole('button', { name: 'Create clan' })).toBeInTheDocument()
  expect(screen.getByLabelText('Invite code')).toBeInTheDocument()
  expect(await screen.findByText('Owls')).toBeInTheDocument()
  expect(screen.getByText('4/30 members')).toBeInTheDocument()
})

test('creating a clan sends name and badge index, then shows the clan', async () => {
  vi.mocked(createClan).mockResolvedValue(memberOf(season()).clan!)
  render(tree)
  fireEvent.change(await screen.findByLabelText('Clan name'), { target: { value: 'Foxes' } })
  fireEvent.click(screen.getByRole('radio', { name: '🐺' }))
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  fireEvent.click(screen.getByRole('button', { name: 'Create clan' }))
  await waitFor(() => expect(createClan).toHaveBeenCalledWith('Foxes', 1))
  expect(await screen.findByRole('heading', { name: /Foxes/ })).toBeInTheDocument()
})

test('join by code and joining from the list', async () => {
  vi.mocked(joinClan).mockResolvedValue(memberOf(season()).clan!)
  render(tree)
  fireEvent.change(await screen.findByLabelText('Invite code'), { target: { value: 'abc123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join' }))
  await waitFor(() => expect(joinClan).toHaveBeenCalledWith('abc123'))
  vi.mocked(getMyClan).mockResolvedValue({ clan: null })
})

test('join errors are shown', async () => {
  const { ApiError } = await import('../api/client')
  vi.mocked(joinClan).mockRejectedValue(new ApiError(409, 'clan_full'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Join Owls' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That clan is full.')
  expect(joinClan).toHaveBeenCalledWith('OWL111')
})

test('member sees badge, code, this week vs rival, members and history', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  render(tree)
  expect(await screen.findByRole('heading', { name: /Foxes/ })).toBeInTheDocument()
  expect(screen.getByText('ABC123')).toBeInTheDocument()
  expect(screen.getByText('120')).toBeInTheDocument()
  expect(screen.getByText('90')).toBeInTheDocument()
  expect(screen.getByText(/vs Wolves/)).toBeInTheDocument()
  expect(screen.getByText('4d 12h left · Win streak: 2')).toBeInTheDocument()
  const rows = screen.getAllByTestId('clan-member').map((e) => e.textContent)
  expect(rows[0]).toContain('Mochi')
  expect(rows[0]).toContain('70')
  expect(rows[1]).toContain('Leader')
  const weeks = screen.getAllByTestId('clan-week').map((e) => e.textContent)
  expect(weeks[0]).toMatch(/Won.*200.*150.*Owls/)
  expect(weeks[1]).toMatch(/Draw.*Practice rival/)
  expect(weeks[2]).toMatch(/Lost/)
})

test('practice rival label this week', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season({
    this_week: { week: '2026-11-09', own: 10, ghost: true, ends_at: Date.UTC(2026, 10, 16),
      rival: { name: null, badge: null, score: 50 } },
  })))
  render(tree)
  expect(await screen.findByText('vs Practice rival', { selector: '.clan-score span' })).toBeInTheDocument()
})

test('a clan with no rival shows the 3-member line', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season({
    this_week: { week: '2026-11-09', own: 30, ghost: false, rival: null, ends_at: Date.UTC(2026, 10, 16) },
    history: [],
  })))
  render(tree)
  expect(await screen.findByText('Get to 3 members to face a rival next week.')).toBeInTheDocument()
  expect(screen.getByText('No finished weeks yet.')).toBeInTheDocument()
})

test('leave asks for confirmation', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Leave clan' }))
  expect(leaveClan).not.toHaveBeenCalled()
  vi.mocked(getMyClan).mockResolvedValue({ clan: null })
  fireEvent.click(screen.getByRole('button', { name: 'Yes, leave' }))
  await waitFor(() => expect(leaveClan).toHaveBeenCalled())
  expect(await screen.findByRole('button', { name: 'Create clan' })).toBeInTheDocument()
})

test('load error offers retry', async () => {
  vi.mocked(getMyClan).mockRejectedValueOnce(new Error('x'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('button', { name: 'Create clan' })).toBeInTheDocument()
})
