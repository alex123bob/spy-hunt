import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test } from 'vitest'
import type { GameDetail } from '../api/types'
import { setLang, t } from '../i18n'
import { GameRecap } from './GameRecap'

const detail: GameDetail = {
  finished_at: 1_794_398_400_000,
  winner: 'spies',
  lang: 'en',
  words: { civilian: { en: 'Coffee', 'zh-Hans': '咖啡' }, spy: { en: 'Tea', 'zh-Hans': '茶' } },
  roles: [
    { seat: 0, role: 'spy', is_bot: false, name: 'Mei', is_you: true, credits_earned: 12, credit_parts: [{ kind: 'played', n: 2 }, { kind: 'won', n: 10 }] },
    { seat: 1, role: 'civilian', is_bot: true, name: 'Kai', is_you: false },
    { seat: 2, role: 'civilian', is_bot: false, name: 'Leo', is_you: false, credits_earned: 2, credit_parts: [{ kind: 'played', n: 2 }] },
  ],
}

const renderRecap = (d: GameDetail = detail) =>
  render(<MemoryRouter><GameRecap detail={d} roomId="r1" gameNo={3} /></MemoryRouter>)

beforeEach(() => setLang('en'))

test('shows both words in the viewer language and tags the word you had', () => {
  renderRecap()
  expect(screen.getByText(t('arena.match.words', { civilian: 'Coffee', spy: 'Tea' }))).toBeInTheDocument()
  expect(screen.getByText(t('profile.game.yourWord'), { exact: false })).toBeInTheDocument()
})

test('shows words in the viewer language when it differs from the game language', () => {
  setLang('zh-Hans')
  renderRecap()
  expect(screen.getByText(t('arena.match.words', { civilian: '咖啡', spy: '茶' }))).toBeInTheDocument()
})

test('lineup marks your seat and bots', () => {
  renderRecap()
  const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('recap-seat'))
  expect(rows).toHaveLength(3)
  expect(within(rows[0]).getByText(t('profile.game.you'))).toBeInTheDocument()
  expect(within(rows[1]).getByText(t('profile.game.bot'), { exact: false })).toBeInTheDocument()
  expect(within(rows[2]).queryByText(t('profile.game.you'))).toBeNull()
  expect(within(rows[2]).queryByText(t('profile.game.bot'), { exact: false })).toBeNull()
})

test('credit chips show only your own parts', () => {
  const { container } = renderRecap()
  const chips = container.querySelectorAll('.credit-chip')
  expect(chips).toHaveLength(2)
  expect(chips[0].textContent).toContain('+2')
  expect(chips[1].textContent).toContain('+10')
  expect(chips[1].className).toContain('chip-won')
})

test('with no words there is no words line and nothing says undefined', () => {
  const { container } = renderRecap({ ...detail, words: {} as GameDetail['words'] })
  expect(screen.queryByText(t('profile.game.words'), { exact: false })).toBeNull()
  expect(container.textContent).not.toContain('undefined')
})

test('links to the full recap page', () => {
  renderRecap()
  expect(screen.getByRole('link', { name: t('profile.game.fullRecap') })).toHaveAttribute('href', '/games/r1/3')
})
