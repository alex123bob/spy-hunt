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

test('guessSpy posts the seat and the puzzle day', async () => {
  await guessSpy(3, '2026-11-10')
  expect(request).toHaveBeenCalledWith('POST', '/daily/guess', { spy_seat: 3, day: '2026-11-10' })
})

test('guessWord posts the option, null to skip', async () => {
  await guessWord(1, '2026-11-10')
  expect(request).toHaveBeenLastCalledWith('POST', '/daily/word', { option: 1, day: '2026-11-10' })
  await guessWord(null, '2026-11-10')
  expect(request).toHaveBeenLastCalledWith('POST', '/daily/word', { option: null, day: '2026-11-10' })
})

test('getResult asks for the puzzle day', async () => {
  await getResult('2026-11-10')
  expect(request).toHaveBeenCalledWith('GET', '/daily/result?day=2026-11-10')
})
