# Lobby controls redesign (short design)

## Intent
The lobby repeats the user's language picker, gives the room language a full-width segmented switcher that won't scale to more languages, and puts add/remove bot controls two cards away from the seats. Make the lobby shorter, make bot and language controls easy to reach, and make the language UI scale to many languages.

## Goals
- One language menu component for both language settings. It replaces the segmented `LangPicker`.
- Top bar (and `Table.tsx`): `🌐 EN ▾` button opening a menu of full language names with a check on the current one. Same side effects as today (`setLang`, `setSessionLang`, `PATCH /me`, `patchMyLang`).
- Lobby: remove the "Your language" section (same setting as the top bar).
- Players card header: `Players (n/max)` on the left. On the right, the host sees `Room: English ▾` (the room `main_lang` menu) and guests see it as plain text. A "Full" badge shows when the room is full.
- One dashed `+ Add a bot ▾` row under the seats, shown while the room has space, and only to the host or to players who own bots. The menu holds `Random bot` (host only) and `Your bots` (avatar + name rows). Picking closes the menu. Outside tap and Esc also close it.
- If one of the player's bots is already in the room, the "Your bots" part is replaced by the muted line "Your bot X is already in this room. Remove it to add a different one."
- Removal: each bot seat has its own Remove button (host: any bot; player: their own). Remove the global "Remove bot" button and the separate room-controls card. Remove buttons are at least 44px tall, with ✕ and the word "Remove".

## Non-goals
- No backend or API changes. Existing endpoints (`/bots` add/remove, `/settings`, `PATCH /me`) are reused.
- No swipe-to-remove, no settings sheet.
- Room language semantics are unchanged: it never touches `preferred_lang` (see the 2026-11-13 lang-persistence spec).

## Approaches
- A (chosen): fold room language and bot controls into the players card. This is the shortest layout and puts controls next to the seats.
- B: keep a slim separate "Room settings" card. Smaller diff but keeps the distance from the seats.
- C: gear icon opening a settings sheet. Tidy, but costs an extra tap.

The language segmented picker is replaced everywhere by a menu, so adding languages doesn't reflow anything.

## My calls (not yet confirmed by you)
- The add menu closes after each pick. The host adds several bots by repeating the tap.
- Remove stays a button, not a swipe, for discoverability.
- `LangPicker` is deleted once nothing uses it.

## Left to the builder
Menu component details (focus handling, ARIA `menu`/`listbox`), CSS in `src/styles`, i18n strings (en, zh-Hans: remove `lobby.yourLang`, `lobby.addBot`, `lobby.removeBot`, `lobby.addMyBot` if unused, add new ones), and updating `Lobby.test.tsx`, `Table`/`TopBar` tests and e2e specs that touch the old controls.
