import { fireEvent, render, screen } from '@testing-library/react'
import { AddBotMenu } from './AddBotMenu'
import type { BotCard } from '../api/types'

const bot = (id: string, name: string) => ({ id, name, avatar: { emoji: '🤖', color: '#ff6b6b', frame: 'none' } }) as unknown as BotCard
const row = () => screen.getByRole('button', { name: 'Add a bot' })

test('host with no bots sees only Random bot', () => {
  const onAdd = vi.fn()
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={onAdd} />)
  expect(row()).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(row())
  expect(row()).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Random bot' }))
  expect(onAdd).toHaveBeenCalledWith()
})

test('non-host with no bots renders nothing', () => {
  const { container } = render(<AddBotMenu isHost={false} myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

test('non-host lists bots; picking calls onAdd and closes', () => {
  const onAdd = vi.fn()
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel'), bot('b2', 'Zed')]} ownBotIn={null} onAdd={onAdd} />)
  fireEvent.click(row())
  expect(screen.queryByRole('menuitem', { name: 'Random bot' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: /Pixel/ }))
  expect(onAdd).toHaveBeenCalledWith('b1')
  expect(screen.queryByRole('menu')).toBeNull()
})

test('ownBotIn shows message instead of bot rows; host keeps Random', () => {
  render(<AddBotMenu isHost myBots={[bot('b1', 'Pixel')]} ownBotIn={bot('b1', 'Pixel')} onAdd={vi.fn()} />)
  fireEvent.click(row())
  expect(screen.getByText('Your bot Pixel is already in this room. Remove it to add a different one.')).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: /Pixel/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Random bot' })).toBeInTheDocument()
})

test('Esc closes and refocuses row', () => {
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  fireEvent.click(row())
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(row()).toHaveFocus()
})

test('outside pointerdown closes', () => {
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  fireEvent.click(row())
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
})
