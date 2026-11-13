import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LookEditor } from './LookEditor'
import { getLooks, saveLook } from '../state/looks'
import { setLang } from '../i18n'
import type { LooksCatalog } from '../api/types'

vi.mock('../state/looks', () => ({ getLooks: vi.fn(), saveLook: vi.fn() }))

const cat = (over: Partial<LooksCatalog> = {}): LooksCatalog => ({
  emojis: [{ emoji: '🦊', rank: 0 }, { emoji: '🐱', rank: 0 }, { emoji: '👑', rank: 5 }],
  colors: ['#ff6b6b', '#4cd08a'],
  frames: [{ key: 'none', rank: 0 }, { key: 'leaf', rank: 1 }, { key: 'crown', rank: 5 }],
  rank: 1, mine: null, ...over,
})

beforeEach(() => {
  setLang('en')
  vi.mocked(getLooks).mockReset()
  vi.mocked(saveLook).mockReset()
})

test('starts on the first free options and saves the picked look', async () => {
  vi.mocked(getLooks).mockResolvedValue(cat())
  vi.mocked(saveLook).mockImplementation(async (l) => cat({ mine: l }))
  render(<LookEditor name="Me" />)
  fireEvent.click(await screen.findByRole('radio', { name: '🐱' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Green' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Leaf' }))
  expect(screen.getByTestId('look-preview').querySelector('.avatar')).toHaveClass('frame-leaf')
  fireEvent.click(screen.getByRole('button', { name: 'Save look' }))
  await waitFor(() => expect(saveLook).toHaveBeenCalledWith({ emoji: '🐱', color: '#4cd08a', frame: 'leaf' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Look saved')
  expect(screen.getByRole('button', { name: 'Save look' })).toBeDisabled()
})

test('locked items say which rank unlocks them and cannot be picked', async () => {
  vi.mocked(getLooks).mockResolvedValue(cat({ mine: { emoji: '🦊', color: '#ff6b6b', frame: 'none' } }))
  render(<LookEditor name="Me" />)
  const crown = await screen.findByRole('radio', { name: /Crown — Unlocks at Legend/ })
  expect(crown).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(crown)
  expect(crown).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('radio', { name: /👑 — Unlocks at/ })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('radio', { name: 'Leaf' })).not.toHaveAttribute('aria-disabled')
})

test('a failed save says so', async () => {
  vi.mocked(getLooks).mockResolvedValue(cat())
  vi.mocked(saveLook).mockRejectedValue(new Error('x'))
  render(<LookEditor name="Me" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save look' }))
  expect(await screen.findByText('Could not save your look.')).toBeInTheDocument()
})

test('tapping a locked item pops a bubble saying which rank unlocks it', async () => {
  vi.mocked(getLooks).mockResolvedValue(cat())
  render(<LookEditor name="Me" />)
  const crown = await screen.findByRole('radio', { name: /Crown — Unlocks at Legend/ })
  fireEvent.click(crown)
  expect(screen.getByRole('tooltip')).toHaveTextContent('🔒 Unlocks at Legend')
  expect(crown).toHaveAttribute('aria-checked', 'false')
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('tooltip')).toBeNull()
})
