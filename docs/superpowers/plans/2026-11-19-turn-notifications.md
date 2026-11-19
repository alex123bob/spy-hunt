# Turn & Game-Start Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player opt in to native OS notifications for "game started" / "it's your turn", delivered while the tab is backgrounded, with an in-app toast as the focused-but-elsewhere-in-the-app fallback.

**Architecture:** A pure event-detection function diffs consecutive `Snapshot`s for "game started" / "my turn" transitions. Two thin consumers use it: `useGameNotify` (mounted inside the existing `Room.tsx`, fires native notifications only when unfocused) and `RoomWatcher` (mounted once at the app shell, opens its own short-lived SSE connection whenever the player has an active room but isn't on that room's own page, firing a toast when focused and a native notification when not). A small toggle component drives the opt-in/permission state. No backend changes.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library, the existing hand-rolled `useSyncExternalStore` state modules, the browser `Notification` API.

**Spec:** `docs/superpowers/specs/2026-11-19-turn-notifications-design.md`

## Global Constraints
- No backend changes; everything is derived from the existing SSE stream and `GET /rooms/{code}` snapshot.
- No service worker / manifest / PWA installability — notifications only work while the tab is open (foreground or backgrounded), never fully closed.
- The notify toggle renders only when `typeof Notification !== 'undefined'` (hides itself entirely on iOS Safari and any other unsupported browser).
- `fireNotification` must never throw, regardless of permission state or browser support — all call sites can call it unconditionally.
- A native notification uses `tag: \`${code}:${kind}:${game_no}:${round}\`` so a second tab's notification for the same event replaces rather than stacks.
- `RoomWatcher`'s stream must never be open at the same time as `Room.tsx`'s own stream for the same room in one tab — it tears down the moment the pathname becomes that room's own page.
- `RoomWatcher`'s toast renders through a second, top-anchored `<Toast/>` (a `toast-top` CSS modifier) so it never visually overlaps a bottom-anchored toast on whatever other screen is showing.
- New i18n keys go in both `src/i18n/en.json` and `src/i18n/zh-Hans.json` (flat keys, same key in both files) to satisfy the existing key-parity test.

## Review Focus
- A player who is host and also the first-to-speak: `game_started` and becoming-my-turn can arrive in the same snapshot transition (seat 0 both starts and speaks first in a small room) — `detectNotifyEvent` must be able to return (or the consumer must handle) both signals from one diff, not just the first match found, or one event gets silently dropped.
- A player who is eliminated (`alive: false`) must never get a "your turn" notification even if `current_speaker` briefly still names their seat during a transition — `detectNotifyEvent` must gate on `alive`.
- Permission revoked after being granted (`Notification.permission` flips to `'denied'` between renders, e.g. user changed browser settings mid-session): the toggle must reflect the live value next render, not a stale cached one, and `fireNotification` must no-op rather than throwing `new Notification()` with denied permission.
- Rapid rematch-to-rematch (`status` goes `playing` → `lobby` → `playing` again within one SSE session): `useGameNotify`/`RoomWatcher`'s "previous snapshot" ref must correctly treat each new `playing` transition as a fresh "started" event, not suppress it because a `playing` value was already seen earlier in the session.
- `RoomWatcher` mounted with no active room (`useMyRoom()` returns `null`, the common case for most users): it must render nothing and open no network connection at all, not just suppress notifications once connected.

---

## Task 1: `detectNotifyEvent` — shared event detection

**Files:**
- Create: `src/state/notifyEvents.ts`
- Test: `src/state/notifyEvents.test.ts`

**Interfaces:**
- Produces: `export type NotifyEvent = { kind: 'started' } | { kind: 'turn' }` and `export function detectNotifyEvents(prev: Snapshot | null, next: Snapshot): NotifyEvent[]` — returns zero, one, or two events (order: `'started'` before `'turn'` when both fire from the same transition), consumed by Task 3 and Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
import { detectNotifyEvents } from './notifyEvents'
import type { Player, Snapshot } from '../api/types'

