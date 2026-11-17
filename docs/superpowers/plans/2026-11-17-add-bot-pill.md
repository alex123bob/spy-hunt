# Add-bot Header Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the lobby's add-bot control out of the seat list into a fixed "+ Bot" pill in the room header, and open its menu in the shared bottom `Sheet`.

**Architecture:** `AddBotMenu` keeps its props and permission gate but renders a pill trigger plus a `Sheet` (replacing the absolutely positioned dropdown). `Lobby` renders it inside `.lobby-share` and stops treating any seat as a CTA; empty seats go back to plain placeholders.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, Playwright e2e, plain CSS (`src/styles/game.css`).

**Spec:** `docs/superpowers/specs/2026-11-17-add-bot-entry-design.md`

## Global Constraints

- Pill touch target at least 44px tall (`min-height: 44px`, like `.lobby-head .pill`).
- Strings in both `src/i18n/en.json` and `src/i18n/zh-Hans.json`; the key list in `src/i18n/i18n.test.ts` stays in step.
- Permissions unchanged: host sees Random bot and own bots; non-host sees own bots only; non-host with no bots and a full room render no control.
- The pill's accessible name stays "Add a bot" (`lobby.addBotRow`), because `e2e/bots.spec.ts:37` clicks `getByRole('button', { name: 'Add a bot' })`.
- No API or bot-rule changes.

## Review Focus

- Full room (`players >= max_players`): no pill at all (Lobby test).
- Room at `min_players` but not full: pill still shown, and no extra placeholder seat appears (Lobby test).
- Own bot already seated: the sheet shows the note, no bot rows, and the host keeps Random bot (AddBotMenu test).
- Picking an item closes the sheet, so a server error from `call` shows in the page's `role="alert"` instead of behind the backdrop (AddBotMenu test).
- Escape and backdrop click close the sheet and focus returns to the pill (AddBotMenu test).

---

### Task 1: AddBotMenu becomes a pill that opens a Sheet

**Files:**
- Modify: `src/components/AddBotMenu.tsx`
- Modify: `src/components/AddBotMenu.test.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts:53`
- Modify: `src/styles/game.css:215-227`

**Interfaces:**
- Consumes: `Sheet({ label, onClose, children })` from `src/components/Sheet.tsx` (focus trap, Escape, backdrop click, restores focus on unmount).
- Produces: `AddBotMenu` with the same props as today, `{ isHost: boolean; myBots: BotCard[]; ownBotIn: BotCard | null; onAdd: (botId?: string) => void }`. Renders `null` when `!isHost && myBots.length === 0`.

- [ ] **Step 1: Rewrite the tests in `AddBotMenu.test.tsx`.** Define `pill = () => screen.getByRole('button', { name: 'Add a bot' })`. Cases:
  - `host with no bots sees only Random bot`: click the pill, a `dialog` named "Add a bot" appears with exactly one `menuitem`; clicking "Random bot" calls `onAdd()` with no arguments.
  - `non-host with no bots renders nothing`: container is empty.
  - `non-host lists bots; picking calls onAdd and closes the sheet`: no "Random bot" item; clicking the Pixel item calls `onAdd('b1')`, and then `queryByRole('dialog')` is null.
  - `ownBotIn shows the note instead of bot rows; host keeps Random`: the note text from `lobby.ownBotIn` is present and outside any `role="menu"`; no Pixel `menuitem`; "Random bot" is present.
  - `non-host with a bot already in sees the note and zero menuitems`.
  - `the pill shows "+ Bot" and the heading "Your bots" sits outside the menu`: `pill()` has text content "+ Bot"; with the sheet open, `getByRole('menu', { name: 'Your bots' })` exists.
  - `Escape closes the sheet and refocuses the pill`.
  - `clicking the backdrop (.sheet-backdrop) closes the sheet`.
  - Remove the old `outside pointerdown` test and the `aria-expanded` assertions (the Sheet is a modal dialog).

- [ ] **Step 2: Run `npx vitest run src/components/AddBotMenu.test.tsx`.** Expected: FAIL (old dropdown markup).

- [ ] **Step 3: Add the key `lobby.addBotPill` to both i18n files** (en `"+ Bot"`, zh-Hans `"+ 机器人"`) and to the key list in `i18n.test.ts`.

