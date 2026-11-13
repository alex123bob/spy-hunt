import { render, screen } from '@testing-library/react'
import { HeroCard } from './HeroCard'
import { setLang } from '../i18n'
import type { CreditSummary } from '../api/types'

beforeEach(() => setLang('en'))

const senior: CreditSummary = {
  credits: 2100,
  today: 20,
  rank: { index: 3, key: 'senior', min: 2000 },
  next: { key: 'mastermind', min: 5000, remaining: 2900 },
}

test('shows hero, title and progress to next rank', () => {
  const { container } = render(<HeroCard summary={senior} />)
  expect(screen.getByText('🦉')).toBeInTheDocument()
  expect(screen.getByText('Senior Hunter')).toBeInTheDocument()
  expect(screen.getByText('2900 to Mastermind')).toBeInTheDocument()
  expect(container.querySelector('.hero-rank-3')).not.toBeNull()
})

test('null summary renders Rookie placeholder without throwing', () => {
  render(<HeroCard summary={null} />)
  expect(screen.getByText('🐣')).toBeInTheDocument()
  expect(screen.getByText('Rookie')).toBeInTheDocument()
})

test('top rank shows max message', () => {
  render(<HeroCard summary={{ credits: 13000, today: 0, rank: { index: 5, key: 'legend', min: 12000 }, next: null }} />)
  expect(screen.getByText('Legend')).toBeInTheDocument()
  expect(screen.getByText('Top rank reached!')).toBeInTheDocument()
})
