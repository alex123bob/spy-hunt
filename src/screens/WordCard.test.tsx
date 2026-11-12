import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WordCard } from './WordCard'

describe('WordCard', () => {
  it('starts showing the word and flips to secret', () => {
    const { container } = render(<WordCard word="Subway" />)
    const btn = screen.getByRole('button', { name: 'Tap to hide' })
    expect(container.querySelector('.face.front')).not.toHaveAttribute('aria-hidden')
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Tap to show your word' })).toBeInTheDocument()
    expect(container.querySelector('.face.front')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders nothing without a word', () => {
    const { container } = render(<WordCard word={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
