# Host Handover Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-time toast when the host changes while a player is watching the room, in every phase.

**Architecture:** A small hook compares the previous and current room snapshot and returns the toast text. `RoomView` renders it through the existing `Toast`. No backend change.

**Tech Stack:** React + TypeScript, Vitest + Testing Library (`renderHook`), existing `Toast` and i18n.

**Spec:** `docs/superpowers/specs/2026-11-17-host-handover-notice-design.md`

## Global Constraints

- Strings in both `src/i18n/en.json` and `src/i18n/zh-Hans.json`; the key list in `src/i18n/i18n.test.ts` stays in step.
- Message keys exactly: `host.nowYou`, `host.nowOther`, `host.nowYouNoLeft`, `host.nowOtherNoLeft`.
- English copy: `host.nowYou` "{old} left. You're now the host."; `host.nowOther` "{old} left. {new} is now the host."; `host.nowYouNoLeft` "You're now the host."; `host.nowOtherNoLeft` "{new} is now the host."
- No toast on first render, on a reconnect that re-delivers the same host, or when the room code changes.
- No backend or API change; no new event type.
- Host is derived from `players.find(p => p.is_host)` (events keep that current).

## Review Focus

- First render of a room with a host: no toast (hook test).
- Same host across consecutive states: no toast (hook test).
- Two handovers in a row both show, even with identical text (hook test on the returned nonce).
- Host stays in the player list but disconnected, or is removed (lobby): "left" wording; host still listed and connected: no-"left" wording (hook test).
- No host at all in the current state (e.g. all humans gone): no toast, no crash (hook test).

---

### Task 1: `useHostChange` hook and strings

**Files:**
- Create: `src/state/useHostChange.ts`
- Create: `src/state/useHostChange.test.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts` (key list)

**Interfaces:**
- Produces: `useHostChange(state: Snapshot): { text: string; n: number }`. `text` is `''` when there is nothing to show; `n` increments on every handover so `Toast`'s `nonce` re-shows identical text. Consumed by Task 2.
- Consumes: `t(key, params)` from `../i18n`; `Snapshot`, `Player` from `../api/types`.

- [ ] **Step 1: Write the failing tests** in `useHostChange.test.tsx`, using `renderHook` with a `state` prop and a `p(seat, name, is_host, connected = true)` player builder. Cases, each asserting `result.current.text`:
  - `no toast on first render`: first state has host seat 0 → `''`.
  - `no toast while the host stays the same` after a rerender with the same host.
  - `new host sees "You're now the host" after the old host is removed`: previous state host seat 0 "Alex" (me.seat 1), next state seat 0 removed and seat 1 is_host → `"Alex left. You're now the host."`.
  - `others see who took over`: me.seat 2; next host seat 1 "Sam" → `"Alex left. Sam is now the host."`.
  - `a disconnected old host still counts as left`: old host stays in the list with `connected: false` → wording with "left".
  - `old host still listed and connected: no "left"`: host flag moves while seat 0 stays connected → `"Sam is now the host."` for others, `"You're now the host."` for the new host.
  - `two handovers in a row both show`: `n` increases by 1 each, and `text` is set both times.
  - `no host in the new state: no toast and no crash`.
  - `a different room code resets: no toast`.

- [ ] **Step 2: Run `npx vitest run src/state/useHostChange.test.tsx`.** Expected: FAIL (module missing).

- [ ] **Step 3: Add the four strings** to both i18n files (English per Global Constraints; zh-Hans: "{old} 离开了，你现在是房主。" / "{old} 离开了，{new} 成为新房主。" / "你现在是房主。" / "{new} 成为新房主。") and to the key list in `i18n.test.ts`.

- [ ] **Step 4: Implement `useHostChange`.** Keep `prev` in a `useRef<Snapshot | null>`; in a `useEffect` on `state`, compare `prev.current` and `state`: same `code`, previous host seat defined, current host seat defined and different → set `{ text, n: n + 1 }` in `useState`. `left` = old host is missing from `state.players` or has `connected === false`. The viewer is the new host when `newHost.seat === state.me.seat`. Always assign `prev.current = state` at the end.

- [ ] **Step 5: Run `npx vitest run src/state/useHostChange.test.tsx src/i18n`.** Expected: PASS.

- [ ] **Step 6: Commit** (`feat: useHostChange hook and host handover strings`).

### Task 2: Show the toast in RoomView

**Files:**
- Modify: `src/screens/Room.tsx` (`RoomView`, near line 118)
- Modify: `src/screens/Room.test.tsx`

**Interfaces:**
- Consumes: `useHostChange` from Task 1; `Toast` from `src/components/Toast.tsx` (`{ text, nonce }`).

- [ ] **Step 1: Write the failing test** in `Room.test.tsx`: render the room with a lobby snapshot where seat 0 is host and I am seat 1; push a store update where seat 0 is gone and seat 1 `is_host`; assert `getByRole('status')` has text "Alex left. You're now the host." Use the existing helpers in that file for the store and stream.

- [ ] **Step 2: Run `npx vitest run src/screens/Room.test.tsx`.** Expected: FAIL.

- [ ] **Step 3: Edit `RoomView`:** call `const hostNote = useHostChange(state)` and render `<Toast text={hostNote.text} nonce={hostNote.n} />` next to the `banner`. The toast must sit outside the keyed `.phase` div so a screen change doesn't remount and re-show it.

- [ ] **Step 4: Run `npx vitest run`, `npx tsc --noEmit`.** Expected: all PASS.

- [ ] **Step 5: Commit** (`feat: toast when the host changes`).

---

## Self-review

- **Spec coverage:** wording and the "left" variants (Task 1), every phase (Task 2, `RoomView` wraps all screens), no first-load toast (Task 1 tests), no backend change.
- **My calls beyond the spec:** host is read from `players[].is_host`, because `host_seat` isn't updated by room events; the toast sits outside the keyed phase wrapper so screen changes don't replay it.
- **Type consistency:** `useHostChange` returns `{ text, n }` in both tasks.
