# Bot Card (Bot Dress-up, First Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest creates up to 3 bots (name, emoji avatar, colour, three outfit slots); an outfit changes how the bot plays in a real room; every bot has a public page with its record.

**Architecture:** Backend: a new `outfits.py` (option tables, validation) and `custombots.py` (table access, public card, record updates); `compile_outfit` in `bots.py` turns an outfit into the existing `BotProfile` prompt text; room code copies the bot into a `players` row (new nullable columns) so later edits never touch a running game. Frontend: a typed API module, a shared card view, screens `/bots` and `/bot/:id`, and Lobby/Vote/Result/Table changes.

**Tech Stack:** Python 3 / Flask / SQLite / pytest with `fake_llm`; React 19 / TypeScript / vitest / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-bot-dressup-design.md` (in `spy-hunt`). Read it first; this plan only records the decisions it leaves to the builder.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `spy-hunt-bot-card` from `main`. Paths below are relative to `ai_svc/spy_hunt/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (501 pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, branch `bot-dressup` (already checked out, holds the spec). Tests: `yarn test` (134 pass today), `yarn build`, e2e: `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; BACKEND_DIR=../PP-AI-Service yarn playwright test`.
- Do the backend tasks (B1-B6) first; the frontend tasks (F1-F5) need the API shapes below.

## Global Constraints

- Slots and ids, verbatim: voice `cheerful, dry, chatty, terse, pirate, grandma, sleepy_cat, robot`; clue style `concrete, vague, metaphor, brief, memory, contrast`; quirk `question, agree, number, emoji, honestly, color`. The server owns ids and prompt text; the frontend labels ids in `en` and `zh-Hans`.
- At most **3 bots per guest**. Name rules are the player name rules (`store.clean_name`, 16 characters). Avatar: one emoji from a fixed list of **24** and one colour from **6** server constants.
- Bot `id`: 8 URL-safe characters. Edit and delete are owner-only. Delete makes `GET /bots/<id>` return 404; rooms already holding a copy are unaffected.
- A room copies name, avatar, outfit and `bot_id` into the player row. **One custom bot per owner per room.** Any lobby member may add their own bot; the host may add random bots and remove any bot; an owner may remove their own custom bot (`action: "remove"` with `seat`). Without `seat`, remove behaves as today.
- Public player data gains `avatar` (`{emoji, color}` or `null`) and `bot_id` (or `null`). It never carries `bot_owner_id` or the outfit. `GET /bots/<id>` returns `{id, name, avatar, outfit, record}` with no owner information and no token.
- Precedence when options conflict: scaffold rules first, then clue style, then quirk, then voice. Option text is English instruction that says to apply it "in the language of the statement". "brief" says about 8 words, not a hard limit. No server-side validation of quirks or style.
- Records count only games that end with a winner. `games`: every custom bot that played. `wins`: its side won (even if voted out). `spy_games`: it was a spy. `spy_wins`: it was a spy and the spies won.
- Information firewall and model-call budget unchanged; the compiled outfit is the only new prompt text and carries no game state. Existing built-in personalities and all existing tests keep working.
- Rate limits: create/edit/delete use the `action` limiter, list and catalog use `read`, the public page uses `flood` (IP) only.
- New UI copy in **en and zh-Hans**. Code comments only where behaviour is not obvious.

## API shapes (used by the backend tasks and the frontend tasks)

All under `/api/spy-hunt`; guest token required except `GET /bots/<id>`.

- `GET /bots/catalog` → `{voices: string[], styles: string[], quirks: string[], emojis: string[], colors: string[]}` (ids/values only).
- `GET /bots` → `{bots: MyBot[]}`; `MyBot = {id, name, avatar: {emoji, color}, outfit: {voice, style, quirk}, record}`.
- `POST /bots` body `{name, avatar: {emoji, color}, outfit: {voice, style, quirk}}` → 201 `MyBot`. `PATCH /bots/<id>` body: any subset of `name`, `avatar`, `outfit` (an `outfit` or `avatar` object must be complete) → `MyBot`. `DELETE /bots/<id>` → `{ok: true}`.
- `GET /bots/<id>` → `{id, name, avatar, outfit, record: {games, wins, spy_games, spy_wins}}`.
- Errors: `400 bad_name | bad_avatar | bad_outfit | bad_request`, `404 not_found`, `409 bot_limit`.
- `POST /rooms/<code>/bots`: `{action: "add", bot_id?: string}`, `{action: "remove", seat?: int}`. New errors: `409 bot_in_room` (owner already has a custom bot in this room), `404 not_found` (bot missing or not yours), `403 not_allowed` (removing a bot you may not remove), `400 bad_request` (bad `bot_id`/`seat`).

## Review Focus

1. **Edited or deleted after being added:** the room keeps the copy it took; a game that ends with a deleted `bot_id` updates nothing and does not error. Tasks B3, B5.
2. **Owner leaves:** in the lobby (and a finished room) their custom bot leaves with them; mid-game the bot stays; a rematch keeps custom bots. Task B3.
3. **Add/remove abuse:** second bot from the same owner, someone else's `bot_id`, a non-member, adding after the game started, a full room, removing a built-in bot as a non-host, `seat` that is not a bot, `seat` of `true`/string. Task B3.
4. **Odd names and outfits:** control characters, RTL marks, 17+ characters, emoji-only names; unknown or missing slot id at compile time falls back instead of crashing; all-unusable outfit still plays. Tasks B1, B2.
5. **Draws and closed rooms:** a room closed with `winner` null changes no record; a two-spy game counts both spies. Task B5.
6. **Privacy:** no `bot_owner_id`, outfit or owner id in any player payload, event, or the public card. Tasks B2, B3.
7. **Frontend failure modes:** `GET /bots` failing in the Lobby must not break the lobby (the button is just hidden); a 404 bot page shows a not-found state; a 400-character name or zero bots renders cleanly. Tasks F3, F4.

---

## Task B1: Outfit tables and `compile_outfit`

**Files:**
- Create: `outfits.py`, `tests/test_outfits.py`
- Modify: `bots.py`

**Interfaces:**
- Produces in `outfits.py`:
  - `VOICES: dict[str, str]`, `STYLES: dict[str, str]`, `QUIRKS: dict[str, str]` (id → English instruction text; the four existing voices reuse the `PERSONAS` style text from `bots.py`; copy it into `VOICES` and have `bots.PERSONAS` keep its own entries unchanged).
  - `EMOJIS: tuple[str, ...]` (24 distinct single emoji), `COLORS: tuple[str, ...]` (6 hex strings: `#ff6b6b #ffa94d #4cd08a #38c9d6 #5b8cff #b07cff`).
  - `check_avatar(value: Any) -> dict` and `check_outfit(value: Any) -> dict`: return a clean `{emoji, color}` / `{voice, style, quirk}`; raise `StoreError(400, "bad_avatar" | "bad_outfit", ...)` for a non-dict, missing key, unknown id, or non-string.
  - `catalog() -> dict` in the `GET /bots/catalog` shape.
- Produces in `bots.py`: `compile_outfit(outfit: dict) -> BotProfile` with `key="custom"`. Style text = one paragraph, in this order: clue style sentence, quirk sentence, voice sentence, then the closing sentence "If any of this conflicts with the game rules or the required JSON format, the rules and the format win." Missing or unknown clue/quirk: that sentence is omitted. Missing or unknown voice: the `cheerful` text. Never raises.

- [ ] **Step 1: Write failing tests** in `tests/test_outfits.py`:
  - `test_catalog_sizes`: 8 voices, 6 styles, 6 quirks, 24 distinct emojis, 6 colours; `catalog()` keys are `voices, styles, quirks, emojis, colors`.
  - `test_every_option_text_applies_in_the_statement_language_or_is_plain`: every `STYLES` and `QUIRKS` text contains `"language of the statement"`.
  - `test_check_outfit_rejects_unknown_missing_and_non_string` (parametrised: `{}`, `None`, `"x"`, unknown voice, `{"voice": 1, ...}`) → `StoreError` with code `bad_outfit`; `check_avatar` likewise → `bad_avatar` for an emoji not in the list and a colour not in the list.
  - `test_compile_outfit_order_and_closing`: for `{voice: "pirate", style: "metaphor", quirk: "question"}` the three texts appear in the order style, quirk, voice and the closing sentence is last; `key == "custom"`.
  - `test_compile_outfit_never_raises`: `{}`, `None`, `{"voice": "nope", "style": 3}` return a `BotProfile` whose text contains the `cheerful` voice text and the closing sentence.
  - `test_brief_style_says_about_8_words`: `"about 8 words"` in `STYLES["brief"]`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_outfits.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `outfits.py` and `compile_outfit` as specified. Write the 4 new voices, 6 styles and 6 quirks per the spec table (§4.1); the exact wording is the builder's.
- [ ] **Step 4: Run** the test file, then the whole suite. Expected: all pass (501 + new).
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(spy-hunt): outfit tables and compile_outfit"` (branch `spy-hunt-bot-card` created from `main` first).

---

## Task B2: Custom bot table, CRUD and public card

**Files:**
- Create: `custombots.py`, `tests/test_custom_bots.py`
- Modify: `db.py`, `routes.py`

**Interfaces:**
- Consumes: `outfits.check_avatar/check_outfit/catalog`, `store.clean_name`, `store.StoreError`, `auth.require_guest`, `ratelimits.limit`.
- Produces: table `custom_bots(id TEXT PRIMARY KEY, owner_player_id TEXT, name TEXT, avatar_emoji TEXT, avatar_color TEXT, voice TEXT, style TEXT, quirk TEXT, games INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, spy_games INTEGER DEFAULT 0, spy_wins INTEGER DEFAULT 0, created_at INTEGER)` plus `CREATE INDEX idx_custom_bots_owner ON custom_bots(owner_player_id)` in `SCHEMA`. In `custombots.py`:
  - `MAX_BOTS = 3`
  - `create(owner: str, name: Any, avatar: Any, outfit: Any) -> dict` (a `MyBot`; raises `409 bot_limit` when the owner already has 3; the count check and insert happen in one `BEGIN IMMEDIATE`)
  - `list_for(owner: str) -> list[dict]` (oldest first)
  - `update(owner: str, bot_id: str, body: dict) -> dict` (`404 not_found` for a missing bot or another owner's; `400 bad_request` when `body` has none of `name, avatar, outfit`)
  - `delete(owner: str, bot_id: str) -> None`
  - `get_card(bot_id: str) -> dict | None` (public card shape, no owner)
  - `get_owned(conn, owner: str, bot_id: str) -> sqlite3.Row | None` (used by B3)
- Routes: the endpoints in "API shapes" under `/bots`. `/bots/catalog` is a static route and must not be shadowed by `/bots/<id>`.

- [ ] **Step 1: Write failing tests** in `tests/test_custom_bots.py` (helpers: `guest(client)` as in `tests/test_rooms.py`):
  - `test_create_list_update_delete_roundtrip`: create returns 201 with an 8-char URL-safe `id`, `record == {games: 0, wins: 0, spy_games: 0, spy_wins: 0}`; list shows it; PATCH `{"name": "Mochi2"}` keeps avatar/outfit; DELETE then list is empty.
  - `test_fourth_bot_is_refused`: 3 creates succeed, the 4th is `409 bot_limit`; after deleting one, a create succeeds again.
  - `test_name_is_cleaned`: `"  Mo\u202e\nchi  "` is stored as `"Mo chi"` (control and format chars stripped, whitespace collapsed); 17+ chars cut to 16; `""`, `"\u200b"`, `123` → `400 bad_name`.
  - `test_bad_avatar_and_outfit`: unknown emoji, colour `"#000000"`, missing `voice`, extra unknown `style` id → `400 bad_avatar` / `bad_outfit`; PATCH with a partial `avatar` → `400 bad_avatar`.
  - `test_other_guest_cannot_edit_or_delete`: another guest's PATCH and DELETE → `404 not_found`; bot unchanged.
  - `test_public_card_needs_no_token_and_hides_owner`: `GET /bots/<id>` without `Authorization` → 200, keys exactly `{id, name, avatar, outfit, record}`; the owner's `player_id` string appears nowhere in the response text; after delete → 404; unknown id and a 200-char id → 404.
  - `test_requests_need_a_guest_token`: `GET /bots`, `POST /bots`, `GET /bots/catalog` without a token → 401.
  - `test_catalog_endpoint_matches_outfits_catalog`.
  - `test_public_card_is_rate_limited_per_ip_only`: 201 requests from one IP → the last is 429 (`flood`); no guest identity is needed.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_custom_bots.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `SCHEMA` additions in `db.py`, `custombots.py` and the routes. Generate ids with `secrets.token_urlsafe(6)` (8 chars) and retry on collision. Routes validate the JSON body like the existing ones (`_json_body`).
- [ ] **Step 4: Run** the new tests, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): custom bot CRUD and public bot card`.

---

## Task B3: Bots in rooms (player columns, add/remove/leave)

**Files:**
- Modify: `db.py`, `store.py`, `visibility.py`, `game.py`, `routes.py`, existing tests that assert an exact public-player dict (`tests/test_rooms.py` and any other that fails; add `"avatar": None, "bot_id": None`)
- Create: `tests/test_custom_bots_room.py`

**Interfaces:**
- Consumes: `custombots.get_owned`, B2 table.
- Produces:
  - `players` gains nullable columns `avatar_emoji TEXT, avatar_color TEXT, bot_id TEXT, bot_owner_id TEXT, outfit_json TEXT` in `SCHEMA`, and `db.init_db()` adds any missing ones to an existing table (`PRAGMA table_info(players)` then `ALTER TABLE ... ADD COLUMN`), so a database made before this change keeps working.
  - `store.PUBLIC_PLAYER_COLS` also lists `avatar_emoji, avatar_color, bot_id` (never `bot_owner_id`, `outfit_json`). `visibility.public_player` adds `"avatar": {"emoji", "color"}` or `None` (when `avatar_emoji` is null) and `"bot_id"`.
  - `game.add_bot(room_id: str, by_player: str, bot_id: str | None = None) -> None`: with `bot_id` None the behaviour is unchanged (host only, random bot). With `bot_id`: the caller must be a member (`403 not_member`), the room must be a lobby (`409 not_lobby`), the bot must be owned by the caller (`404 not_found`), the caller must have no custom bot in the room (`409 bot_in_room`), and the room must not be full (`409 room_full`). The row copies name, avatar, outfit (as `outfit_json`), `bot_id`, `bot_owner_id = by_player`, `bot_persona = "custom"`, the room's `main_lang`, `is_bot = 1`.
  - `game.remove_bot(room_id: str, by_player: str, seat: int | None = None) -> None`: without `seat` unchanged. With `seat`: it must be a real `int` (not `bool`) naming an existing bot (`400 bad_request` / `404 not_found`); the host may remove any bot, an owner may remove their own custom bot, anyone else gets `403 not_allowed`. Lobby only.
  - `game.leave`: when the room's status is not `playing`, every player row with `bot_owner_id == player_id` is deleted too, each with a `player_left` event. Mid-game nothing extra happens.
  - Route `POST /rooms/<code>/bots` passes `body.get("bot_id")` and `body.get("seat")` (type-checked: `bot_id` str or absent, `seat` int or absent, else `400 bad_request`).

- [ ] **Step 1: Write failing tests** in `tests/test_custom_bots_room.py` (create room and bots through the HTTP routes):
  - `test_member_adds_own_bot_and_snapshot_shows_avatar_not_owner`: a non-host member adds a bot; the snapshot's player has `is_bot True`, `avatar == {"emoji": ..., "color": ...}`, `bot_id == <id>`, and neither `bot_owner_id` nor `outfit_json` nor the owner's `player_id` appears anywhere in the response text; a `player_joined` event carries the same public player.
  - `test_second_custom_bot_from_the_same_owner_is_refused`: `409 bot_in_room`; a different member can still add theirs.
  - `test_cannot_add_someone_elses_or_missing_bot`: `404 not_found`.
  - `test_non_member_and_non_host_random_add`: a stranger → `403 not_member`; a member without `bot_id` → `403 not_host`.
  - `test_add_after_start_and_when_full`: `409 not_lobby`; with `max_players` filled → `409 room_full`.
  - `test_edit_or_delete_after_adding_does_not_change_the_room`: PATCH the name, then DELETE the bot; the room snapshot player is unchanged and the game starts.
  - `test_remove_rules`: host removes a member's custom bot by `seat`; owner removes their own; a third member → `403 not_allowed`; a non-host member removing a built-in bot → `403 not_allowed`; `seat` naming a human or an empty seat → `404 not_found`, `seat` = `True` and `"1"` → `400 bad_request`; remove without `seat` still removes the last bot for the host.
  - `test_owner_leaving_lobby_takes_the_bot_with_them`: `player_left` events for the human and the bot; a finished room behaves the same; leaving mid-game leaves the custom bot in place and the human's seat becomes a built-in bot with `avatar None, bot_id None`.
  - `test_rematch_keeps_custom_bots`.
  - `test_start_fill_counts_custom_bots`: 1 human + 1 custom bot with `bot_fill` adds exactly 2 random bots (min 4).
  - `test_old_players_table_is_migrated`: create a DB with the previous `players` DDL and one row, run `init_db()`, the row survives and the five columns exist; running `init_db()` twice is fine.
- [ ] **Step 2: Run** the new file. Expected: FAIL.
- [ ] **Step 3: Implement** the changes listed in Interfaces. `_insert_bot` gets an optional `custom` row argument rather than a second insert path. Fix exact-dict assertions in existing tests that break.
- [ ] **Step 4: Run** the new tests, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): bring a custom bot into a room`.

---

## Task B4: Custom bots play with their outfit

**Files:**
- Modify: `bots.py`
- Test: `tests/test_bots.py` (add tests; reuse its `benv`, `lobby_with_bots` and helpers)

**Interfaces:**
- Consumes: `compile_outfit` (B1), `players.outfit_json` (B3).
- Produces: `_persona_of(me)` returns `compile_outfit(json.loads(me["outfit_json"]))` when `me["bot_persona"] == "custom"` (any `json` error falls back to the `cheerful` built-in), else the existing lookup. `public_view` uses the same function for its `persona` field, so the view and the prompts agree.

- [ ] **Step 1: Write failing tests** in `tests/test_bots.py`:
  - `test_custom_bot_prompt_contains_the_compiled_outfit_only`: put a custom bot in a started game (insert through `game.add_bot(..., bot_id=...)`), capture the describe prompt with the fake LLM; it contains the compiled text for the outfit, the secret word of that seat, and does not contain the other word, the string `"role"`, or any other seat's word (same assertions as `test_prompt_has_public_statements_and_persona_never_role_or_other_word`).
  - `test_custom_bot_vote_prompt_uses_the_outfit_and_still_asks_for_json`: the vote prompt contains the compiled text and the exact JSON-form sentence.
  - `test_broken_outfit_json_falls_back_to_cheerful_and_the_bot_still_speaks`: set `outfit_json` to `"{"` directly in the DB; the turn still produces a statement.
  - `test_custom_bot_keeps_existing_checks`: a model reply naming the bot's own word is replaced by the canned fallback (`own_word`), an empty reply too.
  - `test_builtin_bot_prompts_are_unchanged`: the prompt for a random bot equals what the old builder produced for the same view (compare against `PERSONAS[key].style` as the existing test does).
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_bots.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `_persona_of` and the `public_view` change.
- [ ] **Step 4: Run** the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): custom bots play with their outfit`.

---

## Task B5: Records at game end

**Files:**
- Modify: `custombots.py`, `game.py` (`_finish`)
- Test: `tests/test_custom_bots_room.py`

**Interfaces:**
- Produces: `custombots.record_game(conn, rows, winner: str | None) -> None`. `rows` are the room's player rows (with `bot_id`, `role`). Does nothing when `winner` is None. For each row with a `bot_id`: `games += 1`; `wins += 1` when (`role == "spy"` and `winner == "spies"`) or (`role == "civilian"` and `winner == "civilians"`); `spy_games += 1` when `role == "spy"`; `spy_wins += 1` when spy and spies won. A missing bot row updates nothing. `game._finish` calls it inside its transaction, before the `game_over` event.

- [ ] **Step 1: Write failing tests** (`tests/test_custom_bots_room.py`, drive a game to the end the way `tests/test_game_flow.py` does, or call `game._finish` through a helper there):
  - `test_civilian_bot_in_a_civilian_win`: `games 1, wins 1, spy_games 0, spy_wins 0`.
  - `test_spy_bot_in_a_spy_win`: `games 1, wins 1, spy_games 1, spy_wins 1`; a spy bot in a civilian win: `games 1, wins 0, spy_games 1, spy_wins 0`.
  - `test_voted_out_civilian_bot_still_wins_with_its_side`.
  - `test_two_spy_game_counts_both_spy_bots` (8 players, two custom bots from two owners both spies).
  - `test_closed_room_without_winner_counts_nothing`: all humans leave mid-game, no record changes.
  - `test_deleted_bot_does_not_break_game_end`.
  - `test_record_appears_on_the_public_card_and_in_my_list`.
  - `test_rematch_then_second_game_adds_another_game`.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** `record_game` (plain `UPDATE ... SET games = games + 1, ...` per bot) and the call in `_finish`.
- [ ] **Step 4: Run** the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): custom bot records at game end`.

