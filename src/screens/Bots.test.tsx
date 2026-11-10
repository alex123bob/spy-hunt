import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Bots } from './Bots'
import { ApiError } from '../api/client'
import type { BotCard, BotCatalog } from '../api/types'
import { createBot, deleteBot, getBotCard, getCatalog, listMyBots, updateBot } from '../bots/api'
import { setLang } from '../i18n'

vi.mock('../bots/api', () => ({
  getCatalog: vi.fn(), listMyBots: vi.fn(), createBot: vi.fn(), getBotCard: vi.fn(), updateBot: vi.fn(), deleteBot: vi.fn(),
}))

const catalog: BotCatalog = {
  voices: ['cheerful', 'dry'], styles: ['concrete', 'vague'], quirks: ['question', 'agree'],
  emojis: ['🦊', '🐼', '🐸'], colors: ['#111111', '#222222'],
  triggers: ['accused', 'late_game'], actions: ['counter_accuse', 'go_vague'], max_rules: 3,
}
const rec = { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }
const mk = (id: string, name: string): BotCard => ({
  id, name, avatar: { emoji: '🐼', color: '#222222' },
  outfit: { voice: 'dry', style: 'vague', quirk: 'agree', rules: [] }, record: rec, remix_of: null, remixes: 0, remixable: true, ranked: { games: 0, wins: 0, spy_games: 0, spy_wins: 0 }, listed: false,
})
const a = mk('aaaaaaaa', 'Alpha')
const b = mk('bbbbbbbb', 'Beta')
const tree = <MemoryRouter><Bots /></MemoryRouter>

beforeEach(() => {
  setLang('en')
  vi.mocked(getCatalog).mockReset().mockResolvedValue(catalog)
  vi.mocked(listMyBots).mockReset().mockResolvedValue([a, b])
  vi.mocked(createBot).mockReset()
  vi.mocked(getBotCard).mockReset()
  vi.mocked(updateBot).mockReset()
  vi.mocked(deleteBot).mockReset().mockResolvedValue(undefined)
})

const preview = () => screen.getAllByTestId('bot-card').at(-1)!

test('lists the bots', async () => {
  render(tree)
  expect(await screen.findByText('Alpha')).toBeInTheDocument()
  expect(screen.getByText('Beta')).toBeInTheDocument()
})

