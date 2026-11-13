import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Daily } from './Daily'
import { ApiError } from '../api/client'
import type { DailyPuzzle, DailyResult, DailyState } from '../api/types'
import { getDaily, getResult, guessSpy, guessWord } from '../daily/api'
import { shareDailyResult } from '../daily/share'
import { setLang } from '../i18n'
import { recordStreakMilestone } from '../state/nudges'
import { msg } from '../test/fixtures'

vi.mock('../daily/api', () => ({ getDaily: vi.fn(), guessSpy: vi.fn(), guessWord: vi.fn(), getResult: vi.fn() }))
vi.mock('../state/nudges', () => ({ recordStreakMilestone: vi.fn() }))
vi.mock('../daily/share', async (orig) => ({ ...(await orig<typeof import('../daily/share')>()), shareDailyResult: vi.fn() }))

const NAMES = ['Milo', 'Juno', 'Pip', 'Nova', 'Remy']
const puzzle: DailyPuzzle = {
  number: 12, day: '2026-11-10', difficulty: 2, origin_lang: 'en',
  civilian_word: { en: 'piano', 'zh-Hans': '钢琴' },
  players: NAMES.map((name, seat) => ({ seat, name })),
  statements: Array.from({ length: 10 }, (_, i) =>
    msg(i + 1, { round: i < 5 ? 1 : 2, seat: i % 5, text: `clue ${i}`, translations: { 'zh-Hans': `线索${i}` } })),
  options: [
    { en: 'organ', 'zh-Hans': '风琴' }, { en: 'guitar', 'zh-Hans': '吉他' },
    { en: 'drum', 'zh-Hans': '鼓' }, { en: 'flute', 'zh-Hans': '长笛' },
  ],
}
const state = (stage: 'spy' | 'word' | 'done', tries = 0, wrong: number[] = []): DailyState => ({
  puzzle, me: { stage, tries, tries_left: stage === 'spy' ? 2 - tries : 0, wrong },
  streak: 3, best: 3, played_today: stage === 'done',
})
const result: DailyResult = {
  solved: true, tries: 2, word_correct: true, elapsed_ms: 72000, score: 120,
  answer: { spy_seat: 2, spy_word: { en: 'organ', 'zh-Hans': '风琴' }, civilian_word: puzzle.civilian_word },
  stats: { players: 40, solved_pct: 62 },
  streak: 3, best: 3, played_today: true,
}
const tree = <MemoryRouter><Daily /></MemoryRouter>

beforeEach(() => {
  setLang('en')
  vi.mocked(getDaily).mockReset()
  vi.mocked(guessSpy).mockReset()
  vi.mocked(guessWord).mockReset()
  vi.mocked(getResult).mockReset().mockResolvedValue(result)
  vi.mocked(shareDailyResult).mockReset()
  vi.mocked(recordStreakMilestone).mockClear()
})

test('shows the civilian word and statements in the viewer language', async () => {
  setLang('zh-Hans')
  vi.mocked(getDaily).mockResolvedValue(state('spy'))
  render(tree)
  expect(await screen.findByText(/钢琴/)).toBeInTheDocument()
  expect(screen.getByText('线索0')).toBeInTheDocument()
  expect(screen.getByText('clue 0')).toBeInTheDocument()
})

test('tapping the spy moves to the word stage', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy'))
  vi.mocked(guessSpy).mockResolvedValue({ correct: true, stage: 'word', tries: 1, tries_left: 1 })
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Pip' }))
  expect(await screen.findByText("What was the spy's word?")).toBeInTheDocument()
  expect(guessSpy).toHaveBeenCalledWith(2, '2026-11-10')
})

test('a wrong tap marks the player and shows one try left', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy'))
  vi.mocked(guessSpy).mockResolvedValue({ correct: false, stage: 'spy', tries: 1, tries_left: 1 })
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Pip' }))
  expect(await screen.findByText('Pip is not the spy.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pip' })).toBeDisabled()
  expect(screen.getByText('Tries left: 1')).toBeInTheDocument()
})

test('a second wrong tap shows the result', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy', 1))
  vi.mocked(guessSpy).mockResolvedValue({ correct: false, stage: 'done', tries: 2, tries_left: 0 })
  vi.mocked(getResult).mockResolvedValue({ ...result, solved: false, score: 0, word_correct: null })
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Milo' }))
  expect(await screen.findByText('The spy got away.')).toBeInTheDocument()
})