---

## Task B6: Backend docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Custom bots" section** to `ai_svc/spy_hunt/README.md`: the endpoints (copy the table from "API shapes"), the 3-bot cap, one custom bot per owner per room, that outfits are prompt-only, that a database from before this change is migrated on start, and that the public card never shows an owner.
- [ ] **Step 2: Run** the whole backend suite one more time. Expected: all pass. Run `git status` and confirm no stray files (`spy_hunt.db` must not be modified by the tests).
- [ ] **Step 3: Commit** `docs(spy-hunt): custom bots`.

---

## Task F1: Types, API module, Avatar, PlayerChip, option labels

**Files:**
- Create: `src/bots/api.ts`, `src/bots/api.test.ts`, `src/components/Avatar.tsx`, `src/components/Avatar.test.tsx`
- Modify: `src/api/types.ts`, `src/components/PlayerChip.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/test/fixtures.ts` (no change needed if the new `Player` fields are optional)

**Interfaces:**
- Produces in `types.ts`: `Avatar = { emoji: string; color: string }`; `Player` gains `avatar?: Avatar | null` and `bot_id?: string | null`; `BotOutfit = { voice: string; style: string; quirk: string }`; `BotRecord = { games: number; wins: number; spy_games: number; spy_wins: number }`; `BotCard = { id: string; name: string; avatar: Avatar; outfit: BotOutfit; record: BotRecord }` (also the type of a "my bot"); `BotCatalog = { voices: string[]; styles: string[]; quirks: string[]; emojis: string[]; colors: string[] }`; `BotDraft = { name: string; avatar: Avatar; outfit: BotOutfit }`.
- Produces in `src/bots/api.ts` (each starts with `await ensureGuest()`, except `getBotCard`): `getCatalog(): Promise<BotCatalog>`, `listMyBots(): Promise<BotCard[]>` (unwraps `.bots`), `createBot(d: BotDraft): Promise<BotCard>`, `updateBot(id: string, d: Partial<BotDraft>): Promise<BotCard>`, `deleteBot(id: string): Promise<void>`, `getBotCard(id: string): Promise<BotCard>` (no guest, no auth needed; `encodeURIComponent(id)`).
- Produces `Avatar` component: `<Avatar player={Player | {name: string; avatar?: Avatar | null}} />`, renders the emoji on the colour as a `span.avatar` (inline `background`), or the first letter of the name when there is no avatar (today's look).
- Produces i18n keys (en copy; zh-Hans is the builder's plain choice): `bots.voice.<id>`, `bots.style.<id>`, `bots.quirk.<id>` for every id in Global Constraints (e.g. `bots.voice.pirate` "Pirate", `bots.style.metaphor` "Metaphor", `bots.quirk.question` "Ends with a question"), and slot titles `bots.slot.voice` "Voice", `bots.slot.style` "Clue style", `bots.slot.quirk` "Quirk".
- `PlayerChip`: uses `Avatar`; when `player.bot_id` is set, the name is an `<a href="/bot/<id>" target="_blank" rel="noopener">` (plain anchor so it works outside a router and keeps the game tab open).

- [ ] **Step 1: Write failing tests:**
  - `api.test.ts` (mock `../api/client` `request` and `../state/session` `ensureGuest` like `src/daily/api.test.ts`): `listMyBots` calls `GET /bots` and returns the array; `createBot` posts to `/bots` with the draft; `updateBot` PATCHes `/bots/abc`; `deleteBot` DELETEs `/bots/abc`; `getBotCard('a b/c')` requests `/bots/a%20b%2Fc` and does not call `ensureGuest`.
  - `Avatar.test.tsx`: emoji and colour render for a bot player; a human with no avatar shows the initial letter; an empty name shows `?`.
  - `PlayerChip` (add to a new `src/components/PlayerChip.test.tsx`): a bot with `bot_id: 'abc12345'` renders a link with `href="/bot/abc12345"`; a player without `bot_id` has no link; a 100-character name keeps the `wrap` class.
  - `src/i18n/i18n.test.ts`: add a test that every id in the Global Constraints has a `bots.voice|style|quirk.<id>` key in both language files.
- [ ] **Step 2: Run** `yarn test src/bots src/components src/i18n`. Expected: FAIL.
- [ ] **Step 3: Implement** types, API, `Avatar`, `PlayerChip` and the copy. Add CSS for `.avatar` emoji sizing if needed in `src/styles/global.css`.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: bot types, API client, avatar and linked player chip`.

---

## Task F2: Bot card view and public page `/bot/:id`

**Files:**
- Create: `src/bots/BotCardView.tsx`, `src/screens/BotPage.tsx`, `src/screens/BotPage.test.tsx`
- Modify: `src/routes.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`

**Interfaces:**
- Consumes: `getBotCard`, `Avatar`, `shareResult` from `src/daily/share.ts` (as the Result screen does).
- Produces: `BotCardView({ bot }: { bot: BotCard | BotDraftPreview })` where the preview type is `{ name; avatar; outfit; record?: BotRecord }`: avatar, name (class `wrap`), the three slots as `Voice: Pirate` lines via the label keys, and, only when `record` is given, `"{games} games · {wins} wins · fooled the table {n} times"` (keys `bots.record`, `bots.fooled`). `BotPage` at `/bot/:id`: loading state, the card, a "Copy link" button that calls `shareResult(window.location.href)` and shows the same `shared/copied/failed` status messages as the Result screen, an "Edit" link to `/bots` shown only when the id is in `listMyBots()` (a failure of that call just hides the link; never call `ensureGuest` just for this: use the session's existing credentials, hide Edit when there are none), and a not-found state for a 404 and a generic error state otherwise, each with a link home.

- [ ] **Step 1: Write failing tests** in `BotPage.test.tsx` (mock `../bots/api`, router with `/bot/:id`):
  - renders name, `Voice: Pirate`, `Style: Metaphor`, `Quirk: Ends with a question` and `12 games · 7 wins · fooled the table 3 times`;
  - Copy link calls `shareResult` with the page URL and shows "Copied" / "Could not share." (mock returns `'copied'`, `'failed'`);
  - 404 (`new ApiError(404, 'not_found')`) shows "Bot not found" and no card; a network error shows the generic message;
  - Edit shows only when `listMyBots` returns that id, and is absent when it rejects;
  - a 16-character name made of wide characters has the `wrap` class (no overflow); Chinese copy renders after `setLang('zh-Hans')`;
  - zero games shows `0 games · 0 wins · fooled the table 0 times` without a divide or NaN.
- [ ] **Step 2: Run** `yarn test src/screens/BotPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the view, page, route (`/bot/:id` before the `*` route) and copy.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: public bot page`.

---

## Task F3: My bots screen (`/bots`), create/edit form, entry points

**Files:**
- Create: `src/screens/Bots.tsx`, `src/bots/BotForm.tsx`, `src/screens/Bots.test.tsx`
- Modify: `src/routes.tsx`, `src/screens/Landing.tsx`, `src/screens/DailyResult.tsx`, `src/screens/Landing.test.tsx`, `src/screens/Daily.test.tsx`, i18n files

**Interfaces:**
- Consumes: `listMyBots`, `getCatalog`, `createBot`, `updateBot`, `deleteBot`, `BotCardView`, `Avatar`.
- Produces: `Bots` (route `/bots`): the guest's bots as cards with "Edit" and "Delete" (two-step, no `window.confirm`: the first click turns the button into "Really delete?", the second deletes), a "New bot" button disabled at 3 bots with the hint "You can have up to 3 bots.", and the form below the list. `BotForm({ initial?: BotCard, catalog: BotCatalog, onSaved(bot: BotCard): void, onCancel(): void })`: name input (`maxLength={16}`), emoji grid and colour swatches as `radiogroup`s (`role="radio"` buttons, like `LangPicker`), three slot pickers (radiogroups titled by `bots.slot.*`, each option labelled by its id key), a live `BotCardView` preview (no record), and Save, disabled while the name is blank or a request is in flight. Server errors show as `role="alert"` using the message, `bot_limit` shows the limit text. Landing gets a "My bots" button card to `/bots` (key `bots.card`); `DailyResult` gets a "Dress up a bot" button to `/bots` (key `daily.dressUp`) next to "Play a real round".

- [ ] **Step 1: Write failing tests:**
  - `Bots.test.tsx` (mock `../bots/api`): lists two bots; "New bot" opens the form with the first catalog option of each group preselected; typing a name and clicking an emoji, a colour and a style updates the preview text; Save calls `createBot` with `{name, avatar: {emoji, color}, outfit: {voice, style, quirk}}` and the new card appears; Edit prefills and Save calls `updateBot(id, ...)`; Delete needs two clicks and then calls `deleteBot`; with 3 bots "New bot" is disabled and the hint is shown; Save is disabled for a blank/whitespace name; a rejected save shows `role="alert"`; a rejected list shows an error and a retry button.
  - `Landing.test.tsx`: "My bots" navigates to `/bots`.
  - `Daily.test.tsx`: on the result screen "Dress up a bot" navigates to `/bots`.
- [ ] **Step 2: Run** `yarn test src/screens`. Expected: FAIL.
- [ ] **Step 3: Implement** screens, route and copy; keep pickers keyboard-operable and each option at least 44px tall (match `.langpicker .chip`).
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: my bots screen with create and edit form`.

---

## Task F4: Lobby "Add my bot" and avatars in game screens

**Files:**
- Modify: `src/screens/Lobby.tsx`, `src/screens/Vote.tsx`, `src/screens/Result.tsx`, `src/screens/Table.tsx`, `src/screens/Lobby.test.tsx`, `src/screens/Result.test.tsx`, `src/screens/Game.test.tsx`, i18n files

**Interfaces:**
- Consumes: `listMyBots`, `Avatar`, `request`.
- Behaviour: on mount (lobby only) `Lobby` calls `listMyBots()` inside its own effect; on any failure it keeps an empty list. `myIds` = the ids of my bots. Members (host or not) with at least one bot see an "Add my bot" button (key `lobby.addMyBot`). It is disabled when a player row has a `bot_id` in `myIds` (one per owner) or the room is full. Clicking opens a short list of my bots (not already in the room); picking one calls `POST /rooms/<code>/bots {action: 'add', bot_id}` and closes the list. Each chip whose `bot_id` is in `myIds` gets a "Remove" button calling `{action: 'remove', seat}`. The host's existing "Add bot / Remove bot" buttons are unchanged. Errors reuse the Lobby `role="alert"` line. `Vote` target buttons, `Result` "everyone" rows and the Table "speaking" line render `Avatar` before the name; no other text changes, so existing assertions on names still hold.

- [ ] **Step 1: Write failing tests:**
  - `Lobby.test.tsx` (mock `../bots/api`): a non-host member with bots sees "Add my bot"; with none, no button; `listMyBots` rejecting leaves the lobby fully usable (Start/host controls present, no alert); picking a bot posts `{action: 'add', bot_id: 'b1'}` to `/rooms/ABCD/bots`; the button is disabled once a player has `bot_id: 'b1'`; a bot already in the room is not offered again; my bot's chip has a Remove button posting `{action: 'remove', seat: 4}`, other bots' chips have none; avatar emoji is shown for a bot player.
  - `Game.test.tsx` / `Result.test.tsx`: a player with an avatar shows its emoji in the vote target and in the "everyone" list, and the existing name-based queries still pass.
- [ ] **Step 2: Run** `yarn test src/screens`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add my bot in the lobby and show bot avatars in games`.

---

## Task F5: End-to-end check and docs

**Files:**
- Create: `e2e/bots.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e test** `e2e/bots.spec.ts` against the throwaway backend (fake LLM): one player opens `/bots`, creates "Mochi" (pick an emoji, `Pirate`, `Metaphor`, `Ends with a question`), sees the card; opens `/bot/<id>` from the link in a fresh browser context without a session and sees the name and `0 games · 0 wins · fooled the table 0 times`; creates a room, clicks "Add my bot", sees "Mochi" with the Bot tag in the lobby, starts the game (fake LLM bots fill to 4), and the table appears.
- [ ] **Step 2: Run** the e2e suite (command in "Repos and branches"). Expected: 3 pass (smoke, daily, bots).
- [ ] **Step 3: Update `README.md`** (frontend): one paragraph on bots and the `/bots` and `/bot/:id` routes (Nginx's `try_files` fallback already covers them).
- [ ] **Step 4: Run** `yarn test && yarn build` and the backend suite. Expected: all pass.
- [ ] **Step 5: Commit** `test: e2e for the bot card flow; docs`.
