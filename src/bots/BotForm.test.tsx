import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BotForm } from './BotForm'
import { ApiError } from '../api/client'
import type { BotCard, BotCatalog } from '../api/types'
import { createBot, updateBot } from './api'
import { setLang } from '../i18n'

vi.mock('./api', () => ({ createBot: vi.fn(), updateBot: vi.fn() }))

const catalog: BotCatalog = {
  voices: ['cheerful'], styles: ['concrete'], quirks: ['question'], emojis: ['🦊'], colors: ['#111111'],
  triggers: ['accused', 'late_game', 'after_elimination'], actions: ['counter_accuse', 'go_vague', 'vote_leader'], max_rules: 3,
}
const rec = { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }
const bot = (outfit: object): BotCard => ({ id: 'abcdefgh', name: 'Bo', avatar: { emoji: '🦊', color: '#111111' }, outfit, record: rec } as BotCard)
const base = { voice: 'cheerful', style: 'concrete', quirk: 'question' }
const ui = (initial?: BotCard) => render(<BotForm initial={initial} catalog={catalog} onSaved={() => {}} onCancel={() => {}} />)
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

beforeEach(() => {
  setLang('en')
  vi.mocked(createBot).mockReset().mockResolvedValue(bot({ ...base, rules: [] }))
  vi.mocked(updateBot).mockReset().mockResolvedValue(bot({ ...base, rules: [] }))
})

test('add appends a row with first options and shows the preview line', () => {
  ui()
  add()
  expect(screen.getByLabelText('When')).toHaveValue('accused')
  expect(screen.getByLabelText('Then')).toHaveValue('counter_accuse')
  expect(screen.getByText('When I am accused → counter-accuse')).toBeInTheDocument()
})

test('add is disabled at the limit with a hint', () => {
  ui()
  add(); add(); add()
  expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  expect(screen.getByText('Up to 3 rules.')).toBeInTheDocument()
})

test('changing selects updates the preview', () => {
  ui()
  add()
  fireEvent.change(screen.getByLabelText('When'), { target: { value: 'late_game' } })
  fireEvent.change(screen.getByLabelText('Then'), { target: { value: 'go_vague' } })
  expect(screen.getByText('When it is late in the game → go vague')).toBeInTheDocument()
})

test('removing the middle row keeps the others and save sends rules in order', async () => {
  ui()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  add(); add(); add()
  const whens = screen.getAllByLabelText('When')
  fireEvent.change(whens[0], { target: { value: 'accused' } })
  fireEvent.change(whens[1], { target: { value: 'late_game' } })
  fireEvent.change(whens[2], { target: { value: 'after_elimination' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove rule' })[1])
  expect(screen.getAllByLabelText('When').map((s) => (s as HTMLSelectElement).value)).toEqual(['accused', 'after_elimination'])
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(createBot).toHaveBeenCalled())
  expect(vi.mocked(createBot).mock.calls[0]![0]!.outfit?.rules).toEqual([
    { when: 'accused', do: 'counter_accuse' }, { when: 'after_elimination', do: 'counter_accuse' },
  ])
})

test('editing prefilled rules saves them', async () => {
  ui(bot({ ...base, rules: [{ when: 'late_game', do: 'go_vague' }] }))
  expect(screen.getAllByLabelText('When')).toHaveLength(1)
  expect(screen.getByLabelText('When')).toHaveValue('late_game')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateBot).toHaveBeenCalled())
  expect(vi.mocked(updateBot).mock.calls[0]![1]!.outfit?.rules).toEqual([{ when: 'late_game', do: 'go_vague' }])
})

test('outfit without rules starts empty', async () => {
  ui(bot(base))
  expect(screen.queryByLabelText('When')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateBot).toHaveBeenCalled())
  expect(vi.mocked(updateBot).mock.calls[0]![1]!.outfit?.rules).toEqual([])
})

test('bad_outfit error is shown', async () => {
  vi.mocked(createBot).mockRejectedValue(new ApiError(400, 'bad_outfit', 'duplicate rule'))
  ui()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('duplicate rule')
})