const p = (seat: number, overrides: Partial<Player> = {}): Player =>
  ({ seat, name: `P${seat}`, lang: 'en', is_bot: false, alive: true, connected: true, is_host: seat === 0, ...overrides }) as Player

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'lobby', phase: null, phase_deadline: null, round: 0, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0, players: [p(0), p(1)], messages: [], current_speaker: null,
    me: { seat: 0, is_host: true, my_word: null }, winner: null, last_seq: 1, server_time: Date.now(), locked: [],
    ...overrides,
  } as Snapshot
}

test('no prev snapshot: no events', () => {
  expect(detectNotifyEvents(null, snap())).toEqual([])
})

test('status lobby -> playing: started', () => {
  const prev = snap({ status: 'lobby' })
  const next = snap({ status: 'playing', current_speaker: 1 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'started' }])
})

test('rematch playing -> lobby -> playing again: started fires each time', () => {
  const a = snap({ status: 'playing', game_no: 1 })
  const b = snap({ status: 'lobby', game_no: 2 })
  const c = snap({ status: 'playing', game_no: 2, current_speaker: 1 })
  expect(detectNotifyEvents(a, b)).toEqual([])
  expect(detectNotifyEvents(b, c)).toEqual([{ kind: 'started' }])
})

test('current_speaker becomes my seat: turn', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 1 })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'turn' }])
})

test('current_speaker becomes my seat but I am eliminated: no turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 1, players: [p(0, { alive: false }), p(1)] })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0, players: [p(0, { alive: false }), p(1)] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('entering an unlocked vote phase while alive and not locked: turn', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [] })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'turn' }])
})

test('entering vote phase already locked (e.g. reconnect mid-phase): no turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'vote', current_speaker: null, locked: [0] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('host who also speaks first: started and turn both fire from one transition', () => {
  const prev = snap({ status: 'lobby', current_speaker: null })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([{ kind: 'started' }, { kind: 'turn' }])
})

test('different room code: no events even if the shape looks like a turn change', () => {
  const prev = snap({ code: 'ABCD', status: 'playing', phase: 'describe', current_speaker: 1 })
  const next = snap({ code: 'WXYZ', status: 'playing', phase: 'describe', current_speaker: 0 })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})