- [ ] **Step 4: Rewrite `AddBotMenu.tsx`.** Keep the signature, the `useState(open)`, the early `return null` gate, `showNote` and `showMine`. Delete the `useEffect` that handles Escape and outside clicks, plus the `root` and `trigger` refs. Render:
  - a `<button type="button" className="pill addbot-pill" aria-label={t('lobby.addBotRow')} aria-haspopup="dialog">` with visible text `t('lobby.addBotPill')`, which opens the sheet;
  - when open, `<Sheet label={t('lobby.addBotRow')} onClose={() => setOpen(false)}>` containing a visible `<h3>` title, the existing host Random-bot `role="menu"` block, the note paragraph (`id` from `useId()`), and the "Your bots" heading plus `role="menu"` list.
  - `pick` now calls `onAdd(...)` and then `setOpen(false)`.
  - Keep the `addbot-menu`, `addbot-item`, `addbot-heading` and `addbot-note` class names.

- [ ] **Step 5: Update `game.css`.** Delete `.addbot`, `.seat-cta*`, `.addbot-row*` and `.addbot-pop`. Add `.addbot-pill { min-height: 44px; min-width: 44px; justify-content: center; cursor: pointer; background: var(--sun); box-shadow: 0 2px 0 var(--ink); }` and a `:focus-visible` outline like the one `.addbot-item` has. Keep the `.addbot-menu`, `.addbot-item`, `.addbot-heading` and `.addbot-note` rules.

- [ ] **Step 6: Run `npx vitest run src/components/AddBotMenu.test.tsx src/i18n`.** Expected: PASS.

- [ ] **Step 7: Commit** (`feat: add-bot control is a pill that opens a sheet`).

### Task 2: Lobby places the pill in the header and drops the seat CTA

**Files:**
- Modify: `src/screens/Lobby.tsx:65-118`
- Modify: `src/screens/Lobby.test.tsx:225-280`
- Check: `e2e/bots.spec.ts:37` and the lines around it

**Interfaces:**
- Consumes: `AddBotMenu` from Task 1 (same props as before, renders its own gate).

- [ ] **Step 1: Update the Lobby tests.** Delete the `seat-cta` tests (host first-seat CTA, "exactly one affordance inside a seat", "CTA still shows at min players" seat assertions). Add:
  - `the host sees an Add a bot pill in the header, next to Invite`: `getByRole('button', { name: 'Add a bot' }).closest('.lobby-share')` is non-null.
  - `empty seats are plain placeholders` for `snap(true)`: all `Empty seat` texts are non-interactive, and the count equals `min_players - players.length`.
  - `at min players (not full) the pill shows and no extra placeholder seat appears`: with `sized(4, true)`, the pill is present and `queryByText('Empty seat')` is null.
  - Keep and adapt: the non-host with no bots has no pill; the non-host with a bot gets the pill (`findByRole`); the full room has no pill.
  - Update the failing-call test: click the pill, then the "Random bot" `menuitem`; the alert and the `request` assertion stay the same.

- [ ] **Step 2: Run `npx vitest run src/screens/Lobby.test.tsx`.** Expected: FAIL.

- [ ] **Step 3: Edit `Lobby.tsx`.** Render `<AddBotMenu isHost={isHost} myBots={myBots} ownBotIn={ownBotIn} onAdd={...same call...} />` as the first child of `.lobby-share`, and hide it when `full`. Compute `seatSlots = Math.max(state.config.min_players - state.players.length, 0)`. Render every slot as `<div className="seat empty" aria-hidden ...>`. Delete `canAddBot` and the `seat-cta` branch. Update the stale comment.

- [ ] **Step 4: Check the header on narrow phones.** `.lobby-head .row` should wrap or shrink rather than overflow at 320px width. If it overflows, add `flex-wrap: wrap` to `.lobby-share` and re-check with the Playwright viewport test.

- [ ] **Step 5: Run `npx vitest run`, `npx tsc --noEmit`, and the e2e spec `npx playwright test e2e/bots.spec.ts`.** Expected: all PASS. If the e2e fails because the menu items moved into the sheet, adjust the selectors to the `dialog`.

- [ ] **Step 6: Commit** (`feat: move add-bot to a header pill; seats are plain placeholders`).

---

## Self-review

- **Spec coverage:** header pill (Task 2), Sheet menu (Task 1), CSS and seat-CTA removal (Tasks 1 and 2), i18n (Task 1), permissions unchanged (Global Constraints and tests), narrow header (Task 2 step 4).
- **My calls beyond the spec:** the sheet closes on pick (the old menu stayed open). Reason: a server error from `call` renders in the page's alert, which a modal backdrop would hide. Pill label is "+ Bot" / "+ 机器人".
- **Type consistency:** `AddBotMenu` props are unchanged across both tasks.