test('new bot preselects the first option of each group and updates the preview', async () => {
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(screen.getByRole('button', { name: 'New bot' }))
  expect(screen.getByRole('radio', { name: '🦊' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: 'Cheerful' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('radio', { name: '🐸' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Vague' }))
  const p = preview()
  expect(p).toHaveTextContent('Zed')
  expect(p).toHaveTextContent('🐸')
  expect(p).toHaveTextContent('Style: Vague')
  expect(screen.getByRole('radiogroup', { name: 'Style' })).toBeInTheDocument()
})

test('save creates the bot and shows it', async () => {
  const made = mk('cccccccc', 'Zed')
  vi.mocked(createBot).mockResolvedValue(made)
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(screen.getByRole('button', { name: 'New bot' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('radio', { name: '🐸' }))
  fireEvent.click(screen.getByRole('radio', { name: '#222222' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Vague' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(createBot).toHaveBeenCalledWith({
    name: 'Zed', avatar: { emoji: '🐸', color: '#222222' },
    outfit: { voice: 'cheerful', style: 'vague', quirk: 'question', rules: [] }, listed: true,
  }))
  expect(await screen.findByText('Zed')).toBeInTheDocument()
  expect(screen.queryByLabelText('Name')).toBeNull()
})

test('edit prefills and saves with updateBot', async () => {
  vi.mocked(updateBot).mockResolvedValue({ ...a, name: 'Alpha2' })
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(within(screen.getAllByTestId('bot-card')[0]!.parentElement!).getByRole('button', { name: 'Edit' }))
  expect(screen.getByLabelText('Name')).toHaveValue('Alpha')
  expect(screen.getByRole('radio', { name: 'Dry' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alpha2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateBot).toHaveBeenCalledWith('aaaaaaaa', {
    name: 'Alpha2', avatar: a.avatar, outfit: a.outfit, listed: false,
  }))
  expect(await screen.findByText('Alpha2')).toBeInTheDocument()
})

test('delete needs two clicks', async () => {
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!)
  expect(deleteBot).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
  await waitFor(() => expect(deleteBot).toHaveBeenCalledWith('aaaaaaaa'))
  await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull())
})

test('at 3 bots new bot is disabled with a hint', async () => {
  vi.mocked(listMyBots).mockResolvedValue([a, b, mk('dddddddd', 'Gamma')])
  render(tree)
  await screen.findByText('Alpha')
  expect(screen.getByRole('button', { name: 'New bot' })).toBeDisabled()
  expect(screen.getByText('You can have up to 3 bots.')).toBeInTheDocument()
})

test('save is disabled for a blank name', async () => {
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(screen.getByRole('button', { name: 'New bot' }))
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('a rejected save shows an alert, bot_limit shows the limit text', async () => {
  vi.mocked(createBot).mockRejectedValueOnce(new ApiError(400, 'bad_name', 'Bad name'))
  render(tree)
  await screen.findByText('Alpha')
  fireEvent.click(screen.getByRole('button', { name: 'New bot' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That name is not valid.')
  vi.mocked(createBot).mockRejectedValueOnce(new ApiError(409, 'bot_limit', 'x'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('You can have up to 3 bots.'))
})

test('a failed list shows an error and retry', async () => {
  vi.mocked(listMyBots).mockRejectedValueOnce(new ApiError(0, 'network'))
  render(tree)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Alpha')).toBeInTheDocument()
})

const remixTree = <MemoryRouter initialEntries={['/bots?remix=abc12345']}><Bots /></MemoryRouter>
const src = { ...mk('abc12345', 'Source'), outfit: { voice: 'cheerful', style: 'concrete', quirk: 'question', rules: [{ when: 'accused', do: 'go_vague' }] } }

test('?remix opens the prefilled form', async () => {
  vi.mocked(listMyBots).mockResolvedValue([a])
  vi.mocked(getBotCard).mockResolvedValue(src)
  render(remixTree)
  expect(await screen.findByLabelText('Name')).toHaveValue('')
  expect(getBotCard).toHaveBeenCalledWith('abc12345')
  expect(screen.getByRole('radio', { name: 'Cheerful' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByLabelText('When, rule 1')).toHaveValue('accused')
})

test('?remix at 3 bots shows the limit and no form', async () => {
  vi.mocked(listMyBots).mockResolvedValue([a, b, mk('dddddddd', 'Gamma')])
  vi.mocked(getBotCard).mockResolvedValue(src)
  render(remixTree)
  await screen.findByText('Alpha')
  expect(screen.queryByLabelText('Name')).toBeNull()
  expect(screen.getAllByText('You can have up to 3 bots.').length).toBeGreaterThan(0)
})

test('?remix with a missing or non-remixable bot shows not allowed', async () => {
  vi.mocked(listMyBots).mockResolvedValue([a])
  vi.mocked(getBotCard).mockRejectedValue(new ApiError(404, 'not_found'))
  const { unmount } = render(remixTree)
  expect(await screen.findByText('This bot cannot be remixed.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Name')).toBeNull()
  unmount()
  vi.mocked(getBotCard).mockResolvedValue({ ...src, remixable: false })
  render(remixTree)
  expect(await screen.findByText('This bot cannot be remixed.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Name')).toBeNull()
})

test('?remix works for a visitor with no bots', async () => {
  vi.mocked(listMyBots).mockResolvedValue([])
  vi.mocked(getBotCard).mockResolvedValue(src)
  render(remixTree)
  expect(await screen.findByLabelText('Name')).toBeInTheDocument()
})

test('?remix with a network or server failure says the bot could not be loaded, not that it cannot be remixed', async () => {
  vi.mocked(listMyBots).mockResolvedValue([a])
  vi.mocked(getBotCard).mockRejectedValue(new ApiError(0, 'network'))
  render(remixTree)
  expect(await screen.findByText('Could not load this bot.')).toBeInTheDocument()
  expect(screen.queryByText('This bot cannot be remixed.')).toBeNull()
  expect(screen.queryByLabelText('Name')).toBeNull()
})
