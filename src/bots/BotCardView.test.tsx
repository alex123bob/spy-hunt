import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BotCardView } from './BotCardView'
import { setLang } from '../i18n'

const base = { name: 'Bo', avatar: { emoji: '🦊', color: '#fff' } }
const outfit = { voice: 'dry', style: 'vague', quirk: 'agree' }

afterEach(() => setLang('en'))

test('renders rule lines in order', () => {
  setLang('en')
  render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [{ when: 'accused', do: 'counter_accuse' }, { when: 'late_game', do: 'go_vague' }] } }} />)
  const lines = screen.getAllByText(/^When .*→/).map((e) => e.textContent)
  expect(lines).toEqual(['When I am accused → counter-accuse', 'When it is late in the game → go vague'])
})

test('no rules, no heading', () => {
  setLang('en')
  render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [] } }} />)
  expect(screen.queryByText('Rule cards')).toBeNull()
})

test('Chinese rule line wraps', () => {
  setLang('zh-Hans')
  render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [{ when: 'late_game', do: 'vote_leader' }] } }} />)
  expect(screen.getByText(/^当/).closest('.wrap')).not.toBeNull()
})

const plain = { ...base, outfit: { ...outfit, rules: [] } }

test('shows remix credit link and count', () => {
  setLang('en')
  render(<MemoryRouter><BotCardView bot={{ ...plain, remix_of: { id: 'abc', name: 'Mochi' }, remixes: 3 }} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Remixed from Mochi' }).getAttribute('href')).toBe('/bot/abc')
  expect(screen.getByText('Remixes: 3')).toBeTruthy()
})

test('shows no credit lines when not remixed', () => {
  setLang('en')
  render(<MemoryRouter><BotCardView bot={{ ...plain, remix_of: null, remixes: 0 }} /></MemoryRouter>)
  render(<MemoryRouter><BotCardView bot={plain} /></MemoryRouter>)
  expect(screen.queryByText(/Remixed/)).toBeNull()
})

test('arena line shows only with arena games', () => {
  setLang('en')
  const { rerender } = render(<BotCardView bot={{ ...plain, arena_record: { games: 3, wins: 2, spy_games: 1, spy_wins: 0 } }} />)
  expect(screen.getByText('Arena: 3 games · 2 wins')).toBeInTheDocument()
  rerender(<BotCardView bot={{ ...plain, arena_record: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 } }} />)
  expect(screen.queryByText(/^Arena:/)).toBeNull()
})

test('shows mind lines in both locales and defaults when absent', () => {
  setLang('en')
  const { unmount } = render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [], think: 'deep', form: 'rhyme', words: 5, suspicion: 2, reaction: 'deflect', vote: 'odd_one_out' } }} />)
  expect(screen.getByText('Thinking: Deep')).toBeInTheDocument()
  expect(screen.getByText('Voting: Odd one out')).toBeInTheDocument()
  expect(screen.getByText('Clue form: Rhyme')).toBeInTheDocument()
  expect(screen.getByText('Wordiness: 5')).toBeInTheDocument()
  unmount()
  render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [] } }} />)
  expect(screen.getByText('Thinking: Instinct')).toBeInTheDocument()
  expect(screen.getByText('Voting: Follow the evidence')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('undefined')
  setLang('zh-Hans')
})

test('mind lines in Chinese', () => {
  setLang('zh-Hans')
  render(<BotCardView bot={{ ...base, outfit: { ...outfit, rules: [], think: 'deep', vote: 'cover' } }} />)
  expect(screen.getByText('思考方式：深思熟虑')).toBeInTheDocument()
  expect(screen.getByText('投票方式：打掩护')).toBeInTheDocument()
})