test('current_speaker unchanged: no repeated turn event', () => {
  const prev = snap({ status: 'playing', phase: 'describe', current_speaker: 0 })
  const next = snap({ status: 'playing', phase: 'describe', current_speaker: 0, messages: [{ id: 1 } as never] })
  expect(detectNotifyEvents(prev, next)).toEqual([])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/notifyEvents.test.ts`
Expected: FAIL with "Cannot find module './notifyEvents'" (or similar)

- [ ] **Step 3: Implement `detectNotifyEvents` in `src/state/notifyEvents.ts`**

"My turn" is true when: `next.status === 'playing'`, I'm alive (`next.players.find(p => p.seat === next.me.seat)?.alive`), and either (a) `next.phase === 'describe' || next.phase === 'tiebreak_describe'` and `next.current_speaker === next.me.seat`, or (b) `next.phase === 'vote' || next.phase === 'revote'` and `!(next.locked ?? []).includes(next.me.seat)`. A `'turn'` event fires only when that boolean is false on `prev` (or `prev` is `null`... no — per the "no prev" test, `prev === null` returns `[]` outright, checked first) and true on `next`. Guard `prev === null || prev.code !== next.code` by returning `[]` immediately. `'started'` fires when `prev.status !== 'playing' && next.status === 'playing'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/state/notifyEvents.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/state/notifyEvents.ts src/state/notifyEvents.test.ts
git commit -m "feat: detect game-started and my-turn transitions from room snapshots"
```

---

## Task 2: `notify.ts` and `notifyPrefs.ts` — notification plumbing and opt-in preference

**Files:**
- Create: `src/state/notify.ts`
- Create: `src/state/notifyPrefs.ts`
- Test: `src/state/notify.test.ts`
- Test: `src/state/notifyPrefs.test.ts`

**Interfaces:**
- Produces (`notify.ts`): `export function notificationsSupported(): boolean`; `export function fireNotification(title: string, opts?: { body?: string; tag?: string; onClick?: () => void }): void`.
- Produces (`notifyPrefs.ts`): `export type NotifyPref = 'on' | 'off'`; `export function getNotifyPref(): NotifyPref`; `export function setNotifyPref(p: NotifyPref): void`; `export function useNotifyPref(): NotifyPref`; `export function resetNotifyPrefForTests(): void`. Default value (no stored preference yet) is `'on'`.
- Consumed by: Task 3 (`useGameNotify`), Task 4 (`NotifyToggle`), Task 5 (`RoomWatcher`).

- [ ] **Step 1: Write the failing tests for `notify.ts`**

```ts
import { fireNotification, notificationsSupported } from './notify'

const OriginalNotification = globalThis.Notification

afterEach(() => {
  // @ts-expect-error restoring a possibly-undefined global
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
  const ctor = vi.fn().mockImplementation(() => instance)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/notify.test.ts`
Expected: FAIL with "Cannot find module './notify'"

- [ ] **Step 3: Implement `notify.ts`**

`notificationsSupported` returns `typeof Notification !== 'undefined'`. `fireNotification` returns early (no-op) when unsupported or `Notification.permission !== 'granted'`; otherwise constructs `new Notification(title, { body: opts?.body, tag: opts?.tag })`, and if `opts?.onClick` is given, sets `.onclick` to a function that calls `window.focus()`, then `opts.onClick()`, then `n.close()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/state/notify.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `notifyPrefs.ts`**

Follow `src/state/nudges.ts` / `src/state/nudges.test.ts` conventions exactly (module-level `memory`, try/catch over `localStorage`/`sessionStorage`, a `resetNotifyPrefForTests()` escape hatch, a `Set<() => void>` listener set backing `useNotifyPref`).

```ts
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/state/notifyPrefs.test.ts`
Expected: FAIL with "Cannot find module './notifyPrefs'"

- [ ] **Step 7: Implement `notifyPrefs.ts`**

Mirror `src/state/nudges.ts`'s `load`/`save`/`stores()` helpers, storage key `'spy-hunt.notify-pref'`, shape `{ pref: NotifyPref }`, defaulting to `{ pref: 'on' }` when nothing parses. `useNotifyPref` uses `useSyncExternalStore` over the same listener-set pattern `myRoom.ts` uses.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/state/notifyPrefs.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/state/notify.ts src/state/notify.test.ts src/state/notifyPrefs.ts src/state/notifyPrefs.test.ts
git commit -m "feat: add Notification wrapper and persisted opt-in preference"
```

---

## Task 3: `useGameNotify` — in-room native notifications

**Files:**
- Create: `src/state/useGameNotify.ts`
- Test: `src/state/useGameNotify.test.tsx`
- Modify: `src/screens/Room.tsx` (add the hook call inside `RoomView`)

**Interfaces:**
- Consumes: `detectNotifyEvents` (Task 1), `fireNotification`, `notificationsSupported` (Task 2's `notify.ts`), `getNotifyPref` (Task 2's `notifyPrefs.ts`), i18n `t()`.
- Produces: `export function useGameNotify(state: Snapshot): void` — no return value, side-effect only. Called from `RoomView` in `Room.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import { renderHook } from '@testing-library/react'
import { useGameNotify } from './useGameNotify'
import { fireNotification } from './notify'
import { getNotifyPref } from './notifyPrefs'
import type { Player, Snapshot } from '../api/types'

vi.mock('./notify', () => ({ fireNotification: vi.fn(), notificationsSupported: () => true }))
vi.mock('./notifyPrefs', () => ({ getNotifyPref: vi.fn(() => 'on') }))

const p = (seat: number, overrides: Partial<Player> = {}): Player =>
  ({ seat, name: `P${seat}`, lang: 'en', is_bot: false, alive: true, connected: true, is_host: seat === 0, ...overrides }) as Player

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'lobby', phase: null, phase_deadline: null, round: 0, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0, players: [p(0), p(1)], messages: [], current_speaker: null,
    me: { seat: 0, is_host: true, my_word: null }, winner: null, last_seq: 1, server_time: Date.now(), locked: [],
    ...overrides,
  } as Snapshot
}

beforeEach(() => {
  vi.mocked(fireNotification).mockClear()
  vi.mocked(getNotifyPref).mockReturnValue('on')
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
})

afterEach(() => vi.restoreAllMocks())

const setup = (s: Snapshot) => renderHook(({ s }: { s: Snapshot }) => useGameNotify(s), { initialProps: { s } })

test('no notification on first render', () => {
  setup(snap())
  expect(fireNotification).not.toHaveBeenCalled()
})

test('fires a notification when the game starts, while unfocused', () => {
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).toHaveBeenCalledTimes(1)
})

test('fires a notification when it becomes my turn, while unfocused', () => {
  const h = setup(snap({ status: 'playing', phase: 'describe', current_speaker: 1 }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0 }) })
  expect(fireNotification).toHaveBeenCalledTimes(1)
})

