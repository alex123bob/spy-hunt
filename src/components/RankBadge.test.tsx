import { render, screen } from '@testing-library/react'
import { RankBadge } from './RankBadge'
import { setLang } from '../i18n'

beforeEach(() => setLang('en'))

test('renders the hero emoji, named by its rank title', () => {
  render(<RankBadge rank={2} />)
  const el = screen.getByRole('button', { name: 'Spy Hunter' })
  expect(el).toHaveTextContent('🕵️')
})

test('renders nothing for rank 0 (Rookie)', () => {
  const { container } = render(<RankBadge rank={0} />)
  expect(container).toBeEmptyDOMElement()
})

test('renders nothing without a rank', () => {
  const { container } = render(<><RankBadge rank={null} /><RankBadge /></>)
  expect(container).toBeEmptyDOMElement()
})
