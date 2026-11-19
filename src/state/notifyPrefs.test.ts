import { renderHook } from '@testing-library/react'
import { getNotifyPref, resetNotifyPrefForTests, setNotifyPref, useNotifyPref } from './notifyPrefs'

beforeEach(() => resetNotifyPrefForTests())

test('defaults to on with nothing stored', () => {
  expect(getNotifyPref()).toBe('on')
})

test('setNotifyPref persists and is read back', () => {
  setNotifyPref('off')
  expect(getNotifyPref()).toBe('off')
})

test('useNotifyPref reflects the stored value and updates on change', () => {
  const { result, rerender } = renderHook(() => useNotifyPref())
  expect(result.current).toBe('on')
  setNotifyPref('off')
  rerender()
  expect(result.current).toBe('off')
})

test('a blocked localStorage does not throw and keeps the in-memory value', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => setNotifyPref('off')).not.toThrow()
  expect(getNotifyPref()).toBe('off')
  spy.mockRestore()
})
