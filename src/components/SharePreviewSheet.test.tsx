import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharePreviewSheet } from './SharePreviewSheet'
import { drawCard, shareCard, downloadCard } from '../daily/share'
import type { ShareCardModel } from '../daily/share'

vi.mock('../daily/share', () => ({ drawCard: vi.fn(), shareCard: vi.fn(), downloadCard: vi.fn() }))

const model: ShareCardModel = {
  title: 'Spy Hunt', puzzle: 'tagline', solved: true, verdict: 'Trust nobody!',
  mascot: '🕵️', hero: '', rankTitle: '', tiles: [], badge: null, scanHint: 'Scan to play', url: 'https://x/',
}

const props = {
  model, label: 'Share Spy Hunt', sub: "Here's what friends will see.",
  shareText: 'share me\nhttps://x/', filename: 'spy-hunt.png',
  shareLabel: 'Share', saveLabel: 'Save image',
  onClose: vi.fn(), onOutcome: vi.fn(),
  sharedText: 'Shared', copiedText: 'Copied!', failedText: 'Could not share.', savedText: 'Image saved!',
}

beforeEach(() => {
  vi.mocked(drawCard).mockReset().mockResolvedValue(undefined)
  vi.mocked(shareCard).mockReset()
  vi.mocked(downloadCard).mockReset()
  props.onClose = vi.fn()
  props.onOutcome = vi.fn()
})

test('draws the model onto a visible canvas on open', async () => {
  render(<SharePreviewSheet {...props} />)
  await waitFor(() => expect(drawCard).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), model))
})

test('shows the dialog title, subtitle, and both action buttons', () => {
  render(<SharePreviewSheet {...props} />)
  expect(screen.getByRole('dialog', { name: 'Share Spy Hunt' })).toBeInTheDocument()
  expect(screen.getByText("Here's what friends will see.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save image' })).toBeInTheDocument()
})

test('Share calls shareCard with the model/text/filename, reports the toast, and closes', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalledWith({ model, text: props.shareText, filename: props.filename }))
  expect(props.onOutcome).toHaveBeenCalledWith('Copied!')
  expect(props.onClose).toHaveBeenCalled()
})

test('a cancelled native share closes the dialog with no toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('cancelled')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  expect(props.onOutcome).toHaveBeenCalledWith('')
  expect(props.onClose).toHaveBeenCalled()
})

test('a failed share reports the failure toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('failed')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(props.onOutcome).toHaveBeenCalledWith('Could not share.'))
})

test('Save image calls downloadCard with the model/filename, reports saved, and closes', async () => {
  vi.mocked(downloadCard).mockResolvedValue(true)
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(downloadCard).toHaveBeenCalledWith(model, props.filename))
  expect(props.onOutcome).toHaveBeenCalledWith('Image saved!')
  expect(props.onClose).toHaveBeenCalled()
})

test('a failed Save image reports the failure toast', async () => {
  vi.mocked(downloadCard).mockResolvedValue(false)
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(props.onOutcome).toHaveBeenCalledWith('Could not share.'))
})

test('a double tap on Share only shares once', async () => {
  vi.mocked(shareCard).mockResolvedValue('shared')
  render(<SharePreviewSheet {...props} />)
  const btn = screen.getByRole('button', { name: 'Share' })
  fireEvent.click(btn)
  fireEvent.click(btn)
  await waitFor(() => expect(props.onClose).toHaveBeenCalled())
  expect(shareCard).toHaveBeenCalledTimes(1)
})

test('Save image while a share is in flight does nothing', async () => {
  vi.mocked(shareCard).mockResolvedValue('shared')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(props.onClose).toHaveBeenCalled())
  expect(downloadCard).not.toHaveBeenCalled()
})

test('re-rendering with an equal but new model object does not redraw the canvas', async () => {
  const { rerender } = render(<SharePreviewSheet {...props} />)
  await waitFor(() => expect(drawCard).toHaveBeenCalledTimes(1))
  rerender(<SharePreviewSheet {...props} model={{ ...model }} />)
  await act(async () => {})
  expect(drawCard).toHaveBeenCalledTimes(1)
})
