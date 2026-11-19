import { render, screen, fireEvent } from '@testing-library/react'
import { NotifyToggle } from './NotifyToggle'
import { resetNotifyPrefForTests, setNotifyPref } from '../state/notifyPrefs'
import { setLang } from '../i18n'

const OriginalNotification = globalThis.Notification

beforeEach(() => {
  setLang('en')
  resetNotifyPrefForTests()
})

afterEach(() => {
  globalThis.Notification = OriginalNotification
})

test('renders nothing when Notification is unsupported', () => {
  // @ts-expect-error deleting a global for the test
  delete globalThis.Notification
  render(<NotifyToggle />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('shows "Enable notifications" when permission is default', () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission: vi.fn() }))
  render(<NotifyToggle />)
  expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('clicking when default requests permission and turns the pref on when granted', async () => {
  const requestPermission = vi.fn().mockResolvedValue('granted')
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission }))
  render(<NotifyToggle />)
  fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
  expect(requestPermission).toHaveBeenCalled()
  vi.unstubAllGlobals()
})

test('the button updates to reflect granted permission once the prompt is answered', async () => {
  const stub = Object.assign(vi.fn(), { permission: 'default' as NotificationPermission, requestPermission: vi.fn() })
  vi.mocked(stub.requestPermission).mockImplementation(async () => {
    stub.permission = 'granted'
    return 'granted'
  })
  vi.stubGlobal('Notification', stub)
  render(<NotifyToggle />)
  fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
  expect(await screen.findByRole('button', { name: 'Notifications on' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('the button updates to reflect denied permission once the prompt is answered', async () => {
  const stub = Object.assign(vi.fn(), { permission: 'default' as NotificationPermission, requestPermission: vi.fn() })
  vi.mocked(stub.requestPermission).mockImplementation(async () => {
    stub.permission = 'denied'
    return 'denied'
  })
  vi.stubGlobal('Notification', stub)
  render(<NotifyToggle />)
  fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
  expect(await screen.findByRole('button', { name: 'Notifications blocked' })).toBeDisabled()
  vi.unstubAllGlobals()
})

test('shows enabled state when granted and pref is on; click turns it off', () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted', requestPermission: vi.fn() }))
  setNotifyPref('on')
  render(<NotifyToggle />)
  const btn = screen.getByRole('button', { name: 'Notifications on' })
  fireEvent.click(btn)
  expect(screen.getByRole('button', { name: 'Notifications off' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('shows muted state when granted and pref is off; click turns it back on', () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted', requestPermission: vi.fn() }))
  setNotifyPref('off')
  render(<NotifyToggle />)
  const btn = screen.getByRole('button', { name: 'Notifications off' })
  fireEvent.click(btn)
  expect(screen.getByRole('button', { name: 'Notifications on' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('shows a disabled blocked state when permission is denied', () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied', requestPermission: vi.fn() }))
  render(<NotifyToggle />)
  const btn = screen.getByRole('button', { name: 'Notifications blocked' })
  expect(btn).toBeDisabled()
  vi.unstubAllGlobals()
})

test('reflects permission revoked mid-session on the next render, not a stale cached value', () => {
  const stub = Object.assign(vi.fn(), { permission: 'granted' as NotificationPermission, requestPermission: vi.fn() })
  vi.stubGlobal('Notification', stub)
  setNotifyPref('on')
  const { rerender } = render(<NotifyToggle />)
  expect(screen.getByRole('button', { name: 'Notifications on' })).toBeInTheDocument()
  stub.permission = 'denied' // e.g. the user revoked it in browser settings while the tab stayed open
  rerender(<NotifyToggle />)
  expect(screen.getByRole('button', { name: 'Notifications blocked' })).toBeDisabled()
  vi.unstubAllGlobals()
})
