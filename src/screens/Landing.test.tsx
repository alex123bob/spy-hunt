import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Landing } from './Landing'
import { setLang } from '../i18n'

vi.mock('../state/session', async () => {
  let name = ''
  return {
    getSession: () => ({ playerId: 'p', token: 't', lang: 'en', name }),
    setName: (n: string) => { name = n },
    setSessionLang: () => {},
    ensureGuest: vi.fn().mockResolvedValue({}),
  }
})

function Where() { return <div data-testid="loc">{useLocation().pathname}</div> }

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={<Landing />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => setLang('en'))

test('join code is uppercased and trimmed', async () => {
  renderLanding()
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } })
  fireEvent.change(screen.getByLabelText('Room code'), { target: { value: '  abcd ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/r/ABCD'))
})

test('name input is limited to 16 characters and language picker is visible', () => {
  renderLanding()
  expect(screen.getByLabelText('Your name')).toHaveAttribute('maxLength', '16')
  expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
})
