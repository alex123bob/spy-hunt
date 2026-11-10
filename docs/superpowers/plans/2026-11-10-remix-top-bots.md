# Outfit Remixing and Top Bots Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone remix a bot's outfit into a bot of their own with credit, and show a public board of the bots that really win.

**Architecture:** Backend: new columns on `custom_bots` (ranked record, `listed`, `blocked`, `remix_of`) plus a `remixes` table; `custombots.record_game` also updates a ranked record for qualifying games; a public `GET /bots/top`; the existing bot card gains five fields. Frontend: a `/top` screen, a Remix button on the bot page that opens the bot form pre-filled via `/bots?remix=<id>`, credit lines on the card, and a "show on board" checkbox in the form.

**Tech Stack:** Python 3 / Flask / SQLite / pytest; React 19 / TypeScript / vitest / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-remix-top-bots-design.md` (this repo). Read it first; section numbers refer to it.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `remix-top-bots` from `main`. Paths below are relative to `ai_svc/spy_hunt/` unless they start with `src/` or `e2e/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (622 pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, new branch `remix-top-bots` from `main`. Tests: `yarn test` (200 pass today), `yarn build`, e2e: `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; BACKEND_DIR=../PP-AI-Service yarn playwright test` (3 pass today).

## Global Constraints

- Named constants in `custombots.py`: `MIN_HUMANS = 3`, `MIN_RANKED_GAMES = 10`, `MIN_RANKED_SPY_GAMES = 5`, `BOARD_SIZE = 10`.
- No owner information in any response: the board, the card, the remix credit.
- Remix copies the outfit and rules only, revalidated by `outfits.check_outfit` like any create.
- No change to rooms, the bot engine or prompts; the model-call budget is unchanged.
- Old rows (null in the new columns) read as `ranked` all 0, `listed` true, `remixes` 0, `remix_of` null, `remixable` true. Existing tests keep passing (update only assertions that compare whole cards).
- New UI copy in **en and zh-Hans**. Code comments only where behaviour is not obvious.

## Review Focus

1. **Name-only save keeps rank:** a `PATCH` carrying the same slots and the same rules list in the same order leaves the ranked columns alone; changing a slot, adding or removing a rule, or reordering rules resets them. Task B2.
2. **Edit during a game:** a game that ends after the owner changed the outfit adds to the plain record but not the ranked one. Task B2.
3. **Remix edge cases:** `remix_of` unknown, blocked, or not a string; remixing your own bot (no credit, no count); the same guest remixing the same bot twice or after deleting their remix (count stays 1); source deleted later (credit disappears). Task B1.
4. **Board ordering and thresholds:** a bot at 9 ranked games is absent, at 10 present; a 10-game 70% bot outranks a 40-game 65% bot; hidden and blocked bots are absent; invalid `kind` gives 400; an empty board returns `[]`. Task B3.
5. **Remix at the 3-bot cap and without a session:** the Remix button shows the limit hint at 3 bots; a visitor with no guest session can still open `/bots?remix=<id>`. Task F3.

---

## Task B1: Schema, card fields, `listed`, and remix on create

**Files:**
- Modify: `db.py` (SCHEMA and `init_db` migration), `custombots.py`, `routes.py` (`create_bot` only)
- Test: `tests/test_custom_bots.py`, `tests/test_custom_bots_room.py` (migration test)

**Interfaces:**
- Produces (columns on `custom_bots`): `ranked_games, ranked_wins, ranked_spy_games, ranked_spy_wins INTEGER DEFAULT 0`, `listed INTEGER DEFAULT 1`, `blocked INTEGER DEFAULT 0`, `remix_of TEXT`. New table `remixes(source_id TEXT, owner_player_id TEXT, PRIMARY KEY(source_id, owner_player_id))`. Columns go both in `SCHEMA` and, for old databases, through the idempotent `ALTER TABLE ... ADD COLUMN` handling in `init_db` (the `remixes` table is covered by `CREATE TABLE IF NOT EXISTS`).
- Produces: `custombots.create(owner, name, avatar, outfit, remix_of=None, listed=True) -> dict`; `custombots.update(owner, bot_id, body)` accepts `listed` (bool) as a valid key.
- Produces (card, in every response that returns a card): `remix_of: {"id": str, "name": str} | None`, `remixes: int`, `remixable: bool`, `ranked: {"games","wins","spy_games","spy_wins"}`, `listed: bool`, alongside the existing fields.

- [ ] **Step 1: Write failing tests:**
  - `test_custom_bots_room.py`: next to `test_old_players_table_is_migrated`, an old database whose `custom_bots` lacks the new columns gains them on `init_db()`, keeps its rows, and a second `init_db()` is harmless.
  - `test_custom_bots.py`, using `mk` and `guest`:
    - `test_card_has_remix_fields_with_defaults`: a new bot's card has `remix_of is None`, `remixes == 0`, `remixable is True`, `ranked == {"games": 0, "wins": 0, "spy_games": 0, "spy_wins": 0}`, `listed is True`; the public card equals the owner's list entry.
    - `test_listed_roundtrip`: `POST` with `listed: False` gives `listed False`; `PATCH {"listed": True}` flips it and returns 200; `listed: "yes"` gives `400 bad_request`; a `PATCH` with only `listed` is not "Nothing to update".
    - `test_remix_credit_and_count`: guest A makes a bot; guest B posts a bot with `remix_of=A's id` and their own tweaked outfit. B's card has `remix_of == {"id": A_id, "name": "Mochi"}`; A's public card has `remixes == 1`; B's second bot remixing the same source does not raise the count; B deleting their remix leaves the count at 1; a third guest raises it to 2.
    - `test_remix_of_own_bot_has_no_credit`: A remixing A's bot gives `remix_of None` and the source `remixes` stays 0.
    - `test_remix_of_errors`: unknown id gives `404 not_found`; a non-string gives `400 bad_request`; a source with `blocked=1` (set through `conn.execute`) gives `404 not_found`; none of these creates a bot.
    - `test_remix_credit_disappears_when_source_is_deleted_or_blocked`: after A deletes the source, B's card has `remix_of None`; with a still-existing source set to `blocked=1`, B's card has `remix_of None` and the source's own card has `remixable False`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_custom_bots.py ai_svc/spy_hunt/tests/test_custom_bots_room.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified. `_card` needs a connection for the credit lookup and the count: change it to `_card(conn, row)` and update its callers. `remix_of` is stored only when the source exists, is not blocked and has a different owner; the `remixes` row is inserted with `INSERT OR IGNORE` in the same transaction as the new bot. `remixes` is the row count for the bot id. `routes.create_bot` passes `body.get("remix_of")` and `body.get("listed", True)`; both are validated in `custombots` (`remix_of` a string or absent, `listed` a bool; otherwise `400 bad_request`).
- [ ] **Step 4: Run** the two files, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): remix credit, listed flag and card fields` (backend repo, branch `remix-top-bots`).

## Task B2: Ranked record at game end

**Files:**
- Modify: `custombots.py` (`record_game`, `update`)
- Test: `tests/test_custom_bots_room.py`, `tests/test_custom_bots.py`

**Interfaces:**
- Consumes: Task B1 columns and constants.
- Produces: `record_game(conn, rows, winner)` also updates `ranked_*` for each custom bot in `rows` **when** the game qualifies: `sum(1 for r in rows if not r["is_bot"]) >= MIN_HUMANS` **and** the row's `outfit_json` equals the bot's current stored outfit (the three slots, and `outfits.clean_rules` of the stored rules, compared as an ordered list). The plain record update is unchanged. `update` resets the four `ranked_*` columns to 0 when, and only when, the submitted outfit differs from the stored one by the same comparison.

- [ ] **Step 1: Write failing tests** (reuse `_play`, `_bot_room`, `room_with`; build rooms with 2 extra members so three humans are present; add a `_ranked(client, bid)` helper reading the card's `ranked`):
  - `test_ranked_counts_with_three_humans`: three humans plus a custom spy bot, spies win: `ranked == {"games": 1, "wins": 1, "spy_games": 1, "spy_wins": 1}`, and the plain `record` matches.
  - `test_two_humans_do_not_rank`: two humans: plain `games == 1`, `ranked.games == 0`.
  - `test_human_who_left_does_not_count`: three humans where one seat is converted to a bot (`UPDATE players SET is_bot=1`) before `_play`: not ranked.
  - `test_edit_during_game_skips_ranked`: add the bot, `PATCH` the outfit's voice, then `_play`: plain `games == 1`, `ranked.games == 0`.
  - `test_name_only_save_keeps_ranked`: after one ranked game, `PATCH` the full draft (name changed, same outfit and rules): `ranked.games == 1`.
  - `test_outfit_change_resets_ranked_but_not_plain`: changing a slot, adding a rule, and reordering two rules each set `ranked` to all 0 while `record.games` is unchanged; a `PATCH` with the identical outfit does not.
- [ ] **Step 2: Run** the two files. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** both changes. Share one helper `_same_outfit(stored, outfit) -> bool` between `record_game` and `update`.
- [ ] **Step 4: Run** the two files, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): ranked record for bots`.

