import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Table } from './Table'
import { Vote } from './Vote'
import { Countdown } from '../components/Countdown'
import { setLang } from '../i18n'
import { msg, player, snap } from '../test/fixtures'
import { ApiError, request } from '../api/client'
import { patchMyLang } from '../state/accounts'

vi.mock('../api/client', async (orig) => {
  const m = await orig<typeof import('../api/client')>()
  return { ...m, request: vi.fn().mockResolvedValue({}) }
})
vi.mock('../state/accounts', () => ({ patchMyLang: vi.fn() }))
vi.mock('../state/session', () => ({ setSessionLang: vi.fn(), getSession: () => ({ name: 'x', lang: 'en' }) }))

beforeEach(() => {
  setLang('en')
})

function withZhViewer(messages = [msg(1), msg(2, { lang: 'zh-Hans', text: '很高' })]) {
  return snap({
    players: [player(0), player(1, { lang: 'zh-Hans' }), player(2), player(3, { is_bot: true })],
    messages: messages.map((m) => (m.id === 1 ? { ...m, translations: { 'zh-Hans': '你好' } } : m)),
  })
}

test('zh viewer sees original and translation for an en message, original only for a zh message', () => {
  render(<Table state={withZhViewer()} />)
  expect(screen.getByText('hello')).toBeInTheDocument()
  expect(screen.getByText('你好')).toBeInTheDocument()
  expect(screen.getAllByTestId('translation')).toHaveLength(1)
  expect(screen.getByText('很高')).toBeInTheDocument()
})

test('own role is never rendered during play, even if a role leaks into the data', () => {
  const s = snap({ players: [player(0, { role: 'spy' }), player(1, { role: 'civilian' }), player(2), player(3)] })
  render(<Table state={s} />)
  expect(screen.queryByText(/spy|civilian/i)).toBeNull()
})

test('a tied player sees no vote targets in the re-vote', () => {
  const s = snap({ phase: 'revote', tied: [1, 2], me: { seat: 1, is_host: false, my_word: 'river' } })
  render(<Vote state={s} />)
  expect(screen.queryAllByRole('button', { name: /^P\d/ })).toHaveLength(0)
  expect(screen.getByText(/tied/i)).toBeInTheDocument()
})

test('a re-vote only offers the tied players to a non-tied voter', () => {
  const s = snap({ phase: 'revote', tied: [1, 2], me: { seat: 0, is_host: true, my_word: 'river' } })
  render(<Vote state={s} />)
  expect(screen.getAllByRole('button', { name: /^P\d/ })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'P1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'P2' })).toBeInTheDocument()
})

test('a vote target and the speaking line show the avatar emoji', () => {
  const s = snap({ phase: 'vote', me: { seat: 0, is_host: true, my_word: 'river' }, players: [player(0), player(1, { avatar: { emoji: '🐙', color: '#abc' } }), player(2)], current_speaker: 1 })
  render(<Vote state={s} />)
  expect(screen.getByRole('button', { name: 'P1' })).toHaveTextContent('🐙')
})
test('the speaking line shows the avatar emoji', () => {
  const s = snap({ phase: 'describe', me: { seat: 0, is_host: true, my_word: 'river' }, players: [player(0), player(1, { avatar: { emoji: '🐙', color: '#abc' } })], current_speaker: 1 })
  render(<Table state={s} />)
  expect(screen.getByText(/speaking/i)).toHaveTextContent('🐙')
})

test('2000-character, emoji and RTL statements wrap inside the bubble', () => {
  const long = 'x'.repeat(2000)
  const s = snap({ messages: [msg(1, { text: long }), msg(2, { text: '😀👨‍👩‍👧 مرحبا بالعالم' }), msg(3, { text: 'שלום עולם' })] })
  render(<Table state={s} />)
  const el = screen.getByText(long)
  expect(el).toHaveClass('wrap')
  expect(el.closest('.bubble')).toBeInTheDocument()
  expect(screen.getByText('שלום עולם')).toHaveAttribute('dir', 'auto')
})

test('input is disabled when it is not my turn and when eliminated', () => {
  const s = snap({ current_speaker: 2 })
  const { unmount } = render(<Table state={s} />)
  expect(screen.getByPlaceholderText('Describe your word…')).toBeDisabled()
  unmount()
  const e = snap({ current_speaker: 1, players: [player(0), player(1, { alive: false }), player(2), player(3)] })
  render(<Table state={e} />)
  expect(screen.getByPlaceholderText('Describe your word…')).toBeDisabled()
})

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('hits zero and stops ticking', () => {
    const vib = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true })
    render(<Countdown deadline={Date.now() + 3000} />)
    expect(screen.getByRole('timer')).toHaveTextContent('3')
    act(() => { vi.advanceTimersByTime(3500) })
    expect(screen.getByRole('timer')).toHaveTextContent('0')
    const calls = vib.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(vib.mock.calls.length).toBe(calls)
  })
})

