import { render, screen } from '@testing-library/react'
import { PlayerChip } from './PlayerChip'
import type { Player } from '../api/types'

const p = (o: Partial<Player> = {}): Player => ({ seat: 1, name: 'Bo', lang: 'en', is_bot: true, alive: true, connected: true, is_host: false, ...o })

test('a custom bot links to its page', () => {
  render(<PlayerChip player={p({ bot_id: 'abc12345' })} />)
  const a = screen.getByRole('link', { name: 'Bo' })
  expect(a).toHaveAttribute('href', '/bot/abc12345')
  expect(a).toHaveAttribute('target', '_blank')
})

test('no bot_id, no link', () => {
  render(<PlayerChip player={p()} />)
  expect(screen.queryByRole('link')).toBeNull()
})

test('long names keep wrap', () => {
  const name = 'x'.repeat(100)
  render(<PlayerChip player={p({ name })} />)
  expect(screen.getByText(name)).toHaveClass('wrap')
})
