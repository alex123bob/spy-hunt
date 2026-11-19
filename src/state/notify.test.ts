import { fireNotification, notificationsSupported } from './notify'

const OriginalNotification = globalThis.Notification

afterEach(() => {
  globalThis.Notification = OriginalNotification
})

test('notificationsSupported is false when Notification is undefined', () => {
  // @ts-expect-error deleting a global for the test
  delete globalThis.Notification
  expect(notificationsSupported()).toBe(false)
})

test('notificationsSupported is true when Notification exists', () => {
  vi.stubGlobal('Notification', function () {})
  expect(notificationsSupported()).toBe(true)
  vi.unstubAllGlobals()
})

test('fireNotification does nothing when Notification is undefined', () => {
  // @ts-expect-error deleting a global for the test
  delete globalThis.Notification
  expect(() => fireNotification('hi')).not.toThrow()
})

test('fireNotification does nothing when permission is not granted', () => {
  const ctor = vi.fn()
  vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'default' }))
  fireNotification('hi')
  expect(ctor).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

test('fireNotification constructs a Notification with title, body and tag when granted', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) { return this })
  vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }))
  fireNotification('Your turn', { body: 'Round 2', tag: 'ABCD:turn:1:2' })
  expect(ctor).toHaveBeenCalledWith('Your turn', expect.objectContaining({ body: 'Round 2', tag: 'ABCD:turn:1:2' }))
  vi.unstubAllGlobals()
})

test('fireNotification wires onclick to focus the window, run onClick, and close itself', () => {
  const instance: { onclick?: () => void; close: () => void } = { close: vi.fn() }
  const ctor = vi.fn().mockImplementation(function () { return instance })
  vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }))
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  const onClick = vi.fn()
  fireNotification('hi', { onClick })
  instance.onclick?.()
  expect(focus).toHaveBeenCalled()
  expect(onClick).toHaveBeenCalled()
  expect(instance.close).toHaveBeenCalled()
  vi.unstubAllGlobals()
  focus.mockRestore()
})

test('fireNotification focuses the window on click even with no onClick given', () => {
  const instance: { onclick?: () => void; close: () => void } = { close: vi.fn() }
  const ctor = vi.fn().mockImplementation(function () { return instance })
  vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }))
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  fireNotification('hi')
  instance.onclick?.()
  expect(focus).toHaveBeenCalled()
  expect(instance.close).toHaveBeenCalled()
  vi.unstubAllGlobals()
  focus.mockRestore()
})

test('fireNotification does not throw when the constructor itself throws (e.g. Android Chrome without a service worker)', () => {
  const ctor = vi.fn().mockImplementation(() => {
    throw new TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.')
  })
  vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }))
  expect(() => fireNotification('hi')).not.toThrow()
  vi.unstubAllGlobals()
})