test('does nothing while the tab is focused', () => {
  vi.mocked(document.hasFocus).mockReturnValue(true)
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).not.toHaveBeenCalled()
})

test('does nothing when the pref is off, even unfocused', () => {
  vi.mocked(getNotifyPref).mockReturnValue('off')
  const h = setup(snap({ status: 'lobby' }))
  h.rerender({ s: snap({ status: 'playing', current_speaker: 1 }) })
  expect(fireNotification).not.toHaveBeenCalled()
})

test('fires twice, in order, when started and turn both land in one transition', () => {
  const h = setup(snap({ status: 'lobby', current_speaker: null }))
  h.rerender({ s: snap({ status: 'playing', phase: 'describe', current_speaker: 0 }) })
  expect(fireNotification).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/useGameNotify.test.tsx`
Expected: FAIL with "Cannot find module './useGameNotify'"

- [ ] **Step 3: Implement `useGameNotify` in `src/state/useGameNotify.ts`**

Keep `prev` in a `useRef<Snapshot | null>(null)`. In a `useEffect` keyed on `state`: read `prevRef.current`, compute `detectNotifyEvents(prev, state)`, set `prevRef.current = state`. For each returned event, if `!document.hasFocus() && getNotifyPref() === 'on'`, call `fireNotification(...)` with `tag: \`${state.code}:${event.kind}:${state.game_no}:${state.round}\`` and title text from new i18n keys `notify.started` / `notify.turn` (added in Task 6). `notificationsSupported()` is not checked here directly — `fireNotification` already no-ops safely when unsupported, per Task 2 — but call it anyway to avoid needless `Notification.permission` reads: guard the whole per-event block with `if (!notificationsSupported()) return` before the loop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/state/useGameNotify.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into `Room.tsx`**

In `src/screens/Room.tsx`, import `useGameNotify` and call `useGameNotify(state)` inside `RoomView` (around line 211, alongside the existing `const hostNote = useHostChange(state)`). No change to what `RoomView` renders.

- [ ] **Step 6: Run the full existing Room test file to confirm no regression**

Run: `npx vitest run src/screens/Room.test.tsx`
Expected: PASS (unchanged behavior)

- [ ] **Step 7: Commit**

```bash
git add src/state/useGameNotify.ts src/state/useGameNotify.test.tsx src/screens/Room.tsx
git commit -m "feat: fire native notifications for game-started/my-turn while the room tab is unfocused"
```

---

## Task 4: `NotifyToggle` — opt-in button

**Files:**
- Create: `src/components/NotifyToggle.tsx`
- Test: `src/components/NotifyToggle.test.tsx`
- Modify: `src/screens/Room.tsx` (render `<NotifyToggle />` inside `RoomView`)
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json` (see Task 6 — if Task 6 isn't done yet, add the four toggle keys here; Task 6 adds the remaining two)

**Interfaces:**
- Consumes: `notificationsSupported` (Task 2's `notify.ts`), `getNotifyPref`/`setNotifyPref`/`useNotifyPref` (Task 2's `notifyPrefs.ts`), `t()`.
- Produces: `export function NotifyToggle(): React.JSX.Element | null`, rendered inside `RoomView` in `src/screens/Room.tsx`.

- [ ] **Step 1: Write the failing tests**

```tsx
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
  // @ts-expect-error restoring a possibly-undefined global
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/NotifyToggle.test.tsx`
Expected: FAIL with "Cannot find module './NotifyToggle'"

- [ ] **Step 3: Implement `NotifyToggle` in `src/components/NotifyToggle.tsx`**

Return `null` immediately if `!notificationsSupported()`. Otherwise read `Notification.permission` and `useNotifyPref()` each render (no local caching of `permission`, per the Review Focus item on revoked permission). Render one `<button type="button" className="pill">` whose label/`aria-label` and `disabled` state follow the four-state table in the design doc (`notify.enable` / `notify.on` / `notify.off` / `notify.blocked` i18n keys, added in Task 6). `onClick`: when `permission === 'default'`, call `Notification.requestPermission().then(p => { if (p === 'granted') setNotifyPref('on') })`; when `permission === 'granted'`, call `setNotifyPref(getNotifyPref() === 'on' ? 'off' : 'on')`; when `permission === 'denied'`, the button is `disabled` so no handler fires.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/NotifyToggle.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into `Room.tsx`**

In `RoomView` in `src/screens/Room.tsx`, render `<NotifyToggle />` once, near the existing banner/toast line (around line 220), so it's visible across lobby/table/vote/reveal/result.

- [ ] **Step 6: Run the full existing Room test file to confirm no regression**

Run: `npx vitest run src/screens/Room.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/NotifyToggle.tsx src/components/NotifyToggle.test.tsx src/screens/Room.tsx
git commit -m "feat: add notification opt-in toggle to the room screen"
```

---

## Task 5: `RoomWatcher` — toast/notification while away from the room screen

**Files:**
- Create: `src/components/RoomWatcher.tsx`
- Test: `src/components/RoomWatcher.test.tsx`
- Modify: `src/App.tsx` (mount `<RoomWatcher />` next to `<RoomChip />`)
- Modify: `src/App.css` or wherever `.toast` is styled (add a `.toast-top` modifier — locate the existing rule first)

**Interfaces:**
- Consumes: `useMyRoom` (`src/state/myRoom.ts`), `request` (`src/api/client.ts`), `openRoomStream` (`src/api/stream.ts`), `RoomStore` (`src/state/roomStore.ts`), `detectNotifyEvents` (Task 1), `fireNotification`/`notificationsSupported` (Task 2), `getNotifyPref` (Task 2), `Toast` component, `t()`, `useLocation`/`useNavigate` from `react-router-dom`.
- Produces: `export function RoomWatcher(): React.JSX.Element | null`, mounted once in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Follow `src/screens/Room.test.tsx`'s mocking idiom for `openRoomStream` and `request`, and `src/components/RoomChip.test.tsx`'s idiom for driving `myRoom` directly and rendering inside a `MemoryRouter`.

```tsx
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RoomWatcher } from './RoomWatcher'
import { request } from '../api/client'
import { openRoomStream } from '../api/stream'
import { setMyRoom } from '../state/myRoom'
import { fireNotification } from '../state/notify'
import { getNotifyPref } from '../state/notifyPrefs'
import type { Snapshot } from '../api/types'

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), request: vi.fn() }))
vi.mock('../api/stream', () => ({ openRoomStream: vi.fn(() => ({ close: vi.fn(), reconnectNow: vi.fn() })) }))
vi.mock('../state/notify', () => ({ fireNotification: vi.fn(), notificationsSupported: () => true }))
vi.mock('../state/notifyPrefs', () => ({ getNotifyPref: vi.fn(() => 'on') }))

