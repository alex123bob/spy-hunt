import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Result } from './Result'
import type { Role, Snapshot } from '../api/types'
import { shareResult } from '../daily/share'
import { setLang } from '../i18n'
import { player, snap } from '../test/fixtures'

vi.mock('../daily/share', () => ({ shareResult: vi.fn() }))

const WORDS = { civilian: { en: 'piano', 'zh-Hans': '钢琴' }, spy: { en: 'organ', 'zh-Hans': '风琴' } }

function finished(over: { me?: Role; winner?: Snapshot['winner']; host?: boolean; spyName?: string } = {}): Snapshot {
  const me = over.me ?? 'civilian'
  return snap({
    status: 'finished', phase: null, round: 2,
    winner: over.winner === undefined ? 'civilians' : over.winner,
    words: WORDS,
    me: { seat: 1, is_host: over.host ?? false, my_word: null },
    players: [
      player(0, { name: 'Ann', role: 'civilian' }),
      player(1, { name: 'Bob', role: me }),
      player(2, { name: over.spyName ?? 'Finn', role: me === 'spy' ? 'civilian' : 'spy' }),
      player(3, { name: 'Cleo', role: 'civilian' }),
    ],
  })
}

const view = (s: Snapshot) => render(<MemoryRouter><Result state={s} /></MemoryRouter>)

beforeEach(() => {
  setLang('en')
  vi.mocked(shareResult).mockReset()
})

test('shows You won for the winning viewer and You lost for the losing one', () => {
  view(finished())
  expect(screen.getByText('You won! 🎉')).toBeInTheDocument()
  view(finished({ winner: 'spies' }))
  expect(screen.getByText('You lost')).toBeInTheDocument()
})

test('shows Game ended and no share button when winner is null', () => {
  view(finished({ winner: null }))
  expect(screen.getByText('Game ended')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  expect(screen.queryByText(/Civilians win/)).toBeNull()
  expect(screen.queryByText(/You (won|lost)/)).toBeNull()
})

test('shows the viewer role and word', () => {
  view(finished())
  expect(screen.getByText('Your role: Civilian')).toBeInTheDocument()
  expect(screen.getByText('Your word: piano')).toBeInTheDocument()
})

test('the spy panel names the spy and the spy word', () => {
  view(finished())
  const panel = screen.getByTestId('spy-panel')
  expect(within(panel).getByText('The spy')).toBeInTheDocument()
  expect(within(panel).getByText('Finn')).toBeInTheDocument()
  expect(within(panel).getByText('organ')).toBeInTheDocument()
})

test('two spies use the plural heading', () => {
  const s = finished()
  s.players[3] = { ...s.players[3], role: 'spy' }
  view(s)
  expect(within(screen.getByTestId('spy-panel')).getByText('The spies')).toBeInTheDocument()
})

test('share preview shows the card text', () => {
  view(finished())
  expect(screen.getByTestId('share-preview').textContent).toBe(
    `Spy Hunt 🕵️ Civilians won in round 2\nSpy: Finn (organ) · You: civilian ✅\n${window.location.origin}/`,
  )
  expect(screen.getByText('Rounds played: 2')).toBeInTheDocument()
})

test('share button reports Copied', async () => {
  vi.mocked(shareResult).mockResolvedValue('copied')
  view(finished())
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(await screen.findByText('Copied')).toBeInTheDocument()
  expect(shareResult).toHaveBeenCalledWith(screen.getByTestId('share-preview').textContent)
})

test('share failure shows a message instead of throwing', async () => {
  vi.mocked(shareResult).mockResolvedValue('failed')
  view(finished())
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(await screen.findByText('Could not share.')).toBeInTheDocument()
})

test('a very long name wraps', () => {
  const long = 'Bartholomew-the-Extremely-Long-Name'
  view(finished({ spyName: long }))
  for (const el of screen.getAllByText(long)) expect(el).toHaveClass('wrap')
})

test('host sees Play again, others see waiting', () => {
  view(finished({ host: true }))
  expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
  view(finished({ host: false }))
  expect(screen.getByText('Waiting for the host to start a rematch…')).toBeInTheDocument()
})

test('the words panel still shows both words, so a spy learns the civilian word', () => {
  view(finished({ me: 'spy', winner: 'spies' }))
  const panel = screen.getByTestId('words-panel')
  expect(within(panel).getByText((_, el) => el?.textContent === 'Civilian: piano / 钢琴')).toBeInTheDocument()
  expect(within(panel).getByText((_, el) => el?.textContent === 'Spy: organ / 风琴')).toBeInTheDocument()
})
