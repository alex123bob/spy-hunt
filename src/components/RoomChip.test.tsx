import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RoomChip } from './RoomChip'
import { setLang } from '../i18n'
import { refreshMyRoom, setMyRoom } from '../state/myRoom'

// the chip refreshes from the server on navigation; here the store is driven directly
vi.mock('../state/myRoom', async () => {
  const actual = await vi.importActual<typeof import('../state/myRoom')>('../state/myRoom')
  return { ...actual, refreshMyRoom: vi.fn().mockResolvedValue(undefined) }
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoomChip />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setLang('en')
  setMyRoom(null)
})

test('links back to the room the player is in', () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  renderAt('/bots')
  const link = screen.getByRole('link', { name: /ABC/ })
  expect(link).toHaveAttribute('href', '/r/ABC')
})

test('renders nothing when the player is in no room', () => {
  renderAt('/bots')
  expect(screen.queryByRole('link')).toBeNull()
})

test('is hidden on that same room screen', () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  renderAt('/r/ABC')
  expect(screen.queryByRole('link')).toBeNull()
})

test('is shown on a different room screen', () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  renderAt('/r/DEF')
  expect(screen.getByRole('link', { name: /ABC/ })).toBeInTheDocument()
})

test('is hidden on the landing page, which has its own banner', () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  renderAt('/')
  expect(screen.queryByRole('link')).toBeNull()
})

test('is hidden on that same room screen even with a trailing slash', () => {
  setMyRoom({ code: 'ABC', status: 'lobby' })
  renderAt('/r/ABC/')
  expect(screen.queryByRole('link')).toBeNull()
})

test('refreshes the player room on every page, including a room screen (hard load of another room)', () => {
  vi.mocked(refreshMyRoom).mockClear()
  renderAt('/bots')
  expect(refreshMyRoom).toHaveBeenCalledTimes(1)
  vi.mocked(refreshMyRoom).mockClear()
  renderAt('/r/DEF')
  expect(refreshMyRoom).toHaveBeenCalledTimes(1)
})
