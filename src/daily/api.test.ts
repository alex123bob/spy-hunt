import { getDaily, getResult, guessSpy, guessWord } from './api'
import { request } from '../api/client'
import { ensureGuest } from '../state/session'

vi.mock('../api/client', () => ({ request: vi.fn().mockResolvedValue({ ok: 1 }) }))
vi.mock('../state/session', () => ({ ensureGuest: vi.fn().mockResolvedValue({}) }))

beforeEach(() => {
  vi.mocked(request).mockClear()
  vi.mocked(ensureGuest).mockClear()
})

test('getDaily gets /daily after making sure a guest exists', async () => {
  await getDaily()
  expect(ensureGuest).toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('GET', '/daily')
})

test('guessSpy posts the seat', async () => {
  await guessSpy(3)
  expect(request).toHaveBeenCalledWith('POST', '/daily/guess', { spy_seat: 3 })
})

test('guessWord posts the option, null to skip', async () => {
  await guessWord(1)
  expect(request).toHaveBeenLastCalledWith('POST', '/daily/word', { option: 1 })
  await guessWord(null)
  expect(request).toHaveBeenLastCalledWith('POST', '/daily/word', { option: null })
})

test('getResult gets /daily/result', async () => {
  await getResult()
  expect(request).toHaveBeenCalledWith('GET', '/daily/result')
})