## Task B3: Top bots endpoint, block script, backend docs

**Files:**
- Modify: `custombots.py`, `routes.py`, `README.md` (backend `ai_svc/spy_hunt/README.md`)
- Create: `scripts/block_bot.py`
- Test: `tests/test_custom_bots.py` (new section), `tests/test_block_bot.py`

**Interfaces:**
- Consumes: Task B1 columns, Task B2 ranked columns.
- Produces: `custombots.top(kind: str) -> list[dict]`, raising `StoreError(400, "bad_request", ...)` for any `kind` other than `"winners"` or `"spies"`. Each row: `{"rank": int, "id": str, "name": str, "avatar": {"emoji","color"}, "rate": int, "games": int, "remixes": int}`; `rate` is `round(100 * wins / games)`; for `spies`, `games` is `ranked_spy_games` and wins are `ranked_spy_wins`. Route `GET /bots/top?kind=winners|spies` (default `winners`), public, `@ratelimits.limit("flood")` only, returns `{"kind": kind, "bots": [...]}`. Eligibility and order exactly as spec §4.2. `scripts/block_bot.py <id> [--unblock]` sets `blocked` on the real database and prints the result.

- [ ] **Step 1: Write failing tests** (set ranked columns directly with `conn.execute` on bots made through the API):
  - `test_top_threshold_and_order`: a bot with 9 ranked games is absent; with 10 present. A 10-game 70% bot ranks above a 40-game 65% bot; equal rates order by more games, then older bot. `rank` starts at 1 and is consecutive.
  - `test_top_spies_uses_spy_columns_and_threshold`: 4 spy games absent, 5 present; `games` is the spy game count, `rate` the spy win percent.
  - `test_top_excludes_hidden_and_blocked_and_caps_at_ten`: 12 eligible bots give 10 rows; `listed=0` and `blocked=1` bots are absent.
  - `test_top_rows_have_no_owner_and_need_no_token`: the response text contains none of `owner`, `owner_player_id`, `player_id`; the request carries no auth header.
  - `test_top_bad_kind_and_empty`: `?kind=nope` gives `400 bad_request`; an empty database gives `{"kind": "winners", "bots": []}`; a row's `remixes` matches the card's.
  - `test_block_bot_script`: the script's `main(["<id>"])` sets `blocked=1`, `main(["<id>", "--unblock"])` clears it, an unknown id returns non-zero (follow how `scripts/build_puzzles.py` structures `main`).
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_custom_bots.py ai_svc/spy_hunt/tests/test_block_bot.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `top`, the route (declared next to `GET /bots/catalog`; static paths already win over `<bot_id>`), and the script. Order in SQL by `CAST(ranked_wins AS REAL) / ranked_games DESC, ranked_games DESC, created_at ASC, rowid ASC` (spy columns for `spies`), filtered by `COALESCE(listed, 1) != 0 AND COALESCE(blocked, 0) = 0` plus the minimum games, `LIMIT BOARD_SIZE`.
- [ ] **Step 4: Docs.** Backend `README.md` "Custom bots": add the route row for `GET /bots/top`, the new card fields, `remix_of` and `listed` on `POST /bots`, `listed` on `PATCH`, and a short "Ranked record and board" paragraph (3 humans, 10 and 5 game minimums, reset on outfit change, hidden vs blocked, `block_bot.py` usage).
- [ ] **Step 5: Run** the whole suite. Expected: all pass.
- [ ] **Step 6: Commit** `feat(spy-hunt): top bots board and block script; docs`.

