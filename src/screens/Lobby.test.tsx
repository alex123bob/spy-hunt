import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Lobby } from './Lobby'
import { setLang, getLang } from '../i18n'
import type { Snapshot } from '../api/types'
import { ApiError } from '../api/client'
import { downloadCard, shareCard } from '../daily/share'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn().mockResolvedValue({}) }
})
import { request } from '../api/client'
vi.mock('../daily/share', () => ({ shareCard: vi.fn(), downloadCard: vi.fn(), drawCard: vi.fn() }))
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
  const { unmount } = render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull()
  unmount()
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
})

test('invite link text equals origin/r/CODE', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'QR code' }))
  expect(screen.getByText(`${window.location.origin}/r/ABCD`)).toBeInTheDocument()
})

test('bots are labelled and switching language updates strings immediately', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.getByText('Bot')).toBeInTheDocument()
  act(() => setLang('zh-Hans'))
  expect(screen.getByRole('button', { name: '开始游戏' })).toBeInTheDocument()
})

test('a top-bar language change in the lobby syncs my seat language', () => {
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  act(() => setLang('zh-Hans'))
  expect(request).toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', { lang: 'zh-Hans' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(patchMyLang).not.toHaveBeenCalled()
})

test('nothing is sent when my language already matches my seat', () => {
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  expect(request).not.toHaveBeenCalledWith('PATCH', '/rooms/ABCD/me', expect.anything())
})

test('there is no Your language section', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.queryByText('Your language')).toBeNull()
  expect(screen.queryByRole('radiogroup')).toBeNull()
})

test('the host picks the room language from the players card header', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
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
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: /^Room language/ })).toBeNull()
  expect(screen.getByText('Room: English')).toBeInTheDocument()
})

test('when listMyBots fails, the host still gets Random bot and no alert', async () => {
  vi.mocked(listMyBots).mockRejectedValue(new Error('offline'))
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
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
  render(<MemoryRouter><Lobby state={full(true)} /></MemoryRouter>)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.getByText('Players (3/3)')).toBeInTheDocument()
  expect(screen.getByText('Full')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('a room with space shows no Full badge', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.queryByText('Full')).toBeNull()
})

test('the host adds a random bot from the add menu', async () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Add a bot' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Random bot/ }))
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('picking one of my bots posts add with its id', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<MemoryRouter><Lobby state={withBots(false, [botP(3, 'b9', 'Other')])} /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Add a bot/ }))
  expect(screen.queryByRole('menuitem', { name: /Random bot/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: /Sue/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: /Rex/ }))
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add', bot_id: 'b1' })
})

test('with my bot seated, the add menu explains why and offers no bots', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex'), mine('b2', 'Sue')])
  render(<MemoryRouter><Lobby state={withBots(false, [botP(3, 'b1', 'Rex')])} /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Add a bot/ }))
  expect(screen.getByText('Your bot Rex is already in this room. Remove it to add a different one.')).toBeInTheDocument()
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
})

test('a non-host without bots has no add row', async () => {
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('only my bot chip has Remove, posting remove with the seat', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<MemoryRouter><Lobby state={withBots(false, [botP(4, 'b1', 'Rex'), botP(5, 'b9', 'Other')])} /></MemoryRouter>)
  const rm = await screen.findAllByRole('button', { name: /Remove/ })
  expect(rm).toHaveLength(1)
  fireEvent.click(rm[0])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('the host can remove any bot by seat', async () => {
  render(<MemoryRouter><Lobby state={withBots(true, [botP(4, 'b9', 'Other')])} /></MemoryRouter>)
  const rm = await screen.findAllByRole('button', { name: /Remove/ })
  expect(rm).toHaveLength(2)
  fireEvent.click(rm[1])
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'remove', seat: 4 })
})

test('there is no global Remove bot button', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Remove bot' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add bot' })).toBeNull()
})

test('per-seat Remove buttons are touch-sized and show a cross', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  const rm = screen.getByRole('button', { name: /Remove/ })
  expect(rm).toHaveClass('remove-btn')
  expect(rm).toHaveTextContent('✕ Remove')
})

test('a bot player shows its avatar emoji', () => {
  render(<MemoryRouter><Lobby state={withBots(false, [botP(4, 'b9', 'Other')])} /></MemoryRouter>)
  expect(screen.getByText('🐙')).toBeInTheDocument()
})

const sized = (n: number, bot_fill: boolean): Snapshot => {
  const s = snap(true)
  const players = Array.from({ length: n }, (_, i) => ({ ...s.players[0], seat: i, is_host: i === 0, name: `P${i}` }))
  return { ...s, players, config: { ...s.config, bot_fill, min_players: 4 } }
}

