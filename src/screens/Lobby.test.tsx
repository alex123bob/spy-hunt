import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react'
import { Lobby } from './Lobby'
import { setLang, getLang } from '../i18n'
import type { Snapshot } from '../api/types'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn().mockResolvedValue({}) }
})
import { request } from '../api/client'
vi.mock('../bots/api', () => ({ listMyBots: vi.fn() }))
import { listMyBots } from '../bots/api'

function snap(isHost: boolean): Snapshot {
  return {
    code: 'ABCD', status: 'lobby', phase: null, phase_deadline: null, round: 0, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0,
    players: [
      { seat: 0, name: 'Host', lang: 'en', is_bot: false, alive: true, connected: true, is_host: true },
      { seat: 1, name: 'Zed', lang: 'en', is_bot: false, alive: true, connected: true, is_host: false },
      { seat: 2, name: 'Milo', lang: 'en', is_bot: true, alive: true, connected: true, is_host: false },
    ],
    messages: [], current_speaker: null, me: { seat: isHost ? 0 : 1, is_host: isHost, my_word: null },
    winner: null, last_seq: 1, server_time: 0,
  }
}

const mine = (id: string, name = id) => ({ id, name, avatar: { emoji: '🦊', color: '#fff' }, outfit: { voice: 'dry', style: 'brief', quirk: 'emoji', rules: [] }, record: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 } })

beforeEach(() => {
  setLang('en')
  vi.mocked(request).mockClear()
  vi.mocked(listMyBots).mockReset()
  vi.mocked(listMyBots).mockResolvedValue([])
})

test('Start button is absent for a non-host and present for the host', () => {
  const { unmount } = render(<Lobby state={snap(false)} />)
  expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull()
  unmount()
  render(<Lobby state={snap(true)} />)
  expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
})

test('invite link text equals origin/r/CODE', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.getByTestId('invite-link')).toHaveTextContent(`${window.location.origin}/r/ABCD`)
})

test('bots are labelled and switching language updates strings immediately', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.getByText('Bot')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Your language' })).getByRole('radio', { name: '简体中文' }))
  expect(getLang()).toBe('zh-Hans')
  expect(screen.getByRole('button', { name: '开始游戏' })).toBeInTheDocument()
  expect(request).toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', { lang: 'zh-Hans' })
})

function withBots(isHost: boolean, extra: Snapshot['players']): Snapshot {
  const s = snap(isHost)
  return { ...s, players: [...s.players, ...extra] }
}
const botP = (seat: number, bot_id: string, name: string) =>
  ({ seat, name, lang: 'en', is_bot: true, alive: true, connected: true, is_host: false, bot_id, avatar: { emoji: '🐙', color: '#abc' } }) as Snapshot['players'][number]

test('a member with bots sees Add my bot; with none, no button', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  const { unmount } = render(<Lobby state={snap(false)} />)
  expect(await screen.findByRole('button', { name: 'Add my bot' })).toBeEnabled()
  unmount()
  vi.mocked(listMyBots).mockResolvedValue([])
  render(<Lobby state={snap(false)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: 'Add my bot' })).toBeNull()
})

test('listMyBots failing leaves the lobby usable with no alert', async () => {
  vi.mocked(listMyBots).mockRejectedValue(new Error('boom'))
  render(<Lobby state={snap(true)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add bot' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('picking a bot posts add with its id and closes the list', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<Lobby state={snap(false)} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add my bot' }))
  fireEvent.click(screen.getByRole('button', { name: /Rex/ }))
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add', bot_id: 'b1' })
  await waitFor(() => expect(screen.queryByRole('button', { name: /Sue/ })).toBeNull())
})

test('Add my bot is disabled once my bot is in the room, and room bots are not offered', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={withBots(false, [botP(3, 'b1', 'Rex')])} />)
  expect(await screen.findByRole('button', { name: 'Add my bot' })).toBeDisabled()
})

test('the picker offers each of my bots when none is in the room', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<Lobby state={withBots(false, [botP(3, 'b9', 'Other')])} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add my bot' }))
  expect(screen.getByRole('button', { name: /Rex/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Sue/ })).toBeInTheDocument()
})

test('only my bot chip has Remove, posting remove with the seat', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={withBots(false, [botP(4, 'b1', 'Rex'), botP(5, 'b9', 'Other')])} />)
  const rm = await screen.findAllByRole('button', { name: 'Remove' })
  expect(rm).toHaveLength(1)
  fireEvent.click(rm[0])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('the host can remove any bot by seat, a non-host only their own', async () => {
  vi.mocked(listMyBots).mockResolvedValue([])
  render(<Lobby state={withBots(true, [botP(4, 'b9', 'Other')])} />)
  const rm = await screen.findAllByRole('button', { name: 'Remove' })
  expect(rm).toHaveLength(2)
  fireEvent.click(rm[1])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('a bot player shows its avatar emoji', () => {
  render(<Lobby state={withBots(false, [botP(4, 'b9', 'Other')])} />)
  expect(screen.getByText('🐙')).toBeInTheDocument()
})
