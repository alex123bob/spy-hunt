import { render, screen } from '@testing-library/react'
import { StatementBubble } from './StatementBubble'
import { msg } from '../test/fixtures'

test('the name line wraps long names', () => {
  const name = 'Bartholomew-the-Extremely-Long-Name'
  render(<StatementBubble message={msg(1)} name={name} viewerLang="en" />)
  expect(screen.getByText(name)).toHaveClass('wrap')
})