## Task F1: Types, API client and credit lines on the card

**Files:**
- Modify: `src/api/types.ts`, `src/bots/api.ts`, `src/bots/BotCardView.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, and every fixture that builds a `BotCard` (`grep -rn "spy_wins" src`)
- Test: `src/bots/api.test.ts`, `src/bots/BotCardView.test.tsx`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Produces (types): `BotRanked = { games: number; wins: number; spy_games: number; spy_wins: number }`; `BotCard` gains `remix_of: { id: string; name: string } | null`, `remixes: number`, `remixable: boolean`, `ranked: BotRanked`, `listed: boolean`; `BotDraft` gains `listed?: boolean` and `remix_of?: string`; `TopKind = 'winners' | 'spies'`; `TopBot = { rank: number; id: string; name: string; avatar: Avatar; rate: number; games: number; remixes: number }`.
- Produces (api): `getTopBots(kind: TopKind): Promise<TopBot[]>` (`GET /bots/top?kind=...`, no guest needed, reads `bots`, returns `[]` when missing).
- Produces (view): `BotDraftPreview` gains optional `remix_of?: { id: string; name: string } | null` and `remixes?: number`. `BotCardView` renders under the name a link `Remixed from {name}` (`<Link to="/bot/{id}">`) when `remix_of` is set, and `Remixed {n} times` when `remixes > 0`.
- Copy keys (en / zh-Hans): `bots.remixedFrom` "Remixed from {name}" / "改编自 {name}"; `bots.remixes` "Remixed {n} times" / "被改编 {n} 次"; `bots.remix` "Remix" / "改编"; `bots.listed` "Show on the top bots board" / "显示在机器人排行榜上"; `bots.remixNotAllowed` "This bot cannot be remixed." / "这个机器人不能被改编。"; `top.title` "Top bots" / "机器人排行榜"; `top.card` "Top bots" / "机器人排行榜"; `top.winners` "Top winners" / "最强赢家"; `top.spies` "Best spies" / "最佳卧底"; `top.hint` "Ranked games need 3+ people in the room." / "排名局需要房间里至少有 3 位真人。"; `top.empty` "No ranked bots yet. Play a room with 3 or more people to get on the board." / "还没有上榜的机器人。和 3 位以上的真人玩一局就能上榜。"; `top.row` "{rate}% · {games} ranked games · remixed {n}×" / "{rate}% · {games} 场排名局 · 被改编 {n} 次"; `top.open` "Open" / "查看"; `top.error` "Could not load the board." / "无法加载排行榜。".

- [ ] **Step 1: Write failing tests:** `getTopBots('spies')` requests `/bots/top?kind=spies` and returns the rows, and `[]` for a body without `bots`; `BotCardView` inside `MemoryRouter` shows the link `Remixed from Mochi` pointing at `/bot/abc`, shows `Remixed 3 times` for `remixes: 3`, and shows neither when `remix_of` is null and `remixes` is 0 or absent; the i18n test (follow its existing pattern) finds every new key in both languages.
- [ ] **Step 2: Run** `yarn test src/bots src/i18n`. Expected: new tests FAIL (old fixtures fail type-check until updated).
- [ ] **Step 3: Implement** types, api function, view change and copy; add the five new fields to every fixture.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: card types, top bots api and remix credit lines` (frontend repo, branch `remix-top-bots`).

