import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HowToEarn } from './HowToEarn'
import { getCredits } from '../credits/api'
import { t } from '../i18n'

vi.mock('../credits/api', () => ({ getCredits: vi.fn() }))

const rules = { game: { played: 12, won: 8, min_humans: 2 }, daily: { daily: 10, found: 10 }, streak: { step: 5, max: 50 }, daily_cap: 500 }
const summary = { credits: 0, today: 0, rank: { index: 0, key: 'rookie', min: 0 }, next: null, rules }

function app(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/me" element={<p>profile page</p>} />
        <Route path="/credits/how" element={<HowToEarn />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('lists each activity with what the server pays for it', async () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  app(['/credits/how'])
  expect(screen.getByRole('heading', { name: t('credits.howTitle') })).toBeInTheDocument()
  const guide = screen.getByTestId('earn-guide')
  await waitFor(() => expect(guide.textContent).toContain('+12'))
  const rows = guide.querySelectorAll('.earn-row')
  expect(rows).toHaveLength(5)
  expect(rows[0].textContent).toContain(t('credits.how.played', { n: 2 }))
  expect(rows[1].textContent).toContain('+8')
  expect(guide.textContent).toContain(t('credits.how.cap', { n: 500 }))
})

test('falls back to default rules when /credits fails', async () => {
  vi.mocked(getCredits).mockRejectedValue(new Error('boom'))
  app(['/credits/how'])
  await waitFor(() => expect(getCredits).toHaveBeenCalled())
  expect(screen.getByTestId('earn-guide').querySelectorAll('.earn-row')).toHaveLength(5)
})

test('back returns to the page it was opened from', () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  app(['/me', '/credits/how'])
  fireEvent.click(screen.getByRole('button', { name: /Back/ }))
  expect(screen.getByText('profile page')).toBeInTheDocument()
})

test('back goes to the profile when the page was opened directly', () => {
  vi.mocked(getCredits).mockResolvedValue(summary)
  app(['/credits/how'])
  fireEvent.click(screen.getByRole('button', { name: /Back/ }))
  expect(screen.getByText('profile page')).toBeInTheDocument()
})
