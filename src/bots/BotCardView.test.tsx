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
  const lines = screen.getAllByText(/^When /).map((e) => e.textContent)
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
  expect(screen.getByText('Remixed 3 times')).toBeTruthy()
})

test('shows no credit lines when not remixed', () => {
  setLang('en')
  render(<MemoryRouter><BotCardView bot={{ ...plain, remix_of: null, remixes: 0 }} /></MemoryRouter>)
  render(<MemoryRouter><BotCardView bot={plain} /></MemoryRouter>)
  expect(screen.queryByText(/Remixed/)).toBeNull()
})
