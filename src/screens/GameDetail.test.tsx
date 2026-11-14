import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GameDetail } from './GameDetail'
import { ApiError } from '../api/client'
import type { GameDetail as Detail } from '../api/types'
import { getMyGameDetail, getMyGameReplay } from '../games/api'
import { setLang, t } from '../i18n'

vi.mock('../games/api', () => ({ getMyGameDetail: vi.fn(), getMyGameReplay: vi.fn() }))

const detail = (): Detail => ({
  finished_at: 0, winner: 'civilians', lang: 'en',
  words: { civilian: { en: 'apple' }, spy: { en: 'pear' } },
  roles: [
    { seat: 1, role: 'civilian', is_bot: false, name: 'Ann', is_you: true, credits_earned: 20, credit_parts: [{ kind: 'played', n: 10 }, { kind: 'won', n: 10 }] },
    { seat: 2, role: 'spy', is_bot: false, name: 'Bob', is_you: false },
  ],
})

const tree = (
  <MemoryRouter initialEntries={['/games/r1/1']}>
    <Routes><Route path="/games/:roomId/:gameNo" element={<GameDetail />} /></Routes>
  </MemoryRouter>
)

beforeEach(() => {
  setLang('en')
  vi.mocked(getMyGameDetail).mockReset().mockResolvedValue(detail())
  vi.mocked(getMyGameReplay).mockReset().mockRejectedValue(new ApiError(404, 'not_found'))
})

test('renders every seat, the words, and the winner banner on success', async () => {
  render(tree)
  expect(await screen.findByText('Ann:')).toBeInTheDocument()
  expect(screen.getByText('Bob:')).toBeInTheDocument()
  expect(getMyGameDetail).toHaveBeenCalledWith('r1', 1)
  expect(screen.getByText('Civilians: apple · Spy: pear')).toBeInTheDocument()
  expect(screen.getByText(t('arena.match.winner.civilians'))).toBeInTheDocument()
})

test('shows a not-found state for an unknown game', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValue(new ApiError(404, 'not_found'))
  render(tree)
  expect(await screen.findByText(t('profile.gameDetail.notFound'))).toBeInTheDocument()
})

test('shows an error state with retry for other failures', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValueOnce(new ApiError(500, 'boom'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: t('room.retry') }))
  expect(await screen.findByText('Ann:')).toBeInTheDocument()
})

test('uses recap-specific copy, not the arena match wording, for not-found and error', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValue(new ApiError(404, 'not_found'))
  const { unmount } = render(tree)
  expect(await screen.findByText(t('profile.gameDetail.notFound'))).toBeInTheDocument()
  unmount()
  vi.mocked(getMyGameDetail).mockRejectedValue(new ApiError(500, 'boom'))
  render(tree)
  expect(await screen.findByText(t('profile.gameDetail.error'))).toBeInTheDocument()
})

test('a non-numeric game number is not found without calling the server', async () => {
  render(
    <MemoryRouter initialEntries={['/games/r1/abc']}>
      <Routes><Route path="/games/:roomId/:gameNo" element={<GameDetail />} /></Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText(t('profile.gameDetail.notFound'))).toBeInTheDocument()
  expect(getMyGameDetail).not.toHaveBeenCalled()
})

test('shows the words in the viewer language when the game has it', async () => {
  vi.mocked(getMyGameDetail).mockResolvedValue({
    ...detail(), lang: 'en',
    words: { civilian: { en: 'apple', 'zh-Hans': '苹果' }, spy: { en: 'pear', 'zh-Hans': '梨' } },
  })
  setLang('zh-Hans')
  render(tree)
  expect(await screen.findByText(t('arena.match.words', { civilian: '苹果', spy: '梨' }))).toBeInTheDocument()
})

test('hides the words line when the game had no word pair', async () => {
  vi.mocked(getMyGameDetail).mockResolvedValue({ ...detail(), words: {} as never })
  const { container } = render(tree)
  await screen.findByText('Ann:')
  expect(container.textContent).not.toContain('Civilians:')
})

test('shows a replay section with statements and votes when a replay exists', async () => {
  vi.mocked(getMyGameReplay).mockResolvedValue({
    players: [{ seat: 0, name: 'Alice', is_bot: false, role: 'civilian', is_you: true }],
    rounds: [{
      round: 1,
      statements: [{ seat: 0, stage: 0, kind: 'statement', text: 'hi there', lang: 'en', translations: {} }],
      votes: [{ voter: 0, target: null, stage: 0 }],
      eliminated: null,
    }],
    words: { civilian: { en: 'tea' }, spy: { en: 'coffee' } },
    winner: 'civilians',
  })
  render(tree)
  expect(await screen.findByText('hi there')).toBeTruthy()
})

test('renders without a replay section when no replay exists (404)', async () => {
  render(tree)
  expect(await screen.findByText('Ann:')).toBeTruthy()
  expect(screen.queryByText('hi there')).toBeNull()
})

test('renders a host statement (null seat) without crashing', async () => {
  vi.mocked(getMyGameReplay).mockResolvedValue({
    players: [{ seat: 0, name: 'Alice', is_bot: false, role: 'civilian', is_you: true }],
    rounds: [{
      round: 1,
      statements: [{ seat: null, stage: 0, kind: 'host', text: 'round begins', lang: 'en', translations: {} }],
      votes: [],
      eliminated: null,
    }],
    words: { civilian: { en: 'tea' }, spy: { en: 'coffee' } },
    winner: 'civilians',
  })
  render(tree)
  expect(await screen.findByText('round begins')).toBeTruthy()
})
