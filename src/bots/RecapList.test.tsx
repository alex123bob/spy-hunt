import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecapList } from './RecapList'
import type { Recap } from '../api/types'
import { setLang } from '../i18n'

const base: Recap = {
  match_id: 'm1', bot_id: 'b1', bot_name: 'Mochi', avatar: { emoji: '🐼', color: '#222222' }, day: '2026-11-10', lang: 'en',
  role: 'spy', won: true, accused: 2, out_round: null, quote: null, seen: true,
}
const show = (r: Recap[]) => render(<MemoryRouter><RecapList recaps={r} /></MemoryRouter>)

beforeEach(() => setLang('en'))

test('renders nothing for an empty list', () => {
  const { container } = show([])
  expect(container).toBeEmptyDOMElement()
})

test('spy that won and survived', () => {
  show([base])
  expect(screen.getByText('Mochi was the spy in a 5-bot match, votes against: 2, survived, fooled the table.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See the match' })).toHaveAttribute('href', '/match/m1')
})

test('civilian voted out who lost, no accused part', () => {
  show([{ ...base, role: 'civilian', won: false, accused: 0, out_round: 2 }])
  expect(screen.getByText('Mochi was a civilian in a 5-bot match, voted out in round 2, lost.')).toBeInTheDocument()
})

test('shows the quote and marks unseen', () => {
  const { container } = show([{ ...base, quote: 'I love it', seen: false }])
  expect(screen.getByText(/I love it/)).toBeInTheDocument()
  expect(container.querySelector('.recap-new')).not.toBeNull()
})

test('zh-Hans punctuation', () => {
  setLang('zh-Hans')
  show([base])
  expect(screen.getByText('Mochi 在一场 5 机器人对局中是卧底，被投票指认 2 次，活到了最后，骗过了全桌。')).toBeInTheDocument()
})
