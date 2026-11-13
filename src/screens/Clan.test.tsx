import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Clan } from './Clan'
import type { MyClan, Season } from '../api/types'
import { setLang } from '../i18n'
import { useAccount } from '../state/accounts'
import { changeBadge, createClan, getBadges, getMyClan, joinClan, leaveClan, listOpenClans } from '../state/clans'

vi.mock('../state/accounts', () => ({ useAccount: vi.fn() }))
vi.mock('../state/clans', () => ({
  getMyClan: vi.fn(), getBadges: vi.fn(), createClan: vi.fn(), changeBadge: vi.fn(), joinClan: vi.fn(),
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
  vi.mocked(getBadges).mockResolvedValue({ badges: BADGES, emojis: ['🦊', '🐺', '🦉', '🦇'], colors: ['#ff6b6b', '#4cd08a'] })
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

test('creating a clan sends the built badge, then shows the clan', async () => {
  vi.mocked(createClan).mockResolvedValue(memberOf(season()).clan!)
  render(tree)
  fireEvent.change(await screen.findByLabelText('Clan name'), { target: { value: 'Foxes' } })
  fireEvent.click(await screen.findByRole('radio', { name: '🦇' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Green' }))
  expect(screen.getByTestId('badge-preview')).toHaveTextContent('🦇')
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  fireEvent.click(screen.getByRole('button', { name: 'Create clan' }))
  await waitFor(() => expect(createClan).toHaveBeenCalledWith('Foxes', { emoji: '🦇', color: '#4cd08a' }))
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

test('a double tap on Yes, leave sends one request', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  let finish: () => void = () => {}
  vi.mocked(leaveClan).mockReturnValue(new Promise<void>((r) => { finish = r }))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Leave clan' }))
  const yes = screen.getByRole('button', { name: 'Yes, leave' })
  fireEvent.click(yes)
  fireEvent.click(yes)
  expect(leaveClan).toHaveBeenCalledTimes(1)
  expect(yes).toBeDisabled()
  finish()
})

test('if badges fail to load, the built-in set is offered', async () => {
  vi.mocked(getBadges).mockRejectedValue(new Error('down'))
  render(tree)
  expect(await screen.findByRole('radio', { name: '🦊' })).toBeInTheDocument()
  expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(6)
})

test('the name field explains the length rule, and bad_name shows it', async () => {
  const { ApiError } = await import('../api/client')
  vi.mocked(createClan).mockRejectedValue(new ApiError(400, 'bad_name'))
  render(tree)
  expect(await screen.findByText('3 to 20 characters.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Clan name'), { target: { value: 'Foxes' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create clan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Clan names are 3 to 20 characters.')
})

test('time left counts down while the page is open', async () => {
  const ticks: (() => void)[] = []
  const spy = vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void) => { ticks.push(fn); return 1 }) as unknown as typeof setInterval)
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  render(tree)
  expect(await screen.findByText(/4d 12h left/)).toBeInTheDocument()
  vi.setSystemTime(NOW + 3 * 3_600_000)
  act(() => ticks.forEach((f) => f()))
  expect(screen.getByText(/4d 9h left/)).toBeInTheDocument()
  spy.mockRestore()
})

test('signed-out page opens the auth sheet', () => {
  vi.mocked(useAccount).mockReturnValue({ email: null })
  render(tree)
  fireEvent.click(screen.getByRole('button', { name: 'Register / log in' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('tug bar splits by score', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season({
    this_week: { week: '2026-11-09', own: 30, ghost: false, ends_at: Date.UTC(2026, 10, 16),
      rival: { name: 'Wolves', badge: BADGES[1], score: 10 } },
  })))
  render(tree)
  expect(await screen.findByTestId('tug-own')).toHaveStyle({ width: '75%' })
})

test('tug bar is even at 0-0', async () => {
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season({
    this_week: { week: '2026-11-09', own: 0, ghost: false, ends_at: Date.UTC(2026, 10, 16),
      rival: { name: 'Wolves', badge: BADGES[1], score: 0 } },
  })))
  render(tree)
  expect(await screen.findByTestId('tug-own')).toHaveStyle({ width: '50%' })
})

test('copy code shows copied', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.mocked(getMyClan).mockResolvedValue(memberOf(season()))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }))
  expect(await screen.findAllByText('Copied!')).not.toHaveLength(0)
  expect(writeText).toHaveBeenCalledWith('ABC123')
})

test('the leader can change the badge; members cannot', async () => {
  const mine = memberOf(season())
  vi.mocked(getMyClan).mockResolvedValue(mine)
  vi.mocked(changeBadge).mockResolvedValue({ ...mine.clan!, badge: { emoji: '🦉', color: '#4cd08a' } })
  const { unmount } = render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Change badge' }))
  fireEvent.click(await screen.findByRole('radio', { name: '🦉' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Green' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save badge' }))
  await waitFor(() => expect(changeBadge).toHaveBeenCalledWith({ emoji: '🦉', color: '#4cd08a' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save badge' })).toBeNull())
  unmount()
  vi.mocked(getMyClan).mockResolvedValue({ ...mine, clan: { ...mine.clan!, is_leader: false } })
  render(tree)
  expect(await screen.findByRole('heading', { name: /Foxes/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Change badge' })).toBeNull()
})
