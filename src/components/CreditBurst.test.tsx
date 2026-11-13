import { act, render, screen } from '@testing-library/react'
import { BURST_START_MS, BURST_STEP_MS, CreditBurst } from './CreditBurst'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const parts = [{ kind: 'played' as const, n: 10 }, { kind: 'won' as const, n: 10 }]

test('renders nothing when nothing was earned', () => {
  const { container } = render(<CreditBurst total={0} />)
  expect(container.firstChild).toBeNull()
})

test('pops in one chip per source, in order', () => {
  const { container } = render(<CreditBurst total={20} parts={parts} />)
  expect(screen.getByTestId('credits-earned')).toHaveTextContent('+20 credits')
  expect(container.querySelectorAll('.credit-chip')).toHaveLength(0)
  act(() => { vi.advanceTimersByTime(BURST_START_MS) })
  expect(container.querySelectorAll('.credit-chip')).toHaveLength(1)
  expect(container.querySelector('.credit-chip')).toHaveTextContent('+10 Played a game')
  act(() => { vi.advanceTimersByTime(BURST_STEP_MS) })
  const chips = container.querySelectorAll('.credit-chip')
  expect(chips).toHaveLength(2)
  expect(chips[1]).toHaveTextContent('+10 Your side won')
  expect(container.querySelector('.credit-float')).toHaveTextContent('+10')
})

test('without parts it shows the total as a single chip', () => {
  const { container } = render(<CreditBurst total={35} />)
  act(() => { vi.advanceTimersByTime(BURST_START_MS) })
  const chips = container.querySelectorAll('.credit-chip')
  expect(chips).toHaveLength(1)
  expect(chips[0]).toHaveTextContent('+35 Credits')
})

test('reduced motion shows everything at once with the final total', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: true, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList)
  window.matchMedia = globalThis.matchMedia
  const { container } = render(<CreditBurst total={20} parts={parts} />)
  expect(container.querySelectorAll('.credit-chip')).toHaveLength(2)
  expect(container.querySelector('.credit-total strong')).toHaveTextContent('+20')
  expect(container.querySelector('.credit-float')).toBeNull()
  vi.unstubAllGlobals()
  // @ts-expect-error jsdom has no matchMedia by default
  delete window.matchMedia
})