function playing(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCD', status: 'playing', phase: 'describe', phase_deadline: null, round: 1, game_no: 1, version: 1, main_lang: 'en',
    config: { bot_fill: true, max_players: 10, min_players: 4, turn_seconds: 45, vote_seconds: 30, statement_max_chars: 120 },
    host_seat: 0, players: [{ seat: 0, name: 'Ann', lang: 'en', is_bot: false, alive: true, connected: true, is_host: true }],
    messages: [], current_speaker: null, me: { seat: 0, is_host: true, my_word: 'river' },
    winner: null, last_seq: 1, server_time: Date.now(), locked: [],
    ...overrides,
  } as Snapshot
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><RoomWatcher /></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(openRoomStream).mockClear()
  vi.mocked(fireNotification).mockClear()
  vi.mocked(getNotifyPref).mockReturnValue('on')
  setMyRoom(null)
})

test('opens no connection and renders nothing with no active room', () => {
  renderAt('/bots')
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('opens no connection while on that room\'s own page', () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  renderAt('/r/ABCD')
  expect(openRoomStream).not.toHaveBeenCalled()
})

test('boots a snapshot and opens a stream when away from the room with an active room', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  expect(request).toHaveBeenCalledWith('GET', '/rooms/ABCD')
  expect(openRoomStream).toHaveBeenCalledWith('ABCD', expect.anything(), expect.anything(), expect.anything())
})

