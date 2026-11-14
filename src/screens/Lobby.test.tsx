import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Lobby } from './Lobby'
import { setLang, getLang } from '../i18n'
import type { Snapshot } from '../api/types'
import { ApiError } from '../api/client'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn().mockResolvedValue({}) }
})
import { request } from '../api/client'
vi.mock('../bots/api', () => ({ listMyBots: vi.fn() }))
import { listMyBots } from '../bots/api'
vi.mock('../state/accounts', async (orig) => ({ ...(await orig<typeof import('../state/accounts')>()), patchMyLang: vi.fn() }))
import { patchMyLang } from '../state/accounts'

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

const mine = (id: string, name = id) => ({ id, name, avatar: { emoji: '🦊', color: '#fff' }, outfit: { voice: 'dry', style: 'brief', quirk: 'emoji', rules: [] }, record: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }, remix_of: null, remixes: 0, remixable: true, ranked: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }, listed: false, arena: true, arena_record: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 } })

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
  act(() => setLang('zh-Hans'))
  expect(screen.getByRole('button', { name: '开始游戏' })).toBeInTheDocument()
})

test('a top-bar language change in the lobby syncs my seat language', () => {
  render(<Lobby state={snap(false)} />)
  act(() => setLang('zh-Hans'))
  expect(request).toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', { lang: 'zh-Hans' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(patchMyLang).not.toHaveBeenCalled()
})

test('nothing is sent when my language already matches my seat', () => {
  render(<Lobby state={snap(false)} />)
  expect(request).not.toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', expect.anything())
})

test('there is no Your language section', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.queryByText('Your language')).toBeNull()
  expect(screen.queryByRole('radiogroup')).toBeNull()
})

test('the host picks the room language from the players card header', () => {
  render(<Lobby state={snap(true)} />)
  const btn = screen.getByRole('button', { name: 'Room language: English' })
  expect(btn).toHaveTextContent('Room: English')
  fireEvent.click(btn)
  fireEvent.click(screen.getByRole('option', { name: '简体中文' }))
  expect(request).toHaveBeenCalledWith('PATCH', '/rooms/ABCD/settings', { main_lang: 'zh-Hans' })
  expect(request).not.toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', expect.anything())
  expect(patchMyLang).not.toHaveBeenCalled()
  expect(getLang()).toBe('en')
})

test('a non-host sees the room language as text, not a button', () => {
  render(<Lobby state={snap(false)} />)
  expect(screen.queryByRole('button', { name: /^Room language/ })).toBeNull()
  expect(screen.getByText('Room: English')).toBeInTheDocument()
})

test('when listMyBots fails, the host still gets Random bot and no alert', async () => {
  vi.mocked(listMyBots).mockRejectedValue(new Error('offline'))
  render(<Lobby state={snap(true)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: /Add a bot/ }))
  const items = screen.getAllByRole('menuitem')
  expect(items).toHaveLength(1)
  expect(items[0]).toHaveTextContent('Random bot')
  expect(screen.queryByRole('alert')).toBeNull()
})

function withBots(isHost: boolean, extra: Snapshot['players']): Snapshot {
  const s = snap(isHost)
  return { ...s, players: [...s.players, ...extra] }
}
const botP = (seat: number, bot_id: string, name: string) =>
  ({ seat, name, lang: 'en', is_bot: true, alive: true, connected: true, is_host: false, bot_id, avatar: { emoji: '🐙', color: '#abc' } }) as Snapshot['players'][number]

const full = (isHost: boolean): Snapshot => {
  const s = snap(isHost)
  return { ...s, config: { ...s.config, max_players: 3 } }
}

test('a full room shows the Full badge and no add row', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={full(true)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.getByText('Players (3/3)')).toBeInTheDocument()
  expect(screen.getByText('Full')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('a room with space shows no Full badge', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.queryByText('Full')).toBeNull()
})

test('the host adds a random bot from the add menu', async () => {
  render(<Lobby state={snap(true)} />)
  fireEvent.click(screen.getByRole('button', { name: /Add a bot/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Random bot/ }))
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add' })
  expect(screen.getByRole('menu')).toBeInTheDocument()
})

test('picking one of my bots posts add with its id', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<Lobby state={withBots(false, [botP(3, 'b9', 'Other')])} />)
  fireEvent.click(await screen.findByRole('button', { name: /Add a bot/ }))
  expect(screen.queryByRole('menuitem', { name: /Random bot/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: /Sue/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: /Rex/ }))
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add', bot_id: 'b1' })
})

test('with my bot seated, the add menu explains why and offers no bots', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<Lobby state={withBots(false, [botP(3, 'b1', 'Rex')])} />)
  fireEvent.click(await screen.findByRole('button', { name: /Add a bot/ }))
  expect(screen.getByText('Your bot Rex is already in this room. Remove it to add a different one.')).toBeInTheDocument()
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
})

test('a non-host without bots has no add row', async () => {
  render(<Lobby state={snap(false)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('only my bot chip has Remove, posting remove with the seat', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={withBots(false, [botP(4, 'b1', 'Rex'), botP(5, 'b9', 'Other')])} />)
  const rm = await screen.findAllByRole('button', { name: /Remove/ })
  expect(rm).toHaveLength(1)
  fireEvent.click(rm[0])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('the host can remove any bot by seat', async () => {
  render(<Lobby state={withBots(true, [botP(4, 'b9', 'Other')])} />)
  const rm = await screen.findAllByRole('button', { name: /Remove/ })
  expect(rm).toHaveLength(2)
  fireEvent.click(rm[1])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('there is no global Remove bot button', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.queryByRole('button', { name: 'Remove bot' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add bot' })).toBeNull()
})

test('per-seat Remove buttons are touch-sized and show a cross', () => {
  render(<Lobby state={snap(true)} />)
  const rm = screen.getByRole('button', { name: /Remove/ })
  expect(rm).toHaveClass('remove-btn')
  expect(rm).toHaveTextContent('✕ Remove')
})

test('a bot player shows its avatar emoji', () => {
  render(<Lobby state={withBots(false, [botP(4, 'b9', 'Other')])} />)
  expect(screen.getByText('🐙')).toBeInTheDocument()
})

const sized = (n: number, bot_fill: boolean): Snapshot => {
  const s = snap(true)
  const players = Array.from({ length: n }, (_, i) => ({ ...s.players[0], seat: i, is_host: i === 0, name: `P${i}` }))
  return { ...s, players, config: { ...s.config, bot_fill, min_players: 4 } }
}

test('fill hint shows when bots will be added, needMore without bot fill, nothing when enough', () => {
  const { unmount } = render(<Lobby state={sized(3, true)} />)
  expect(screen.getByText('At least 4 players are needed. 1 bot(s) will be added when you start.')).toBeInTheDocument()
  unmount()
  const u2 = render(<Lobby state={sized(3, false)} />)
  expect(screen.getByText('At least 4 players are needed to start.')).toBeInTheDocument()
  u2.unmount()
  render(<Lobby state={sized(4, true)} />)
  expect(screen.queryByText(/At least 4 players/)).toBeNull()
})

test('a failing call shows mapped text, not the server text', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError(409, 'bot_in_room', 'English server text'))
  render(<Lobby state={snap(true)} />)
  fireEvent.click(screen.getByRole('button', { name: /Add a bot/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Random bot/ }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('You already have a bot in this room.')
  expect(alert).not.toHaveTextContent('English server text')
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add' })
})
