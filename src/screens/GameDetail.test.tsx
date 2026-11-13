import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GameDetail } from './GameDetail'
import { ApiError } from '../api/client'
import type { GameDetail as Detail } from '../api/types'
import { getMyGameDetail } from '../games/api'
import { setLang, t } from '../i18n'

vi.mock('../games/api', () => ({ getMyGameDetail: vi.fn() }))

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
  expect(await screen.findByText(t('arena.match.notFound'))).toBeInTheDocument()
})

test('shows an error state with retry for other failures', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValueOnce(new ApiError(500, 'boom'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: t('room.retry') }))
  expect(await screen.findByText('Ann:')).toBeInTheDocument()
})