test('fill hint shows when bots will be added, needMore without bot fill, nothing when enough', () => {
  const { unmount } = render(<MemoryRouter><Lobby state={sized(3, true)} /></MemoryRouter>)
  expect(screen.getByText('At least 4 players are needed. 1 bot(s) will be added when you start.')).toBeInTheDocument()
  unmount()
  const u2 = render(<MemoryRouter><Lobby state={sized(3, false)} /></MemoryRouter>)
  expect(screen.getByText('At least 4 players are needed to start.')).toBeInTheDocument()
  u2.unmount()
  render(<MemoryRouter><Lobby state={sized(4, true)} /></MemoryRouter>)
  expect(screen.queryByText(/At least 4 players/)).toBeNull()
})

test('a failing call shows mapped text, not the server text', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError(409, 'bot_in_room', 'English server text'))
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Add a bot' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Random bot/ }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('You already have a bot in this room.')
  expect(alert).not.toHaveTextContent('English server text')
  expect(request).toHaveBeenCalledWith('POST', '/rooms/ABCD/bots', { action: 'add' })
})

test('the host sees an Add a bot pill in the header, next to Invite', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  const pill = screen.getByRole('button', { name: 'Add a bot' })
  expect(pill.closest('.lobby-share')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Invite' }).closest('.lobby-share')).toBe(pill.closest('.lobby-share'))
})

test('empty seats are plain placeholders, one per missing player', () => {
  const state = snap(true)
  render(<MemoryRouter><Lobby state={state} /></MemoryRouter>)
  const missing = state.config.min_players - state.players.length
  expect(screen.getAllByText('Empty seat')).toHaveLength(missing)
  expect(document.querySelector('.seat-cta')).toBeNull()
  expect(document.querySelectorAll('.seat button:not(.remove-btn)')).toHaveLength(0)
})

test('a non-host with no bots sees no pill', async () => {
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Add a bot' })).toBeNull()
})

test('a non-host who owns a bot sees the pill', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<MemoryRouter><Lobby state={snap(false)} /></MemoryRouter>)
  expect(await screen.findByRole('button', { name: 'Add a bot' })).toBeInTheDocument()
})

test('a full room has no pill at all', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<MemoryRouter><Lobby state={full(true)} /></MemoryRouter>)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Add a bot' })).toBeNull()
})

test('at min players (not full) the pill shows and no extra placeholder seat appears', () => {
  render(<MemoryRouter><Lobby state={sized(4, true)} /></MemoryRouter>)
  expect(screen.getByRole('button', { name: 'Add a bot' })).toBeInTheDocument()
  expect(screen.queryByText('Empty seat')).toBeNull()
})

test('the header has Invite and a QR icon button, no standalone Copy link pill', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'QR code' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
})

test('there is no bottom invite/QR card', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  expect(screen.queryByTestId('invite-link')).toBeNull()
  expect(document.querySelector('.qr')).toBeNull()
})

test('clicking the QR icon opens the ShareSheet with the invite link', () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'QR code' }))
  expect(screen.getByText(`${window.location.origin}/r/ABCD`)).toBeInTheDocument()
})

const openInvite = () => {
  render(<MemoryRouter><Lobby state={snap(true)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
  return within(screen.getByRole('dialog', { name: 'Invite friends' }))
}

test('clicking Invite opens a preview dialog; Share inside shares the invite card and toasts', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  fireEvent.click(openInvite().getByRole('button', { name: 'Invite' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  const arg = vi.mocked(shareCard).mock.calls[0][0]
  expect(arg.model.puzzle).toContain('ABCD')
  expect(arg.model.url).toBe(`${window.location.origin}/r/ABCD`)
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('a failed share from the Invite dialog shows the failure toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('failed')
  fireEvent.click(openInvite().getByRole('button', { name: 'Invite' }))
  expect(await screen.findByText('Could not share.')).toBeInTheDocument()
})

test('Save image in the Invite dialog downloads the card and toasts Image saved', async () => {
  vi.mocked(downloadCard).mockResolvedValue(true)
  fireEvent.click(openInvite().getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(downloadCard).toHaveBeenCalledWith(expect.anything(), 'spy-hunt-room-ABCD.png'))
  expect(await screen.findByText('Image saved!')).toBeInTheDocument()
})

test('cancelling the native share from the Invite dialog shows no toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('cancelled')
  fireEvent.click(openInvite().getByRole('button', { name: 'Invite' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  await act(async () => {})
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByText('Could not share.')).toBeNull()
})