test('shows a toast when it becomes my turn while focused and away from the room', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  vi.restoreAllMocks()
})

test('fires a native notification instead of a toast when unfocused and away from the room', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing({ current_speaker: null }))
  renderAt('/bots')
  await act(async () => {})
  const onEvent = vi.mocked(openRoomStream).mock.calls[0][1]
  act(() => onEvent({ event: 'turn', data: { seat: 0, phase: 'describe' } }))
  expect(fireNotification).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).toBeNull()
  vi.restoreAllMocks()
})

test('closes the stream once navigation lands on the room\'s own page', async () => {
  setMyRoom({ code: 'ABCD', status: 'playing' })
  vi.mocked(request).mockResolvedValue(playing())
  const close = vi.fn()
  vi.mocked(openRoomStream).mockReturnValue({ close, reconnectNow: vi.fn() })
  const { rerender } = render(<MemoryRouter initialEntries={['/bots']}><RoomWatcher /></MemoryRouter>)
  await act(async () => {})
  rerender(<MemoryRouter initialEntries={['/r/ABCD']}><RoomWatcher /></MemoryRouter>)
  expect(close).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/RoomWatcher.test.tsx`
Expected: FAIL with "Cannot find module './RoomWatcher'"

- [ ] **Step 3: Implement `RoomWatcher` in `src/components/RoomWatcher.tsx`**

Read `room = useMyRoom()` and `pathname = useLocation().pathname`. Compute `onOwnRoomPage = room && pathname.toUpperCase() === \`/R/${room.code}\`` (same check as `RoomChip.tsx:18`). When `!room || onOwnRoomPage`, render `null` and (via a `useEffect` cleanup) ensure any previously-open stream/store from a prior `room.code` is torn down. When there's an active room and the player is elsewhere: on an effect keyed on `room.code`, call `request('GET', '/rooms/' + room.code)` to get an initial `Snapshot` (matching `Room.tsx`'s `load()`), construct a `RoomStore` in a `useRef`, call `store.setSnapshot(snap)`, then `openRoomStream(room.code, ev => store.dispatch(ev), () => {}, { after: snap.last_seq })`; clean up by calling `.close()`. On every dispatched snapshot (subscribe via `store.subscribe`, or simplest: wrap in `useRoomStore(store)` and react via a second effect keyed on `store.state`), diff with the previous snapshot via `detectNotifyEvents`, and for each event: if `document.hasFocus()`, push `{text: t(key), n: n+1}` into local state rendered by a `<Toast text={...} nonce={...} className="toast-top" />`; else if `getNotifyPref() === 'on'` (and `notificationsSupported()`), call `fireNotification(...)` with the same `tag` scheme as Task 3, and `onClick` that calls `navigate('/r/' + room.code)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/RoomWatcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Extend `Toast` to accept an optional className, and add the `.toast-top` CSS rule**

`src/components/Toast.tsx` currently renders `<p role="status" className="toast">`. Add an optional `className` prop: `className?: string`, rendered as `` `toast${className ? ' ' + className : ''}` ``. Find the existing `.toast` rule (likely in `src/App.css` or `src/index.css` — locate via `grep -rn "\.toast" src/*.css`) and add a sibling rule `.toast-top { bottom: auto; top: calc(16px + env(safe-area-inset-top)); }` (mirroring whatever safe-area handling the existing bottom rule uses).

- [ ] **Step 6: Mount in `App.tsx`**

```tsx
<RoomChip />
<RoomWatcher />
```

- [ ] **Step 7: Run the full existing RoomChip/App test files to confirm no regression**

Run: `npx vitest run src/components/RoomChip.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/RoomWatcher.tsx src/components/RoomWatcher.test.tsx src/components/Toast.tsx src/App.tsx src/App.css
git commit -m "feat: toast or native-notify game-started/my-turn while away from the room screen"
```

---

## Task 6: i18n copy

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-Hans.json`

**Interfaces:**
- Produces: six string keys consumed by Tasks 3, 4, 5: `notify.enable`, `notify.on`, `notify.off`, `notify.blocked`, `notify.started`, `notify.turn`.

- [ ] **Step 1: Add the keys**

`en.json` (near other short-pill-label keys, e.g. by the `room.*`/`lobby.*` group):
```json
"notify.enable": "Enable notifications",
"notify.on": "Notifications on",
"notify.off": "Notifications off",
"notify.blocked": "Notifications blocked",
"notify.started": "Game started",
"notify.turn": "It's your turn"
```
`zh-Hans.json`, same keys:
```json
"notify.enable": "开启通知",
"notify.on": "通知已开启",
"notify.off": "通知已关闭",
"notify.blocked": "通知已被阻止",
"notify.started": "游戏开始了",
"notify.turn": "轮到你了"
```

- [ ] **Step 2: Run the i18n parity test**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: PASS (key-set parity holds; add these keys to any explicit key-list assertion in that file only if the self-review step below finds one checking exhaustive key lists)

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.json src/i18n/zh-Hans.json
git commit -m "feat: add notification copy in en and zh-Hans"
```

---

## Task 7: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions in any pre-existing test file

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke check (dev server)**

Run: `npm run dev`, open a room in two browser profiles/tabs (one as host, one as a second player), click "Enable notifications" in one, grant permission, background that tab, and from the other tab trigger a turn change; confirm a native OS notification appears, and clicking it focuses/navigates back to the room. Then bring the tab to the foreground but navigate to another in-app screen (e.g. `/bots`) and trigger another turn change; confirm a top-anchored toast appears instead.

- [ ] **Step 4: Commit (only if the manual check surfaced fixes)**

```bash
git add -A
git commit -m "fix: address issues found in notification smoke test"
```
