import { render, screen } from '@testing-library/react'
import { Loader } from './Loader'

test('renders a status with its label', () => {
  render(<Loader label="Loading…" />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
})
