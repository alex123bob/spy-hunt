import { render } from '@testing-library/react'
import { Sparkline } from './Sparkline'

test('renders one point per value', () => {
  const { container } = render(<Sparkline values={[1, 3, 2, 5, 4]} />)
  expect(container.querySelector('svg')).toBeInTheDocument()
  expect(container.querySelector('polyline, path')).toBeInTheDocument()
})

test('renders a flat line without dividing by zero when every value is equal', () => {
  const { container } = render(<Sparkline values={[0, 0, 0, 0]} />)
  expect(container.querySelector('svg')).toBeInTheDocument()
})
