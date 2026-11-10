import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MatchPage } from './MatchPage'
import { ApiError } from '../api/client'
import type { MatchView } from '../api/types'
import { getMatch } from '../bots/api'
import { setLang } from '../i18n'

vi.mock('../bots/api', () => ({ getMatch: vi.fn() }))

const match = (): MatchView => ({
  id: 'm1', day: '2026-11-10', lang: 'en',
  players: [
    { seat: 0, name: 'Alice', avatar: { emoji: '🐼', color: '#222222' }, bot_id: 'bot00001', role: 'civilian', is_custom: true },
    { seat: 1, name: 'Bob', avatar: null, bot_id: null, role: 'spy', is_custom: false },
    { seat: 2, name: 'Cy', avatar: null, bot_id: null, role: 'civilian', is_custom: false },
  ],
  rounds: [
    {
      round: 1,
      statements: [{ seat: 1, stage: 0, text: 'bob says' }, { seat: 0, stage: 0, text: 'alice says' }],
      votes: [{ voter: 0, target: 1, stage: 0 }, { voter: 1, target: null, stage: 0 }],
      eliminated: null,
    },
    {
      round: 2,
      statements: [{ seat: 0, stage: 0, text: 'a2' }, { seat: 2, stage: 1, text: 't2' }, { seat: 1, stage: 1, text: 't1' }],
      votes: [{ voter: 2, target: 0, stage: 0 }, { voter: 2, target: 1, stage: 1 }],
      eliminated: 1,
    },
  ],
  words: { civilian: 'tea', spy: 'coffee' }, winner: 'civilians',
})

const tree = (
  <MemoryRouter initialEntries={['/match/m1']}>
    <Routes><Route path="/match/:id" element={<MatchPage />} /></Routes>
  </MemoryRouter>
)

beforeEach(() => {
  setLang('en')
  vi.mocked(getMatch).mockReset().mockResolvedValue(match())
})

test('renders rounds in order and the reveal last', async () => {
  const { container } = render(tree)
  expect(await screen.findByRole('heading', { name: 'Arena match' })).toBeInTheDocument()
  expect(getMatch).toHaveBeenCalledWith('m1')
  const text = container.textContent ?? ''
  const order = ['Round 1', 'Bob: bob says', 'Alice: alice says', 'Alice voted for Bob', 'Bob did not vote',
    'Nobody was voted out.', 'Round 2', 'Alice: a2', 'Cy voted for Alice', 'Tiebreak', 'Cy: t2', 'Bob: t1', 'Cy voted for Bob', 'Bob was voted out.', 'Reveal']
  const idx = order.map((s) => text.indexOf(s))
  expect(idx.every((i) => i >= 0)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  const reveal = text.indexOf('Reveal')
  expect(text.slice(0, reveal)).not.toMatch(/Spy|Civilian/i)
  expect(text.slice(reveal)).toMatch(/Bob.*Spy/)
  expect(text.slice(reveal)).toContain('Civilians: tea · Spy: coffee')
  expect(text.slice(reveal)).toContain('The civilians won.')
})

test('custom bot name links to its page', async () => {
  render(tree)
  const links = await screen.findAllByRole('link', { name: 'Alice' })
  expect(links[0]).toHaveAttribute('href', '/bot/bot00001')
  expect(screen.queryByRole('link', { name: 'Bob' })).toBeNull()
})

test('tiebreak label appears once per round', async () => {
  render(tree)
  expect(await screen.findAllByText('Tiebreak')).toHaveLength(1)
})

test('abstain vote text', async () => {
  render(tree)
  expect(await screen.findByText('Bob did not vote')).toBeInTheDocument()
})

test('404 shows not found with home link', async () => {
  vi.mocked(getMatch).mockRejectedValue(new ApiError(404, 'x'))
  render(tree)
  expect(await screen.findByText('Match not found')).toBeInTheDocument()
  expect(screen.getByText('It may have been cleared after 14 days.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
})

test('failure shows error and retry reloads', async () => {
  vi.mocked(getMatch).mockRejectedValueOnce(new Error('net'))
  render(tree)
  expect(await screen.findByText('Could not load this match.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Arena match' })).toBeInTheDocument()
  expect(getMatch).toHaveBeenCalledTimes(2)
})

test('zh-Hans labels', async () => {
  setLang('zh-Hans')
  render(tree)
  expect(await screen.findByRole('heading', { name: '竞技场对局' })).toBeInTheDocument()
  expect(screen.getByText('第 1 轮')).toBeInTheDocument()
  expect(screen.getByText('揭晓')).toBeInTheDocument()
  expect(screen.getByText('卧底获胜。'.replace('卧底', '平民'))).toBeInTheDocument()
})
