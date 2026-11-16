# Return to Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player get back into the room they are in from any screen, and allow at most one active room per player.

**Architecture:** The backend derives a player's active room from `players` JOIN `rooms` (no new table). `create_room`/`add_player` reject with `409 already_in_room` when another active room exists. The client keeps a small `myRoom` store fed by `GET /me/room`, renders a Landing banner plus a floating chip, and shows a dialog when create/join is blocked.

**Tech Stack:** Flask + sqlite (pytest), React + react-router (vitest), i18n JSON (en, zh-Hans).

**Spec:** `docs/superpowers/specs/2026-11-16-return-to-room-design.md`

## Global Constraints

- Active room = `rooms.status IN ('lobby','playing')`; `finished` never counts.
- Re-joining the same room stays idempotent (returns existing seat, no error).
- Error shape is `{"error": code, "message": ...}` (routes.py `_store_error`); `already_in_room` adds `code` and `status` of the existing room.
- Leaving mid-game keeps today's behavior (seat becomes a bot).
- Every new string goes into both `src/i18n/en.json` and `src/i18n/zh-Hans.json`.
- Text inputs stay 16px; the chip must not cover bottom controls on mobile.
- Navigating away never calls leave.

## Review Focus

- Create while hosting another lobby: blocked, not a second room.
- Join by code of a different active room: blocked; join of own current room: succeeds.
- The previous room finished or closed (idle sweep, no humans): no longer blocks, banner/chip gone.
- Bot seats (`is_bot=1`) never count as the player's membership.
- Legacy data with several active seats: `/me/room` returns the most recent `last_active`, no 500.
- Chip hidden on `/r/<same code>`; shown on `/r/<other code>`.
- Unauthenticated/no-token visitor: no `/me/room` call, no banner.

## File Structure

- Modify `backend/ai_svc/spy_hunt/store.py`: `active_room_of`, guard in `create_room`/`add_player`.
- Modify `backend/ai_svc/spy_hunt/routes.py`: `GET /me/room`; `already_in_room` payload in `_store_error`.
- Create `backend/ai_svc/spy_hunt/tests/test_one_room.py`.
- Modify `src/api/client.ts`: `ApiError` carries `data`.
- Create `src/state/myRoom.ts` (+ test): store and `leaveRoom`.
- Create `src/components/RoomChip.tsx`, `src/components/AlreadyInRoomSheet.tsx` (+ tests).
- Modify `src/screens/Landing.tsx`, `src/screens/Room.tsx`, `src/routes.tsx`, `src/i18n/*.json`.

---

### Task 1: Backend one-active-room rule and `/me/room`

**Files:**
- Modify: `backend/ai_svc/spy_hunt/store.py` (`create_room` ~206, `add_player` ~253)
- Modify: `backend/ai_svc/spy_hunt/routes.py` (`_store_error` ~27, new route near `create_room` ~153)
- Test: `backend/ai_svc/spy_hunt/tests/test_one_room.py`

**Interfaces:**
- Produces: `store.active_room_of(player_id: str, conn=None) -> Optional[dict]` returning `{"code": str, "status": str, "room_id": str}` or `None`.
- Produces: `StoreError` gains optional `extra: dict` (default `{}`), merged into the JSON error body by `_store_error`.
- Produces: `GET /me/room` → `{"room": {"code","status"} | null}` (guest auth, `read` rate limit like `get_room`).

- [ ] **Step 1: Write failing tests** in `test_one_room.py`, using the `client` fixture and the guest-creation helper pattern from `test_accounts.py`. Names and assertions:
  - `test_create_blocked_while_hosting_active_room`: second `POST /rooms` → 409, `error == "already_in_room"`, body `code` equals first room's code, `status == "lobby"`.
  - `test_join_other_room_blocked`: player B hosts room X; player A in room Y joins X → 409 `already_in_room` with Y's code.
  - `test_rejoin_same_room_idempotent`: join own room → 200.
  - `test_finished_room_does_not_block`: set the room `status='finished'` via `conn`, then create → 201.
  - `test_bot_seat_not_membership`: after `game.leave` mid-game, `GET /me/room` → `{"room": null}`.
  - `test_me_room_returns_active_or_null`: null before any room; `{"code","status"}` after create.
  - `test_me_room_picks_latest_when_several`: insert two active seats directly (differing `last_active`); returns the newer.
