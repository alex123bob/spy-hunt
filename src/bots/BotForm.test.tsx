import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BotForm } from './BotForm'
import { ApiError } from '../api/client'
import type { BotCard, BotCatalog } from '../api/types'
import { createBot, updateBot } from './api'
import { setLang } from '../i18n'

vi.mock('./api', () => ({ createBot: vi.fn(), updateBot: vi.fn() }))

const catalog: BotCatalog = {
  voices: ['cheerful'], styles: ['concrete'], quirks: ['question'], emojis: ['🦊'], colors: ['#ff6b6b', '#5b8cff', '#111111'],
  triggers: ['accused', 'late_game', 'after_elimination'], actions: ['counter_accuse', 'go_vague', 'vote_leader'], max_rules: 3,
}
const rec = { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }
const bot = (outfit: object): BotCard => ({ id: 'abcdefgh', name: 'Bo', avatar: { emoji: '🦊', color: '#ff6b6b' }, outfit, record: rec, remix_of: null, remixes: 0, remixable: true, ranked: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }, listed: false } as BotCard)
const base = { voice: 'cheerful', style: 'concrete', quirk: 'question' }
const ui = (initial?: BotCard, remix?: BotCard) => render(<BotForm initial={initial} remix={remix} catalog={catalog} onSaved={() => {}} onCancel={() => {}} />)
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

beforeEach(() => {
  setLang('en')
  vi.mocked(createBot).mockReset().mockResolvedValue(bot({ ...base, rules: [] }))
  vi.mocked(updateBot).mockReset().mockResolvedValue(bot({ ...base, rules: [] }))
})

test('add appends a row with first options and shows the preview line', () => {
  ui()
  add()
  expect(screen.getByLabelText('When, rule 1')).toHaveValue('accused')
  expect(screen.getByLabelText('Then, rule 1')).toHaveValue('counter_accuse')
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
  fireEvent.change(screen.getByLabelText('When, rule 1'), { target: { value: 'late_game' } })
  fireEvent.change(screen.getByLabelText('Then, rule 1'), { target: { value: 'go_vague' } })
  expect(screen.getByText('When it is late in the game → go vague')).toBeInTheDocument()
})

test('removing the middle row keeps the others and save sends rules in order', async () => {
  ui()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  add(); add(); add()
  const whens = screen.getAllByLabelText(/^When, rule/)
  fireEvent.change(whens[0], { target: { value: 'accused' } })
  fireEvent.change(whens[1], { target: { value: 'late_game' } })
  fireEvent.change(whens[2], { target: { value: 'after_elimination' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove rule 2' }))
  expect(screen.getAllByLabelText(/^When, rule/).map((s) => (s as HTMLSelectElement).value)).toEqual(['accused', 'after_elimination'])
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(createBot).toHaveBeenCalled())
  expect(vi.mocked(createBot).mock.calls[0]![0]!.outfit?.rules).toEqual([
    { when: 'accused', do: 'counter_accuse' }, { when: 'after_elimination', do: 'vote_leader' },
  ])
})

test('editing prefilled rules saves them', async () => {
  ui(bot({ ...base, rules: [{ when: 'late_game', do: 'go_vague' }] }))
  expect(screen.getAllByLabelText(/^When, rule/)).toHaveLength(1)
  expect(screen.getByLabelText('When, rule 1')).toHaveValue('late_game')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateBot).toHaveBeenCalled())
  expect(vi.mocked(updateBot).mock.calls[0]![1]!.outfit?.rules).toEqual([{ when: 'late_game', do: 'go_vague' }])
})

test('outfit without rules starts empty', async () => {
  ui(bot(base))
  expect(screen.queryByLabelText('When, rule 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateBot).toHaveBeenCalled())
  expect(vi.mocked(updateBot).mock.calls[0]![1]!.outfit?.rules).toEqual([])
})

test('bad_outfit error is shown', async () => {
  vi.mocked(createBot).mockRejectedValue(new ApiError(400, 'bad_outfit', 'duplicate rule'))
  ui()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That outfit is not valid.')
})

const pairs = () => screen.getAllByLabelText(/^When, rule/).map((w, i) =>
  [(w as HTMLSelectElement).value, (screen.getByLabelText(`Then, rule ${i + 1}`) as HTMLSelectElement).value])

test('two Add clicks give two different pairs', () => {
  ui()
  add(); add()
  expect(pairs()).toEqual([['accused', 'counter_accuse'], ['accused', 'go_vague']])
})

test('duplicate pair shows a message and disables Save; changing one resolves it', () => {
  ui()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  add(); add()
  fireEvent.change(screen.getByLabelText('Then, rule 2'), { target: { value: 'counter_accuse' } })
  expect(screen.getByText('Two rules are the same. Change or remove one.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Then, rule 2'), { target: { value: 'go_vague' } })
  expect(screen.queryByText('Two rules are the same. Change or remove one.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('bad_outfit shows a translated message in zh-Hans', async () => {
  setLang('zh-Hans')
  vi.mocked(createBot).mockRejectedValue(new ApiError(400, 'bad_outfit', 'bad rule'))
  ui()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('这套装扮无效。')
  expect(alert).not.toHaveTextContent('bad rule')
})

test('colour swatches are named, with the hex as fallback', () => {
  ui()
  expect(screen.getByRole('radio', { name: 'Red' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Blue' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '#111111' })).toBeInTheDocument()
})

test('a rejected save shows mapped text, a network failure the network text', async () => {
  vi.mocked(createBot).mockRejectedValueOnce(new ApiError(400, 'bad_name', 'raw'))
  ui()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That name is not valid.')
  vi.mocked(createBot).mockRejectedValueOnce(new ApiError(0, 'network', 'Network error'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server. Check your connection.'))
})

test('remix starts with an empty name and the copied outfit, and sends remix_of', async () => {
  const src = { ...bot({ ...base, rules: [{ when: 'late_game', do: 'go_vague' }] }), id: 'abc12345', name: 'Source' }
  ui(undefined, src)
  expect(screen.getByLabelText('Name')).toHaveValue('')
  expect(screen.getByLabelText('When, rule 1')).toHaveValue('late_game')
  expect(screen.getByRole('radio', { name: 'Cheerful' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Zed ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(createBot).toHaveBeenCalled())
  const sent = vi.mocked(createBot).mock.calls[0]![0]!
  expect(sent.remix_of).toBe('abc12345')
  expect(sent.name).toBe('Zed')
  expect(sent.listed).toBe(true)
  expect(sent.outfit?.rules).toEqual([{ when: 'late_game', do: 'go_vague' }])
})

test('listed checkbox defaults checked and unchecking sends false', async () => {
  ui()
  const box = screen.getByRole('checkbox', { name: 'Show on the top bots board' })
  expect(box).toBeChecked()
  fireEvent.click(box)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(createBot).toHaveBeenCalled())
  const sent = vi.mocked(createBot).mock.calls[0]![0]!
  expect(sent.listed).toBe(false)
  expect(sent.remix_of).toBeUndefined()
})

test('editing a bot with listed false shows it unchecked', () => {
  ui(bot({ ...base, rules: [] }))
  expect(screen.getByRole('checkbox', { name: 'Show on the top bots board' })).not.toBeChecked()
})
