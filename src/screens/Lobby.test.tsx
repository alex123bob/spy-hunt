import { render, screen, fireEvent, within } from '@testing-library/react'
import { Lobby } from './Lobby'
import { setLang, getLang } from '../i18n'
import type { Snapshot } from '../api/types'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn().mockResolvedValue({}) }
})
import { request } from '../api/client'

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

beforeEach(() => { setLang('en'); vi.mocked(request).mockClear() })

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
