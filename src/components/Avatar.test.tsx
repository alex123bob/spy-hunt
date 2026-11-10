import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

test('renders the emoji on the colour', () => {
  const { container } = render(<Avatar player={{ name: 'Bo', avatar: { emoji: '🐙', color: '#123456' } }} />)
  const el = container.querySelector('span.avatar') as HTMLElement
  expect(el).toHaveTextContent('🐙')
  expect(el.style.background).toContain('rgb(18, 52, 86)')
})

test('falls back to the initial, then ?', () => {
  const { rerender } = render(<Avatar player={{ name: 'zed' }} />)
  expect(screen.getByText('z')).toBeInTheDocument()
  rerender(<Avatar player={{ name: '' }} />)
  expect(screen.getByText('?')).toBeInTheDocument()
})
