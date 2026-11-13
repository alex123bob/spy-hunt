import { render, screen } from '@testing-library/react'
import { RankBadge } from './RankBadge'
import { setLang } from '../i18n'

beforeEach(() => setLang('en'))

test('renders the hero emoji with an accessible title', () => {
  render(<RankBadge rank={2} />)
  const el = screen.getByRole('img')
  expect(el).toHaveTextContent('🕵️')
  expect(el).toHaveAttribute('aria-label')
})

test('renders nothing without a rank', () => {
  const { container } = render(<><RankBadge rank={null} /><RankBadge /></>)
  expect(container).toBeEmptyDOMElement()
})
