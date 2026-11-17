# Host handover notification: design (short)

Date: 2026-11-17

## Intent
When the host leaves, the role passes to the next player and the UI updates, but nobody is told. The new host doesn't learn they're in charge (and suddenly has a Start button), and the others don't learn who took over.

## Goals
- The new host sees "<old host> left. You're now the host."
- Everyone else sees "<old host> left. <new host> is now the host."
- Works in every phase (lobby, table, vote, reveal, result), since the host can leave at any time.
- Shown once per handover, using the existing `Toast` (auto-hides after 2.5s).

## Non-goals / anti-goals
- No backend change, no new event type, no persistent banner or chat message.
- No toast on first load or reconnect: only on a host change observed while watching the room.
- No toast for the leaving player themselves (they've left the room).

## Approaches considered
1. Detect the change on the client by comparing consecutive room states, in a small hook used by `RoomView` (chosen). Smallest change; the old host's name comes from the previous state, because the lobby drops the leaver from the player list.
2. Have the server send a dedicated "host_changed" event. More precise, but needs a backend change, and older clients and replays wouldn't get it.
3. A system message in the game chat. Persistent, but doesn't exist in the lobby and clutters the log.

## Design
- New `src/state/useHostChange.ts`: `useHostChange(state: Snapshot): string` returns the toast text, or `''`. It keeps the previous state in a ref. When the previous state had a host, the current one has a different host, and the room is the same, it builds the message.
- Wording picks: you're the new host → `host.nowYou` ("{old} left. You're now the host."); someone else → `host.nowOther` ("{old} left. {new} is now the host."). If the old host is still in the list (e.g. disconnected mid-game), the text drops "left" and says `host.nowOtherNoLeft` / `host.nowYouNoLeft`: "You're now the host." / "{new} is now the host."
- `Room.tsx` `RoomView` renders `<Toast text={...} nonce={...} />` alongside the existing banner.
- i18n keys in en and zh-Hans; the key test list is updated.

## Left to the builder
Exact zh-Hans wording; the nonce, so two handovers in a row both show.
