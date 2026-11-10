import { ApiError } from './client'
import { errorText } from './errors'
import { setLang, t } from '../i18n'

beforeEach(() => setLang('en'))

test('network error maps to the network text', () => {
  expect(errorText(new ApiError(0, 'network', 'Network error'))).toBe(t('error.network'))
})

test('known code maps to its text', () => {
  expect(errorText(new ApiError(409, 'bot_in_room', 'English server text'))).toBe('You already have a bot in this room.')
})

test('unknown code and non-ApiError values give the generic text, never the server message', () => {
  const generic = t('error.generic')
  expect(errorText(new ApiError(500, 'weird', 'raw server words'))).toBe(generic)
  expect(errorText(new Error('boom'))).toBe(generic)
  expect(errorText('x')).toBe(generic)
  expect(errorText(null)).toBe(generic)
})

test('zh-Hans mapped text differs from English', () => {
  const en = errorText(new ApiError(409, 'room_full', 'm'))
  setLang('zh-Hans')
  const zh = errorText(new ApiError(409, 'room_full', 'm'))
  expect(zh).not.toBe(en)
  expect(zh).not.toBe('error.code.room_full')
})
