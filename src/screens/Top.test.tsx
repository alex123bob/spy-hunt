import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Top } from './Top'
import type { TopBot } from '../api/types'
import { getTopBots } from '../bots/api'
import { setLang } from '../i18n'

vi.mock('../bots/api', () => ({ getTopBots: vi.fn() }))

const mk = (rank: number, id: string, name: string, rate: number): TopBot => ({
  rank, id, name, avatar: { emoji: '🐼', color: '#222222' }, rate, games: 12, remixes: 3,
})
const tree = <MemoryRouter><Top /></MemoryRouter>

beforeEach(() => {
  setLang('en')
  vi.mocked(getTopBots).mockReset().mockResolvedValue([mk(1, 'aaaaaaaa', 'Alpha', 75), mk(2, 'bbbbbbbb', 'Beta', 60)])
})

test('rows appear in order with rate and games', async () => {
  render(tree)
  expect(await screen.findByText('Alpha')).toBeInTheDocument()
  expect(getTopBots).toHaveBeenCalledWith('winners')
  expect(screen.getByText('75% · 12 ranked games · remixed 3×')).toBeInTheDocument()
  const names = screen.getAllByText(/Alpha|Beta/).map((e) => e.textContent)
  expect(names).toEqual(['Alpha', 'Beta'])
  expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/bot/aaaaaaaa')
  expect(screen.getByRole('tab', { name: 'Top winners' })).toHaveAttribute('aria-selected', 'true')
})

test('spies tab loads its list', async () => {
  render(tree)
  await screen.findByText('Alpha')
  vi.mocked(getTopBots).mockResolvedValue([mk(1, 'cccccccc', 'Gamma', 80)])
  fireEvent.click(screen.getByRole('tab', { name: 'Best spies' }))
  expect(await screen.findByText('Gamma')).toBeInTheDocument()
  expect(getTopBots).toHaveBeenLastCalledWith('spies')
  expect(screen.getByRole('tab', { name: 'Best spies' })).toHaveAttribute('aria-selected', 'true')
})

test('empty list shows empty text and hint', async () => {
  vi.mocked(getTopBots).mockResolvedValue([])
  render(tree)
  expect(await screen.findByText(/No ranked bots yet/)).toBeInTheDocument()
  expect(screen.getByText('Ranked games need 3+ people in the room.')).toBeInTheDocument()
})

test('error shows alert and retry reloads', async () => {
  vi.mocked(getTopBots).mockRejectedValueOnce(new Error('x'))
  render(tree)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the board.')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Alpha')).toBeInTheDocument()
})

test('zh-Hans labels', async () => {
  setLang('zh-Hans')
  render(tree)
  await waitFor(() => expect(screen.getByRole('tab', { name: '最强赢家' })).toBeInTheDocument())
  expect(screen.getByRole('tab', { name: '最佳卧底' })).toBeInTheDocument()
})
