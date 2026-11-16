import { lobbyInviteCardModel } from './lobbyShare'
import { setLang } from '../i18n'

beforeEach(() => setLang('en'))

test('builds a room-invite share card model', () => {
  const m = lobbyInviteCardModel('ABCD', 3, 10, 'https://x/r/ABCD')
  expect(m.title).toBe('Spy Hunt')
  expect(m.puzzle).toBe('Room ABCD')
  expect(m.tiles.find((t) => t.label === 'Players')?.value).toBe('3/10')
  expect(m.scanHint).toBe('Scan to join')
  expect(m.url).toBe('https://x/r/ABCD')
})
