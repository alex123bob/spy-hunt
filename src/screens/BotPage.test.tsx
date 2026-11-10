import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BotPage } from './BotPage'
import { ApiError } from '../api/client'
import type { BotCard } from '../api/types'
import { getBotCard, listMyBots } from '../bots/api'
import { shareResult } from '../daily/share'
import { setLang } from '../i18n'

vi.mock('../bots/api', () => ({ getBotCard: vi.fn(), listMyBots: vi.fn() }))
vi.mock('../state/session', () => ({ getSession: vi.fn(() => ({ playerId: 'p1', token: 't', lang: 'en', name: '' })) }))
vi.mock('../daily/share', async (orig) => ({ ...(await orig<typeof import('../daily/share')>()), shareResult: vi.fn() }))

const card = (over: Partial<BotCard> = {}): BotCard => ({
  id: 'abc12345', name: 'Captain Pip', avatar: { emoji: '🦊', color: '#f00' },
  outfit: { voice: 'pirate', style: 'metaphor', quirk: 'question', rules: [] },
  record: { games: 12, wins: 7, spy_games: 5, spy_wins: 3 }, remix_of: null, remixes: 0, remixable: true, ranked: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }, listed: false, ...over,
})
function Where() {
  const l = useLocation()
  return <p>at {l.pathname}{l.search}</p>
}
const tree = (
  <MemoryRouter initialEntries={['/bot/abc12345']}>
    <Routes><Route path="/bot/:id" element={<BotPage />} /><Route path="/bots" element={<Where />} /></Routes>
  </MemoryRouter>
)

beforeEach(() => {
  setLang('en')
  vi.mocked(getBotCard).mockReset().mockResolvedValue(card())
  vi.mocked(listMyBots).mockReset().mockResolvedValue([])
  vi.mocked(shareResult).mockReset()
})

test('renders the card and record', async () => {
  render(tree)
  expect(await screen.findByText('Captain Pip')).toBeInTheDocument()
  expect(screen.getByText('Voice: Pirate')).toBeInTheDocument()
  expect(screen.getByText('Style: Metaphor')).toBeInTheDocument()
  expect(screen.getByText('Quirk: Ends with a question')).toBeInTheDocument()
  expect(screen.getByText('12 games · 7 wins · fooled the table 3 times')).toBeInTheDocument()
})

test('zero games renders zeros', async () => {
  vi.mocked(getBotCard).mockResolvedValue(card({ record: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 } }))
  render(tree)
  expect(await screen.findByText('0 games · 0 wins · fooled the table 0 times')).toBeInTheDocument()
})

test.each([['copied', 'Copied'], ['failed', 'Could not share.']] as const)('copy link %s', async (r, text) => {
  vi.mocked(shareResult).mockResolvedValue(r)
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
  expect(await screen.findByText(text)).toBeInTheDocument()
  expect(shareResult).toHaveBeenCalledWith(window.location.href)
})

test('404 shows not found, network error shows generic', async () => {
  vi.mocked(getBotCard).mockRejectedValue(new ApiError(404, 'not_found'))
  const { unmount } = render(tree)
  expect(await screen.findByText('Bot not found')).toBeInTheDocument()
  expect(screen.queryByText('Voice: Pirate')).toBeNull()
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  unmount()
  vi.mocked(getBotCard).mockRejectedValue(new Error('net'))
  render(tree)
  expect(await screen.findByText('Could not load this bot.')).toBeInTheDocument()
})

test('Edit only for own bots', async () => {
  vi.mocked(listMyBots).mockResolvedValue([card()])
  const { unmount } = render(tree)
  expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/bots')
  unmount()
  vi.mocked(listMyBots).mockRejectedValue(new Error('x'))
  render(tree)
  await screen.findByText('Captain Pip')
  expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
})

test('long wide name wraps; Chinese copy', async () => {
  const name = '宽宽宽宽宽宽宽宽宽宽宽宽宽宽宽宽'
  vi.mocked(getBotCard).mockResolvedValue(card({ name }))
  setLang('zh-Hans')
  render(tree)
  expect(await screen.findByText(name)).toHaveClass('wrap')
  expect(screen.getByText('12 局 · 7 胜 · 骗过全桌 3 次')).toBeInTheDocument()
  expect(screen.getByText('声音：海盗')).toBeInTheDocument()
})

test('shows the rule lines', async () => {
  vi.mocked(getBotCard).mockResolvedValue(card({ outfit: { voice: 'pirate', style: 'metaphor', quirk: 'question', rules: [{ when: 'accused', do: 'go_vague' }] } }))
  render(tree)
  expect(await screen.findByText('When I am accused → go vague')).toBeInTheDocument()
})

test('Remix shows for a non-owner and goes to the remix form', async () => {
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Remix' }))
  expect(await screen.findByText('at /bots?remix=abc12345')).toBeInTheDocument()
})

test('Remix is absent for the owner and for non-remixable bots', async () => {
  vi.mocked(listMyBots).mockResolvedValue([card()])
  const { unmount } = render(tree)
  await screen.findByRole('link', { name: 'Edit' })
  expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull()
  unmount()
  vi.mocked(listMyBots).mockResolvedValue([])
  vi.mocked(getBotCard).mockResolvedValue(card({ remixable: false }))
  render(tree)
  await screen.findByText('Captain Pip')
  expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull()
})

test('with 3 bots the limit text replaces Remix', async () => {
  vi.mocked(listMyBots).mockResolvedValue([card({ id: 'x1' }), card({ id: 'x2' }), card({ id: 'x3' })])
  render(tree)
  expect(await screen.findByText('You can have up to 3 bots.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull()
})
