import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FlipCard } from './FlipCard'

describe('FlipCard', () => {
  it('hides the face not showing from assistive tech', () => {
    const { container } = render(
      <FlipCard flipped={false} front={<b>F</b>} back={<b>B</b>} label="card" />,
    )
    expect(container.querySelector('.face.front')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.face.back')).not.toHaveAttribute('aria-hidden')
    expect(screen.getByRole('group', { name: 'card' })).toBeInTheDocument()
  })

  it('hides the back once flipped', () => {
    const { container } = render(
      <FlipCard flipped front={<b>F</b>} back={<b>B</b>} label="card" />,
    )
    expect(container.querySelector('.flip-card')).toHaveClass('flipped')
    expect(container.querySelector('.face.back')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.face.front')).not.toHaveAttribute('aria-hidden')
  })

  it('toggles via onClick and keeps its label', () => {
    const onClick = vi.fn()
    render(<FlipCard flipped={false} front="F" back="B" label="Your card" onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'Your card' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a long word wraps', () => {
    const { container } = render(
      <FlipCard
        flipped
        front={<span className="word wrap">{'超级长的中文词语测试测试'}</span>}
        back="B"
        label="card"
      />,
    )
    expect(container.querySelector('.wrap')).toBeInTheDocument()
  })
})
