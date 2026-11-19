# Turn & game-start notifications: design

Date: 2026-11-19

## Intent
A player who switches away from the browser tab (another app, another tab) misses "the game started" and "it's your turn" — there's no in-game UI to see it happen. They want to be told even while away, without the site becoming a full push-enabled PWA.

## Goals
- A toggle button in the room lets a player opt in to native OS notifications (the `Notification` API). Default off until they opt in; browser permission is requested only on that click.
- While a player is not actively looking at the tab (`!document.hasFocus()`), a native notification fires for: the game starting, and it becoming their turn (describe phase or vote/revote phase, whichever applies).
- While the tab *is* focused but the player is elsewhere in the app (not on that room's screen), the same two events show an in-app toast instead of a native notification, so switching screens inside the app doesn't require OS-level permission to stay informed.
- While on the room's own screen with the tab focused, no new UI — the existing table/vote screens already show whose turn it is.
- Works on Android Chrome and desktop browsers. 

## Non-goals / anti-goals
- No support for iOS Safari in a plain tab — it does not implement the `Notification` API outside an installed home-screen PWA, and this project adds no manifest/service worker. The toggle button simply does not render where `Notification` is unsupported.
- No notifications once the tab/app is fully closed (would need a service worker + push subscriptions stored server-side — out of scope).
- No backend changes. Everything is derived from the existing SSE event stream and snapshot the server already sends.
- No change to the existing in-room UI (turn bar, vote screen) — this is additive.

## Current state (relevant pieces)
- Real-time sync is SSE (`src/api/stream.ts` `openRoomStream`) feeding `RoomStore` (`src/state/roomStore.ts`), consumed only by `Room.tsx`. Leaving the Room screen unmounts it and closes the stream — nothing today tracks game state outside of `Room.tsx`.
- `src/state/myRoom.ts` is a small always-live singleton (`{code, status}`) that *does* survive navigation, refreshed over plain HTTP by `RoomChip` (`src/components/RoomChip.tsx`) on every route change. It has no turn-level detail.
- `src/state/useHostChange.ts` is the existing precedent for "diff the snapshot, show a toast" (`Toast` component, `Room.tsx`'s `RoomView`).
- `Room.tsx` already listens to `visibilitychange`, today only to force an SSE reconnect — the stream itself stays open while the tab is merely hidden, not unmounted.

## Approaches considered
For getting events while away from the Room screen (the SSE stream otherwise closes on unmount):
1. **A thin, additional global SSE listener**, mounted once at the App level (sibling to `RoomChip`), opened only when `myRoom` has a code *and* the player isn't currently on that room's own page. Chosen. Additive — doesn't touch `Room.tsx`'s existing `RoomStore`/stream lifecycle, so no risk to gameplay code. The "only when not on the room's page" condition means it's never open at the same time as `Room.tsx`'s own stream for the same room, so there's no steady-state double connection.
2. **Promote `RoomStore` to a single global singleton** shared by `Room.tsx` and the app shell. One connection, ever, but requires pulling the stream lifecycle out of `Room.tsx`, which currently owns a lot of adjacent logic (chat, reload-on-failure, boot states). Riskier, more invasive; not worth it for this feature.
3. **Poll `/rooms/{code}` instead of SSE** while away. No second streaming connection, reuses the existing fallback endpoint, but adds multi-second latency to "it's your turn," which matters since turns are timed. Rejected for responsiveness.

## Design

### Shared detection logic
`src/state/notifyEvents.ts` — a pure function, independent of React:
```ts
export type NotifyEvent = { kind: 'started' } | { kind: 'turn' }
export function detectNotifyEvent(prev: Snapshot | null, next: Snapshot): NotifyEvent | null
```
Fires `'started'` on `status` transitioning into `'playing'` (covers the first game and every rematch). Fires `'turn'` when the viewer becomes the active describer (`current_speaker === me.seat`, alive) or enters an unlocked vote/revote phase, transitioning from not-my-turn to my-turn. Returns `null` on the very first snapshot for a room (no `prev`) or a different room code, matching the "no toast on first render" rule `useHostChange` already follows.

### Notification plumbing
`src/state/notify.ts`:
- `notificationsSupported(): boolean` — feature-detects `typeof Notification !== 'undefined'`.
- `fireNotification(title: string, opts?: { body?: string; onClick?: () => void }): void` — guarded `new Notification(...)` call; wires `onclick` to focus the window and run `onClick`, then closes the notification. No-op (and never throws) when unsupported or permission isn't `'granted'`.

### Opt-in preference
`src/state/notifyPrefs.ts` — a localStorage-backed singleton, same shape as `nudges.ts` (`useSyncExternalStore`, a `resetNotifyPrefForTests` escape hatch): stores only the player's on/off choice (`'on' | 'off'`, default `'on'` once permission is granted, since the browser permission itself is the real gate). The actual `Notification.permission` is read live from the browser, not cached here.

### The toggle button
`src/components/NotifyToggle.tsx`, rendered inside `Room.tsx`'s `RoomView` (visible on every room sub-screen — lobby, table, vote, reveal, result — as a small pill, same visual family as `RoomChip`/the lobby's pill buttons). Hidden entirely when `!notificationsSupported()`. States, derived each render from live `Notification.permission` plus the stored pref:
- `permission === 'default'` → "Enable notifications"; click calls `Notification.requestPermission()`, and on `'granted'` sets the pref to `'on'`.
- `permission === 'granted'`, pref `'on'` → shows enabled; click sets pref to `'off'`.
- `permission === 'granted'`, pref `'off'` → shows muted; click sets pref back to `'on'`.
- `permission === 'denied'` → shows a disabled "blocked" state (can't be un-blocked from JS; title-text points at browser settings).

### Firing it, in-room
`src/state/useGameNotify.ts` — a side-effect-only hook, modeled on `useHostChange`'s diffing but with no visible output: keeps the previous `Snapshot` in a ref, calls `detectNotifyEvent` on each change, and when it fires *and* `!document.hasFocus()` *and* the pref/permission allow it, calls `fireNotification(...)`. When the tab is focused, it does nothing at all — the player is looking at the room screen, which already shows whose turn it is, matching the "no new UI while on the room screen with focus" goal. No toast, ever, from this hook — only `RoomWatcher` (below) produces toasts, and only while the player is elsewhere in the app.

`Room.tsx`'s `RoomView` calls `useGameNotify(state)` purely for its effect, alongside the existing `useHostChange`/`Toast` wiring (untouched).

### Firing it, away from the Room screen
`src/components/RoomWatcher.tsx`, mounted once in `App.tsx` next to `RoomChip`. Reads `useMyRoom()` and the current pathname; when there's a room code and the pathname isn't that room's own page (same check `RoomChip` already makes), it boots a snapshot the same way `Room.tsx`'s `load()` does — `GET /rooms/{code}` first, since a fresh SSE stream opened with `after=0` is not guaranteed to replay a `state` frame and `me.seat` is only ever delivered on that full snapshot — then owns a `RoomStore` + `openRoomStream` (`useRef`, mirroring `Room.tsx`) scoped to that code, running the same `detectNotifyEvent` diff on every dispatched snapshot. Same focus-based branching as `useGameNotify`, except when the tab *is* focused (but the player is on some other screen in the app) it shows a toast instead of doing nothing — rendered through a second, globally-mounted `<Toast/>`, offset to the *top* of the viewport via a `toast-top` modifier class (every existing toast, including screens the player might be on outside the room — e.g. the bot page, a daily-result screen — is bottom-anchored, so the two can't render stacked on top of each other). A native notification's `onClick` does a hard navigation (`location.assign('/r/' + code)`) back into the room; a toast's `onClick` would do the same via the router. The moment the player navigates onto the room's own page, this effect tears its stream down — `Room.tsx`'s own stream and `useGameNotify` take over, so the two are never simultaneously open for the same room *in one tab*.

### Duplicate notifications across tabs
The same player can have the room open in two tabs (one on the room screen, one elsewhere, or both elsewhere); each tab's `RoomWatcher`/`useGameNotify` is independent, so both could fire a native OS notification for the same event. Rather than add cross-tab coordination (`BroadcastChannel` leader election), `fireNotification` sets the `tag` option to `` `${code}:${kind}:${game_no}:${round}` ``: per the Notification API spec, a second notification with a tag already showing from the same origin replaces it instead of stacking, so the practical result — at most one visible notification per event, from whichever tab's call lands last — is good enough without new infra.

### Copy
New flat i18n keys in `en.json`/`zh-Hans.json`: `notify.enable`, `notify.on`, `notify.off`, `notify.blocked`, `notify.started`, `notify.turn` (plain, no interpolation needed).

## Left to the builder
Exact wording/icon for the four toggle states; exact pill placement within `RoomView`'s existing markup; zh-Hans copy for the new keys.
