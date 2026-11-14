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

test('non-host lists bots; picking calls onAdd and keeps the menu open', () => {
  const onAdd = vi.fn()
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel'), bot('b2', 'Zed')]} ownBotIn={null} onAdd={onAdd} />)
  fireEvent.click(row())
  expect(screen.queryByRole('menuitem', { name: 'Random bot' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: /Pixel/ }))
  expect(onAdd).toHaveBeenCalledWith('b1')
  expect(screen.getByRole('menu')).toBeInTheDocument()
})

test('ownBotIn shows message instead of bot rows; host keeps Random', () => {
  render(<AddBotMenu isHost myBots={[bot('b1', 'Pixel')]} ownBotIn={bot('b1', 'Pixel')} onAdd={vi.fn()} />)
  fireEvent.click(row())
  const note = screen.getByText('Your bot Pixel is already in this room. Remove it to add a different one.')
  expect(note).toBeInTheDocument()
  expect(note.closest('[role="menu"]')).toBeNull()
  expect(row()).toHaveAttribute('aria-describedby', note.id)
  expect(screen.queryByRole('menuitem', { name: /Pixel/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Random bot' })).toBeInTheDocument()
})

test('non-host with a bot already in sees the note and zero menuitems', () => {
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel')]} ownBotIn={bot('b1', 'Pixel')} onAdd={vi.fn()} />)
  fireEvent.click(row())
  expect(screen.getByText('Your bot Pixel is already in this room. Remove it to add a different one.')).toBeInTheDocument()
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
})

test('the Your bots heading sits outside the menu; the row shows an arrow', () => {
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel')]} ownBotIn={null} onAdd={vi.fn()} />)
  expect(row()).toHaveTextContent('+ Add a bot ▾')
  fireEvent.click(row())
  expect(screen.getByText('Your bots').closest('[role="menu"]')).toBeNull()
  expect(screen.getByRole('menu', { name: 'Your bots' })).toBeInTheDocument()
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
