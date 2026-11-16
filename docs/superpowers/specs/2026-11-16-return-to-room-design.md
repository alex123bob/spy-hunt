# Return to room and one active room per player

## Intent
A host who creates a room and then visits another page (home, bots, top, daily) has no way back
except the browser Back button. Nothing stops one token from being seated in several rooms at
once. Players need an obvious way back into the room they are in, and the server needs a clear
rule about how many active rooms one player can have.

## Goals
- A player in an active room (lobby or playing) always sees a way back, on every screen except
  that room's own screen. This holds after a refresh or reopening the browser.
- A player is in at most one active room at a time.
- Leaving a room is always an explicit action. Navigating away never leaves.

## Non-goals (follow-ups)
- Public list of open rooms, and public/private room setting.
- Shorter expiry for empty or host-only lobbies (the existing idle sweep stays as is).
- Deleting finished rooms from the database.

## Anti-goals
- Silently dropping someone from a game in progress because of a mis-tap or a second tab.
- Kicking an existing session when a second tab or device opens (a refresh looks like a new session).

## Decisions (my calls)
1. **Block, don't auto-leave.** `create_room` and `add_player` fail with `409 already_in_room`
   (payload: the existing room's `code` and `status`) when the player holds a seat in another
   room whose status is `lobby` or `playing`. Re-joining the same room stays idempotent.
   Rooms that are `finished` do not count.
2. **Lookup endpoint.** `GET /me/room` returns `{code, status}` for the player's active room, or
   `{room: null}`. It is derived from `players` joined to `rooms`; no new table.
3. **Client banner.** Landing shows a "You're in room CODE · Return" card, with a secondary
   "Leave room" action. Other screens show a small floating chip linking to `/r/CODE`. The chip is
   hidden on `/r/:code` for that same code. State comes from `GET /me/room`, fetched on app
   load and after create/join/leave, and kept in a small store.
4. **Blocked create/join UX.** On `already_in_room`, show a dialog with "Return to room" and
   "Leave and continue". The second calls leave, then retries the original action.
   Leave mid-game keeps today's behavior (seat becomes a bot), so the dialog warns when status
   is `playing`.
5. **Multi-tab/device allowed.** Same token means same seat; no session kicking.
6. **Finished rooms:** the chip and banner disappear when the room is finished or closed
   (status from `/me/room`, plus the existing `closed` event if the user is on a screen
   listening to the stream).

## Constraints
- Backend: Flask, sqlite, `store.tx(room_id)` locking per room. The cross-room check must not
  deadlock: do it as a read before taking the new room's lock for join; for create, before insert.
  A small race (two simultaneous creates) is tolerated; the next `/me/room` shows the earliest.
- Frontend: React + react-router, i18n in `en.json` and `zh-Hans.json` (both must be updated).
- Mobile: the chip must not overlap the bottom controls; inputs stay at 16px.

## Approaches considered
- **A. Block (chosen):** simple, predictable, makes `/me/room` unambiguous.
- **B. Auto-leave on join:** smoother, but a stray link can eject a player from a live game.
- **C. Allow many rooms + list:** more UI, does not fix stale lobbies.

## Left to the builder
Exact chip placement and styling, store shape, copy text, test layout, how `/me/room` picks a
room if legacy data has several active seats (suggest: most recent `last_active`).
