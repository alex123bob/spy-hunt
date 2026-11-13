import { fireEvent, render, screen } from '@testing-library/react'
import { WhyButton } from './WhyButton'

test('when blocked, a tap explains why instead of acting', () => {
  const onClick = vi.fn()
  render(<WhyButton why="The room is full." onClick={onClick}>Add bot</WhyButton>)
  const btn = screen.getByRole('button', { name: 'Add bot' })
  expect(btn).toHaveAttribute('aria-disabled', 'true')
  expect(btn).toHaveClass('is-blocked')
  fireEvent.click(btn)
  expect(onClick).not.toHaveBeenCalled()
  expect(screen.getByRole('tooltip')).toHaveTextContent('The room is full.')
  fireEvent.click(btn)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

test('when not blocked it is a normal button', () => {
  const onClick = vi.fn()
  render(<WhyButton why={false} onClick={onClick}>Add bot</WhyButton>)
  const btn = screen.getByRole('button', { name: 'Add bot' })
  expect(btn).not.toHaveAttribute('aria-disabled')
  fireEvent.click(btn)
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('tooltip')).toBeNull()
})
