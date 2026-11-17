import { fireEvent, render, screen } from '@testing-library/react'
import { AddBotMenu } from './AddBotMenu'
import type { BotCard } from '../api/types'

const bot = (id: string, name: string) => ({ id, name, avatar: { emoji: '🤖', color: '#ff6b6b', frame: 'none' } }) as unknown as BotCard
const pill = () => screen.getByRole('button', { name: 'Add a bot' })
const NOTE = 'Your bot Pixel is already in this room. Remove it to add a different one.'

test('host with no bots sees only Random bot', () => {
  const onAdd = vi.fn()
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={onAdd} />)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(pill())
  expect(screen.getByRole('dialog', { name: 'Add a bot' })).toBeInTheDocument()
  expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Random bot' }))
  expect(onAdd).toHaveBeenCalledWith()
})

test('non-host with no bots renders nothing', () => {
  const { container } = render(<AddBotMenu isHost={false} myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

test('non-host lists bots; picking calls onAdd and closes the sheet', () => {
  const onAdd = vi.fn()
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel'), bot('b2', 'Zed')]} ownBotIn={null} onAdd={onAdd} />)
  fireEvent.click(pill())
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'Random bot' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: /Pixel/ }))
  expect(onAdd).toHaveBeenCalledWith('b1')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('picking Random bot closes the sheet so a server error is not hidden behind it', () => {
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  fireEvent.click(pill())
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Random bot' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('ownBotIn shows the note instead of bot rows; host keeps Random', () => {
  render(<AddBotMenu isHost myBots={[bot('b1', 'Pixel')]} ownBotIn={bot('b1', 'Pixel')} onAdd={vi.fn()} />)
  fireEvent.click(pill())
  const note = screen.getByText(NOTE)
  expect(note.closest('[role="menu"]')).toBeNull()
  expect(screen.queryByRole('menuitem', { name: /Pixel/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Random bot' })).toBeInTheDocument()
})

test('non-host with a bot already in sees the note and zero menuitems', () => {
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel')]} ownBotIn={bot('b1', 'Pixel')} onAdd={vi.fn()} />)
  fireEvent.click(pill())
  expect(screen.getByText(NOTE)).toBeInTheDocument()
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
})

test('the pill reads "+ Bot" and the Your bots heading sits outside the menu', () => {
  render(<AddBotMenu isHost={false} myBots={[bot('b1', 'Pixel')]} ownBotIn={null} onAdd={vi.fn()} />)
  expect(pill()).toHaveTextContent('+ Bot')
  fireEvent.click(pill())
  expect(screen.getByText('Your bots').closest('[role="menu"]')).toBeNull()
  expect(screen.getByRole('menu', { name: 'Your bots' })).toBeInTheDocument()
})

test('Esc closes the sheet and refocuses the pill', () => {
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  fireEvent.click(pill())
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(pill()).toHaveFocus()
})

test('clicking the backdrop closes the sheet', () => {
  render(<AddBotMenu isHost myBots={[]} ownBotIn={null} onAdd={vi.fn()} />)
  fireEvent.click(pill())
  fireEvent.click(document.querySelector('.sheet-backdrop')!)
  expect(screen.queryByRole('dialog')).toBeNull()
})
