import { fireEvent, render, screen } from '@testing-library/react'
import { AlreadyInRoomSheet } from './AlreadyInRoomSheet'
import { setLang } from '../i18n'

beforeEach(() => setLang('en'))

function renderSheet(status: 'lobby' | 'playing') {
  const fns = { onReturn: vi.fn(), onLeaveAndContinue: vi.fn(), onClose: vi.fn() }
  render(<AlreadyInRoomSheet code="ABC" status={status} {...fns} />)
  return fns
}

test('names the room the player is already in', () => {
  renderSheet('lobby')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText(/room ABC/)).toBeInTheDocument()
})

test('warns about the bot handover only while the game is playing', () => {
  renderSheet('playing')
  expect(screen.getByText(/hands your seat to a bot/)).toBeInTheDocument()
})

test('shows no bot warning for a lobby', () => {
  renderSheet('lobby')
  expect(screen.queryByText(/hands your seat to a bot/)).toBeNull()
})

test('Return and Leave-and-continue call their handlers', () => {
  const fns = renderSheet('lobby')
  fireEvent.click(screen.getByRole('button', { name: 'Return' }))
  expect(fns.onReturn).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }))
  expect(fns.onLeaveAndContinue).toHaveBeenCalledTimes(1)
})
