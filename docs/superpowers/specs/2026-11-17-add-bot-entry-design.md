# Add-bot entry point: design (short)

Date: 2026-11-17

## Intent
The lobby's "Add a bot" control currently sits in the first empty seat. It moves down a row each time a bot joins, its dropdown overlaps the placeholder seats below it, and dashed seats suggest only bots can fill them. Players should find it at once, and it should always sit in the same place.

## Goals
- One fixed, easy-to-spot add-bot control that never moves.
- No overlap with seats, whatever the player count.
- Same permissions as today: the host gets Random bot plus their own bots; a non-host with bots gets their own bots; a non-host with none sees no control.

## Non-goals / anti-goals
- No change to add/remove API calls, bot rules, or the "own bot already seated" note.
- Empty seats must not look like the add button (anti-goal: implying only bots fill seats).
- No bottom-only or hidden placement (users already said they couldn't find it there).

## Constraints
- Mobile-first. The control needs a 44px touch target, like the existing `.lobby-head .pill`.
- Both English and Chinese strings, with the existing i18n key test kept in step.

## Approaches considered
1. Fixed button below the seat list. Rejected: users reported not finding it at the bottom.
2. Pill in the player-count header. Workable, but crowds the header next to the language menu.
3. Tappable empty seats, with or without a header pill. Rejected: dashed seats read as "bots only".
4. Full-width row above the seats, a button beside Start, a floating button. Each costs height, is host-only, or covers content.
5. **Chosen (user's pick, option E): a "+ Bot" pill in the room header, beside Invite and the QR button**, grouping the two ways to fill a room (friends or bots). It opens the existing `Sheet` with the menu items.

## Design
- `Lobby.tsx`: render `AddBotMenu` inside `.lobby-share`, next to the Invite pill. Remove the `seat-cta` slot and the `canAddBot ? 1 : 0` extra seat. Empty seats become plain, non-interactive placeholders again (`min_players - players.length`).
- `AddBotMenu.tsx`: the trigger becomes a yellow `+ Bot` pill; the dropdown (`addbot-pop`) is replaced by the shared `Sheet` (title "Add a bot"; Random bot row for the host; "My bots" list; the existing own-bot-in note). Keep `aria-haspopup`, Escape to close and return focus. The sheet closes after a bot is added.
- Hide the pill when the room is full or the user has nothing to add (existing gate).
- CSS: delete the `.seat-cta` and `.addbot-pop` rules; add a small pill style. Lobby and AddBotMenu tests are updated to match; e2e specs are checked.
- New i18n key for the pill label (en + zh-Hans); reuse `lobby.addBotRow` for the sheet title.

## Left to the builder
Exact pill label wording ("+ Bot" / "+ 机器人"), and how the header wraps on very narrow screens (the pills may stack).
