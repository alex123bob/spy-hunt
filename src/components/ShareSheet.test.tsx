import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShareSheet } from './ShareSheet'
import { setLang } from '../i18n'

beforeEach(() => setLang('en'))

test('shows the QR code, the link, and a working copy button', async () => {
  render(<ShareSheet link="https://x/r/ABCD" onClose={vi.fn()} />)
  expect(screen.getByLabelText('QR code')).toBeInTheDocument()
  expect(screen.getByText('https://x/r/ABCD')).toBeInTheDocument()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://x/r/ABCD'))
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
})

test('Escape closes the sheet', () => {
  const onClose = vi.fn()
  render(<ShareSheet link="https://x/r/ABCD" onClose={onClose} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
