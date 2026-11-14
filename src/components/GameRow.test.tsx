import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GameDetail, GameSummary } from '../api/types'
import { getMyGameDetail } from '../games/api'
import { setLang, t } from '../i18n'
import { GameRow } from './GameRow'

vi.mock('../games/api', () => ({ getMyGameDetail: vi.fn() }))

const game: GameSummary = { room_id: 'r1', game_no: 1, finished_at: 1_794_398_400_000, winner: 'spies', your_role: 'spy', won: true, credits_earned: 12 }
const detail: GameDetail = {
  finished_at: game.finished_at,
  winner: 'spies',
  lang: 'en',
  words: { civilian: { en: 'Coffee' }, spy: { en: 'Tea' } },
  roles: [
    { seat: 0, role: 'spy', is_bot: false, name: 'Mei', is_you: true, credits_earned: 12, credit_parts: [{ kind: 'won', n: 12 }] },
    { seat: 1, role: 'civilian', is_bot: true, name: 'Kai', is_you: false },
  ],
}

const renderRow = (g: GameSummary = game) =>
  render(<MemoryRouter><ol><GameRow game={g} /></ol></MemoryRouter>)
const toggle = () => screen.getByRole('button', { expanded: undefined, name: new RegExp(t('arena.role.spy')) })

beforeEach(() => {
  setLang('en')
  vi.mocked(getMyGameDetail).mockReset()
  vi.mocked(getMyGameDetail).mockResolvedValue(detail)
})

test('is collapsed by default and makes no request', () => {
  renderRow()
  expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  expect(getMyGameDetail).not.toHaveBeenCalled()
})

test('opening fetches once and shows the recap; reopening does not refetch', async () => {
  renderRow()
  fireEvent.click(toggle())
  expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  await screen.findByRole('link', { name: t('profile.game.fullRecap') })
  expect(getMyGameDetail).toHaveBeenCalledTimes(1)
  expect(getMyGameDetail).toHaveBeenCalledWith('r1', 1)
  fireEvent.click(toggle())
  expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle())
  expect(screen.getByRole('link', { name: t('profile.game.fullRecap') })).toBeInTheDocument()
  expect(getMyGameDetail).toHaveBeenCalledTimes(1)
})

test('a failed fetch shows an error in the row and Retry refetches', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValueOnce(new Error('boom'))
  renderRow()
  fireEvent.click(toggle())
  await screen.findByText(t('profile.game.error'))
  fireEvent.click(screen.getByRole('button', { name: t('room.retry') }))
  await screen.findByRole('link', { name: t('profile.game.fullRecap') })
  expect(getMyGameDetail).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(t('profile.game.error'))).toBeNull()
})

test('shows a loading line while the detail is in flight', async () => {
  let resolve!: (d: GameDetail) => void
  vi.mocked(getMyGameDetail).mockReturnValue(new Promise((r) => { resolve = r }))
  renderRow()
  fireEvent.click(toggle())
  expect(screen.getByText(t('profile.game.loading'))).toBeInTheDocument()
  resolve(detail)
  await waitFor(() => expect(screen.queryByText(t('profile.game.loading'))).toBeNull())
})

test('a game with no winner shows Draw wording and never Lost', () => {
  renderRow({ ...game, winner: null, won: null, credits_earned: 0 })
  const btn = screen.getByRole('button')
  expect(btn.textContent).toContain(t('profile.gameOutcome.none', { credits: 0 }))
  expect(btn.textContent).toContain(t('profile.game.winner.none'))
  expect(btn.textContent).not.toContain('Lost')
})

test('the collapsed button shows outcome, your role, the winning side and the date', () => {
  renderRow()
  const text = toggle().textContent ?? ''
  expect(text).toContain(t('profile.gameOutcome.won', { credits: 12 }))
  expect(text).toContain(t('arena.role.spy'))
  expect(text).toContain(t('profile.game.winner.spies'))
  expect(text).toContain(new Date(game.finished_at).toLocaleString())
})