## Task F2: The Top bots screen

**Files:**
- Create: `src/screens/Top.tsx`, `src/screens/Top.test.tsx`
- Modify: `src/routes.tsx`, `src/screens/Landing.tsx`, `src/screens/Landing.test.tsx`, `src/screens/BotPage.tsx`, `src/styles/` (only if rows need layout)

**Interfaces:**
- Consumes: `getTopBots`, `TopBot` (Task F1).
- Produces: route `/top`, component `Top`. Two tabs (`role="tablist"`, two `role="tab"` buttons labelled `top.winners` and `top.spies`, winners selected first); under them the `top.hint` line; each row shows rank, `Avatar` (reuse `components/Avatar`), the name, the `top.row` line, and a link `Open` (`top.open`) to `/bot/:id`; loading text `bots.loading`; a failure shows `top.error` as an alert with a Retry button (`room.retry`); an empty list shows `top.empty`. Landing gets a button card to `/top` (`top.card`) after the "My bots" card; the bot page gets a `Link` to `/top` (`top.title`) above its Home link.

- [ ] **Step 1: Write failing tests** (mock `../bots/api`): rows appear in order with the rate and games text; clicking the Best spies tab calls `getTopBots('spies')` and shows its rows; an empty list shows the empty text and the hint; a rejected load shows the alert and Retry reloads; zh-Hans renders the Chinese labels; Landing's "Top bots" card navigates to `/top`.
- [ ] **Step 2: Run** `yarn test src/screens`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the screen, route, Landing card and bot-page link.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: top bots screen`.

## Task F3: Remix flow and the "show on board" checkbox

**Files:**
- Modify: `src/screens/BotPage.tsx`, `src/screens/Bots.tsx`, `src/bots/BotForm.tsx`
- Test: `src/screens/BotPage.test.tsx`, `src/screens/Bots.test.tsx`, `src/bots/BotForm.test.tsx`

**Interfaces:**
- Consumes: new `BotCard` fields, `getBotCard`, `listMyBots`, `createBot` (Task F1).
- Produces: `BotForm` props gain `remix?: BotCard`. With `remix` set (and no `initial`): the draft starts with `name: ''`, the source's avatar, outfit and rules copied, `listed: true`; Save calls `createBot({ ...draft, name: trimmed, remix_of: remix.id })`. Without `remix` nothing changes. The form shows a checkbox labelled `bots.listed` bound to `draft.listed` (default true; an edited bot starts from `initial.listed`); `listed` is sent on every save.
- Produces: `BotPage` shows a `Remix` button (`bots.remix`) when `!mine && bot.remixable`; it navigates to `/bots?remix=<id>`. When the viewer already has 3 bots the button is replaced by the `bots.limit` text ("You can have up to 3 bots."). `BotPage` keeps the bots list it already loads in order to count them.
- Produces: `Bots` reads `?remix=<id>` (`useSearchParams`). When present and the viewer has fewer than 3 bots, it fetches `getBotCard(id)` and opens the form with `remix`; if the card is not found or `remixable` is false it shows `bots.remixNotAllowed` and no form; at 3 bots it shows `bots.limit` and no form. After a save or cancel the param is removed.

- [ ] **Step 1: Write failing tests:**
  - `BotForm`: with `remix` the name is empty, outfit and rules are prefilled, Save is disabled until a name is typed, and `createBot` receives `remix_of: 'abc12345'` with the copied rules; the `listed` checkbox defaults checked and unchecking it sends `listed: false`; editing a bot with `listed: false` shows it unchecked; a normal create sends no `remix_of`.
  - `BotPage`: the Remix button shows for a viewer who does not own the bot and goes to `/bots?remix=abc12345`; it is absent for the owner and for `remixable: false`; with 3 bots from `listMyBots` the limit text replaces it.
  - `Bots`: rendering at `/bots?remix=abc12345` with 1 bot opens the prefilled form (mock `getBotCard`); with 3 bots it shows the limit text and no form; a 404 from `getBotCard` shows the not-allowed text; a visitor with no bots still sees the form.
- [ ] **Step 2: Run** `yarn test src/bots src/screens`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three changes.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: remix a bot and choose whether it shows on the board`.

## Task F4: End-to-end test and docs

**Files:**
- Modify: `e2e/bots.spec.ts`, `README.md` (frontend)

- [ ] **Step 1: Extend** `e2e/bots.spec.ts` with a second test: the owner creates "Mochi" (any outfit); a fresh visitor context opens `/bot/<id>`, clicks `Remix`, sees the form pre-filled with the source's voice, types the name `Mochi Jr`, saves, and the card shows `Remixed from Mochi`; the original's page then shows `Remixed 1 times`; `/top` shows the hint `Ranked games need 3+ people in the room.` and the empty-state text, and the Best spies tab shows the same empty state. (No ranked games exist under the fake model, so the board is empty.)
- [ ] **Step 2: Run** the e2e suite (command above). Expected: 4 pass.
- [ ] **Step 3: Docs.** Frontend `README.md` "Bots": two sentences on remixing (button on the bot page, credit, counted once per guest) and on the board (`/top`, ranked games need 3+ humans, 10 and 5 game minimums, reset on outfit change, owners can hide a bot).
- [ ] **Step 4: Run** `yarn test && yarn build` and the backend suite. Expected: all pass.
- [ ] **Step 5: Commit** `test: e2e for remix and the top bots board; docs` (frontend).