test('the vote screen lists what everyone said, current round first, with translations', () => {
  const s = snap({
    phase: 'vote', round: 2,
    players: [player(0), player(1, { lang: 'zh-Hans' }), player(2), player(3, { is_bot: true })],
    messages: [
      msg(1, { round: 1, seat: 0, text: 'old clue' }),
      msg(2, { round: 2, seat: 2, text: 'fresh clue', translations: { 'zh-Hans': '新线索' } }),
    ],
  })
  render(<Vote state={s} />)
  const rounds = screen.getAllByTestId(/^round-/).map((e) => e.getAttribute('data-testid'))
  expect(rounds).toEqual(['round-2', 'round-1'])
  expect(screen.getByText('old clue')).toBeInTheDocument()
  expect(screen.getByText('fresh clue')).toBeInTheDocument()
  expect(screen.getByText('新线索')).toBeInTheDocument()
})

test('the tie result lists the tied players and counts down to the next stage', async () => {
  const { Reveal } = await import('./Reveal')
  const s = snap({
    phase: 'tiebreak_describe',
    reveal: { round: 1, stage: 0, outcome: 'tiebreak', eliminated: null, tied: [1, 2], votes: [] },
  })
  render(<Reveal state={s} holdUntil={Date.now() + 5000} />)
  expect(screen.getByText(/tie/i)).toHaveTextContent('P1, P2')
  expect(screen.getByRole('timer')).toHaveTextContent('5')
})

describe('reveal vote grouping', () => {
  const reveal = (votes: { voter: number; target: number | null }[], over = {}) =>
    snap({
      phase: 'reveal',
      players: [player(0), player(1), player(2), player(3)],
      reveal: { round: 1, stage: 0, outcome: 'eliminated', eliminated: 1, tied: [], votes, role: 'civilian', ...over },
    })

  test('shows grouped votes with counts and voter names', async () => {
    const { Reveal } = await import('./Reveal')
    render(<Reveal state={reveal([{ voter: 0, target: 1 }, { voter: 2, target: 1 }, { voter: 3, target: 1 }])} />)
    expect(screen.getByText('●●● 3 votes')).toBeInTheDocument()
    expect(screen.getByText('P0, P2, P3')).toBeInTheDocument()
  })

  test('one vote uses the singular', async () => {
    const { Reveal } = await import('./Reveal')
    render(<Reveal state={reveal([{ voter: 0, target: 1 }])} />)
    expect(screen.getByText('● 1 vote')).toBeInTheDocument()
  })

  test('abstained names are listed', async () => {
    const { Reveal } = await import('./Reveal')
    render(<Reveal state={reveal([{ voter: 0, target: 1 }, { voter: 3, target: null }, { voter: 2, target: null }])} />)
    expect(screen.getByText('Abstained: P2, P3')).toBeInTheDocument()
  })

  test('a departed voter shows ?', async () => {
    const { Reveal } = await import('./Reveal')
    render(<Reveal state={reveal([{ voter: 9, target: 1 }])} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  test('more than six votes cap the dots but show the number', async () => {
    const { Reveal } = await import('./Reveal')
    const votes = Array.from({ length: 8 }, (_, i) => ({ voter: 10 + i, target: 1 }))
    render(<Reveal state={reveal(votes)} />)
    expect(screen.getByText('●●●●●● 8 votes')).toBeInTheDocument()
  })

  test('the tie line is unchanged next to the grouped votes', async () => {
    const { Reveal } = await import('./Reveal')
    render(
      <Reveal
        state={reveal([{ voter: 0, target: 1 }, { voter: 1, target: 2 }], { outcome: 'tiebreak', eliminated: null, tied: [1, 2], role: undefined })}
        holdUntil={Date.now() + 5000}
      />,
    )
    expect(screen.getByText(/tie/i)).toHaveTextContent('P1, P2')
    expect(screen.getAllByText('● 1 vote')).toHaveLength(2)
  })
})

test('a rejected vote shows the mapped text, not the server text', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError(409, 'not_member', 'English server text'))
  const s = snap({ phase: 'vote', me: { seat: 0, is_host: true, my_word: 'river' }, players: [player(0), player(1), player(2)] })
  render(<Vote state={s} />)
  fireEvent.click(screen.getByRole('button', { name: 'P1' }))
  expect(await screen.findByText('You are not in this room.')).toBeInTheDocument()
  expect(screen.queryByText('English server text')).toBeNull()
})

test('a non-400 statement error shows the mapped text, not the server text', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError(409, 'not_member', 'English server text'))
  render(<Table state={snap({ current_speaker: 1 })} />)
  fireEvent.change(screen.getByPlaceholderText('Describe your word…'), { target: { value: 'hi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('You are not in this room.')).toBeInTheDocument()
  expect(screen.queryByText('English server text')).toBeNull()
})

test('Table language pick also syncs to the account', () => {
  render(<Table state={snap({ players: [player(0), player(1), player(2), player(3)] })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Language' }))
  fireEvent.click(screen.getByRole('option', { name: '简体中文' }))
  expect(patchMyLang).toHaveBeenCalledWith('zh-Hans')
})