- [ ] **Step 2: Run** `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_one_room.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `active_room_of` (query `players p JOIN rooms r` where `p.player_id=? AND p.is_bot=0 AND r.status IN ('lobby','playing')`, `ORDER BY r.last_active DESC LIMIT 1`). Call it first in `create_room`, and in `add_player` after the existing-member check (so same-room rejoin passes) but only when the target room differs; raise `StoreError(409, "already_in_room", "You are already in a room.", extra={"code":..., "status":...})`. Update `_store_error` to merge `extra`. Add the route.
- [ ] **Step 4: Run** the new test file plus the existing suite `python -m pytest ai_svc/spy_hunt/tests -q`. Expected: all PASS (fix any existing tests that create two rooms with one player by using distinct guests).
- [ ] **Step 5: Commit** `git commit -m "feat: one active room per player and GET /me/room"`

---

### Task 2: Client store and API error payload

**Files:**
- Modify: `src/api/client.ts` (`ApiError`, line ~46)
- Create: `src/state/myRoom.ts`, `src/state/myRoom.test.ts`

**Interfaces:**
- Consumes: Task 1 endpoints.
- Produces: `ApiError.data: Record<string, unknown>` (the parsed error body; `{}` otherwise).
- Produces in `myRoom.ts`: `type MyRoom = { code: string; status: 'lobby' | 'playing' } | null`; `useMyRoom(): MyRoom`; `refreshMyRoom(): Promise<void>` (no-op when there are no stored credentials; sets `null` on failure); `setMyRoom(r: MyRoom): void`; `leaveRoom(code: string): Promise<void>` (POST `/rooms/{code}/leave`, then `setMyRoom(null)`).

- [ ] **Step 1: Write failing tests** (mock `request`): `refreshMyRoom` stores the returned room; stores `null` when response is `{room: null}`; skips the request without credentials; `leaveRoom` posts to `/rooms/ABC/leave` and clears the store; `ApiError` from a 409 body keeps `data.code === 'XYZ'` (put this one in `client.test.ts`).
- [ ] **Step 2: Run** `yarn vitest run src/state/myRoom.test.ts src/api/client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** using a module-level value plus `useSyncExternalStore`.
- [ ] **Step 4: Run** same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: myRoom store and ApiError payload"`

---

### Task 3: Banner, chip and refresh hooks

**Files:**
- Create: `src/components/RoomChip.tsx`, `src/components/RoomChip.test.tsx`
- Modify: `src/screens/Landing.tsx`, `src/routes.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`

**Interfaces:**
- Consumes: `useMyRoom`, `refreshMyRoom`, `leaveRoom`.
- Produces: `<RoomChip />` (no props) rendered once in `AppRoutes`.
- i18n keys: `room.chip` ("In room {{code}}"), `room.return` ("Return"), `room.leave` ("Leave room"), `landing.inRoom` ("You're in room {{code}}").

- [ ] **Step 1: Write failing tests**: chip renders a link to `/r/ABC` with the code when `useMyRoom` is set; renders nothing when null; renders nothing when the current route is `/r/ABC`; renders on `/r/DEF`; Landing shows the banner with Return and Leave, and Leave calls `leaveRoom('ABC')`.
- [ ] **Step 2: Run** `yarn vitest run src/components/RoomChip.test.tsx src/screens/Landing.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Call `refreshMyRoom()` on app mount in `AppRoutes` and on each route change to a non-`/r/` path. Chip is fixed top-right below `TopBar`, with `z-index` below modal sheets (sheet is 10; use 8, matching the add-bot tile). Landing banner sits above the create form.
- [ ] **Step 4: Run** the same command plus `yarn tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: return-to-room banner and floating chip"`

---

### Task 4: Blocked create/join dialog

**Files:**
- Create: `src/components/AlreadyInRoomSheet.tsx`, `src/components/AlreadyInRoomSheet.test.tsx`
- Modify: `src/screens/Landing.tsx` (`create`, ~line 64), `src/screens/Room.tsx` (join, ~line 63), both i18n files

**Interfaces:**
- Consumes: `ApiError.data`, `leaveRoom`, `Sheet`.
- Produces: `<AlreadyInRoomSheet code status onReturn onLeaveAndContinue onClose />`.
- i18n keys: `room.blocked.title` ("You're already in a room"), `room.blocked.body` ("Finish or leave room {{code}} first."), `room.blocked.playingWarn` ("Leaving a game in progress hands your seat to a bot."), `room.blocked.leave` ("Leave and continue").

- [ ] **Step 1: Write failing tests**: sheet shows the warning only when `status='playing'`; Return calls `onReturn`; Leave-and-continue calls `onLeaveAndContinue`. Landing: a 409 `already_in_room` from create opens the sheet with the code from `data`, and Leave-and-continue calls `leaveRoom` then retries `POST /rooms` once. Room: a 409 on join opens the sheet; continue retries the join.
- [ ] **Step 2: Run** `yarn vitest run src/components/AlreadyInRoomSheet.test.tsx src/screens/Landing.test.tsx src/screens/Room.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the sheet and wire both call sites. Retry only once; any further error shows the normal error text.
- [ ] **Step 4: Run** the same command plus `yarn vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: already-in-room dialog for create and join"`

---

### Task 5: End-to-end check

**Files:**
- Test: `e2e/return-to-room.spec.ts` (follow the setup in `e2e/smoke.spec.ts`)

- [ ] **Step 1: Write** a Playwright test: create a room, navigate to `/`, expect the banner with the room code; click Return, expect `/r/<code>`; reload on `/bots`, expect the chip; try creating a second room, expect the dialog; choose Leave and continue, expect a new room code.
- [ ] **Step 2: Run** `yarn playwright test e2e/return-to-room.spec.ts`. Expected: PASS.
- [ ] **Step 3: Commit** `git commit -m "test: e2e return to room"`