test('buttons are disabled while a request is in flight', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy'))
  vi.mocked(guessSpy).mockReturnValue(new Promise(() => {}))
  render(tree)
  const pip = await screen.findByRole('button', { name: 'Pip' })
  fireEvent.click(pip)
  fireEvent.click(pip)
  expect(guessSpy).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Milo' })).toBeDisabled()
})

test('the word stage lists four options and a skip button', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('word', 1))
  vi.mocked(guessWord).mockResolvedValue({ correct: null, stage: 'done' })
  render(tree)
  for (const w of ['organ', 'guitar', 'drum', 'flute']) expect(await screen.findByRole('button', { name: w })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  expect(guessWord).toHaveBeenCalledWith(null, '2026-11-10')
  expect(await screen.findByText('You found the spy!')).toBeInTheDocument()
})

test('picking an option sends its index', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('word', 1))
  vi.mocked(guessWord).mockResolvedValue({ correct: true, stage: 'done' })
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'drum' }))
  expect(guessWord).toHaveBeenCalledWith(2, '2026-11-10')
})

test('the result shows score, stats, streak and the share preview', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('done', 2))
  render(tree)
  expect(await screen.findByText('You found the spy!')).toBeInTheDocument()
  expect(screen.getByText(/The spy was Pip/)).toBeInTheDocument()
  expect(screen.getByText('120')).toBeInTheDocument()
  expect(screen.getByText('62% of 40 players found the spy')).toBeInTheDocument()
  expect(screen.getByText('Streak 3 🔥')).toBeInTheDocument()
  expect(screen.getByTestId('share-card')).toBeInTheDocument()
})

test('the share button reports copied', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('done', 2))
  vi.mocked(shareDailyResult).mockResolvedValue('copied')
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Share my card' }))
  expect(await screen.findByText('Copied')).toBeInTheDocument()
})

test('no puzzle shows a come-back message', async () => {
  vi.mocked(getDaily).mockRejectedValue(new ApiError(503, 'no_puzzle'))
  render(tree)
  expect(await screen.findByText("Today's puzzle is not ready yet. Come back soon.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
})

test('a network error offers retry', async () => {
  vi.mocked(getDaily).mockRejectedValueOnce(new ApiError(0, 'network')).mockResolvedValue(state('spy'))
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pip' })).toBeInTheDocument())
})

test('reloading in the done stage goes straight to the result', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('done', 2))
  render(tree)
  expect(await screen.findByText('You found the spy!')).toBeInTheDocument()
  expect(getResult).toHaveBeenCalledWith('2026-11-10')
  expect(screen.queryByRole('button', { name: 'Pip' })).toBeNull()
})

test('after a reload a player already ruled out stays disabled', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy', 1, [2]))
  render(tree)
  expect(await screen.findByRole('button', { name: 'Pip' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Milo' })).toBeEnabled()
  expect(screen.getByText('Tries left: 1')).toBeInTheDocument()
})

test('a second wrong tap cannot repeat the first one', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('spy'))
  vi.mocked(guessSpy).mockResolvedValue({ correct: false, stage: 'spy', tries: 1, tries_left: 1 })
  render(tree)
  fireEvent.click(await screen.findByRole('button', { name: 'Pip' }))
  await screen.findByText('Pip is not the spy.')
  fireEvent.click(screen.getByRole('button', { name: 'Pip' }))
  expect(guessSpy).toHaveBeenCalledTimes(1)
})

test('the result offers to dress up a bot', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('done', 2))
  render(
    <MemoryRouter initialEntries={['/daily']}>
      <Routes><Route path="/daily" element={<Daily />} /><Route path="*" element={<Loc />} /></Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Dress up a bot' }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/bots'))
})
function Loc() { return <div data-testid="loc">{useLocation().pathname}</div> }

test('a finished daily records the streak milestone once, even across a re-render', async () => {
  vi.mocked(getDaily).mockResolvedValue(state('done', 2))
  const { rerender } = render(tree)
  expect(await screen.findByText('You found the spy!')).toBeInTheDocument()
  rerender(tree)
  expect(recordStreakMilestone).toHaveBeenCalledTimes(1)
  expect(recordStreakMilestone).toHaveBeenCalledWith(3)
})
