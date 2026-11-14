# Language persistence and past-game history: design

Status: draft for owner approval. Date: 2026-11-13. Builds on the accounts slice (`2026-11-11-accounts-design.md`): every player, guest or registered, already has a durable `player_id` identity with multi-device sessions — this doc reuses that identity for both features below rather than inventing a new one.

## 1. Intent

Two unrelated gaps the owner flagged in one pass:

- **Language resets on refresh.** The language picker's choice is already written to `localStorage`/`sessionStorage` (`session.ts`), but the in-memory i18n module (`src/i18n/index.ts`) initializes itself from `navigator.language` at module load, not from that stored value — so outside a room (where `Room.tsx` happens to reconcile it from the room snapshot), a refresh silently reverts to browser-detected language even though the real preference is sitting in storage, unread. This is a plain bug, not a design choice.
- **No persistent record of a player's own past room games.** Daily puzzles (`puzzle_results`) and bot arena matches (`arena_matches`/`arena_entries`) both keep durable per-game history today; ordinary room games do not — the richest data about a finished game (`game_over`'s reveal: every seat's role, the words, the credit breakdown) is streamed live over SSE and then lost once the room is eventually swept. The owner wants past activity (games played) visible on the player's own project/profile.

Both features hang off the same identity the accounts slice already established (`player_id`, stable across guest-to-registered upgrade and across devices once logged in), so both are additive: new columns/tables plus new read endpoints, no change to existing identity or session mechanics.

## 2. Goals, non-goals, anti-goals

Goals
- Refreshing the browser never silently reverts the UI language to a browser-detected default when a language was already chosen.
- A player's language — whatever it resolves to, whether from an explicit pick or from browser auto-detection — is remembered as their general preference and is restored automatically when they log into their account on a different device.
- A room's own `main_lang` (host setting) and a seat's in-room `lang` (drives server-side chat translation for that room) keep working exactly as they do today — this is a separate, room-scoped concept and nothing about it changes.
- A player can see a list of their own recently finished room games (their role, win/lose, credits earned) and open any one of them to see the full reveal: every seat's role, the words, and the credit breakdown — mirroring what `MatchPage.tsx` already does for bot arena matches, but for the player's own human games.

Non-goals (this slice)
- A full chat/vote replay of a past game (statements, who-voted-for-whom, round-by-round). That requires keeping full event logs past the existing 24h sweep, which is a materially bigger retention change; this slice persists only the end-of-game reveal, the same altitude `arena_matches.log_json` captures for bots versus what `MatchPage` actually renders from it today for the reveal section.
- Any change to the daily-puzzle streak, credits ledger, clans, or bot arena systems. `_finish()` gains one more independent call alongside its existing three (bots, clans, credits); none of those three change.
- A "my games" feed for bot arena matches — that already exists (`RecapList.tsx`/`GET /bots/recaps`) and is untouched.
- Deleting or expiring old game-history rows. Kept indefinitely, same as `puzzle_results` today (nothing prunes that table either).
- A game a player left before it finished showing up in their own history at all. A finished-game record is written once, at the existing `_finish()` hook — a player whose seat was already handed to a bot by the time that hook runs (the existing behavior of `game.py`'s `leave()` while a room is still playing) simply isn't in that game's history, the same way they already earn no credits or clan points for it today. **(owner confirmed)**
- A "new/unseen" indicator on history entries (the arena recap list's `seen` flag has no equivalent here) — nothing in the goals above calls for a notification on this feature.

Anti-goals (a failure even if it technically works)
- A past game's detail page depending on the room/player rows still existing in the live tables — those get swept/pruned on their own schedule, so the history record must be a self-contained snapshot taken at the moment the game ends, not a view joined against live state.
- The account-level language preference fighting with a room's own per-seat `lang` while a player is actively in a room (e.g., a background account fetch flipping the displayed language out from under `Room.tsx`'s own reconciliation).
- Exposing another human player's raw `player_id` in the game-detail response (only seat, role, and whether that seat belongs to the viewer).

## 3. Approaches considered

### Language persistence

- **A. Fix only the client-side bug** (bootstrap the i18n module from the already-stored session value instead of `navigator.language`). Zero schema change, fixes exactly the reported symptom, but a login on a second device still starts from that device's browser-detected language — "preferred language" never actually follows the account the way bots/credits/streak already do post-accounts-slice.
- **B. Fix the client bug and add an account-level preference (`guests.preferred_lang`), pulled down on login/register and pushed up whenever a player explicitly picks a language anywhere (top bar or in-room picker) (chosen).** Small, additive, and follows the exact migration/route idiom the accounts slice already established — matches how every other per-player durable fact (bots, credits, streak) is already keyed on `player_id` rather than left to one browser's storage.
- C. Derive "preferred language" retroactively from the last room a player was seated in (`players.lang`). Rejected: once a room is swept there's nothing to read back, and it conflates "what I set for one specific past room" (which can be a one-off, e.g. switching briefly to read a friend's message) with "what I want as my default going forward."

### Game history

- A. A list-only digest row per finished game (date, result, credits) with no detail view. Minimal, but throws away the reveal data (roles, words) that's already fully computed at `_finish()` time and costs almost nothing extra to keep.
- **B. A list and a detail view, storing the full end-of-game reveal snapshot (chosen).** `_finish()` already computes everything needed (`rows`, `words`, `parts`) for the live `game_over` event; writing the same data to a durable table instead of only streaming it is a small addition at the one well-defined game-end hook that already performs three other side effects (bots, clans, credits) the same way.
- C. Don't add a new table; instead run a periodic job that mines `rooms`/`players`/`events` for finished games before they're swept and backfills history from that. Rejected: adds a background job and a race against the existing 24h event-retention window, for no benefit over writing the record synchronously at the single hook that already fires exactly once per finished game.

## 4. Design

### 4.1 Language: the refresh fix **(call)**

- `src/i18n/index.ts` currently initializes `let current: Lang = detectLang(navigator.language)` (line 11) with no read of stored state at all. It changes to initialize from the stored session instead: `getSession().lang` (which itself already falls back to `detectLang(navigator.language)` when nothing is stored, per `session.ts:68-76`) — so a fresh browser behaves exactly as before, and a returning one now actually restores what was picked. This one-line change fixes the reported bug on its own, independent of everything below.
- `Room.tsx`'s existing `setLang(me.lang)` reconciliation (line 70, when entering a room) is unchanged — the room's per-seat language still wins while you're in that room.

### 4.2 Language: account-level preference **(call)**

- `guests` gains one nullable column, `preferred_lang TEXT`, via the same idempotent `PRAGMA table_info(guests)` migration idiom already used for `email`/`password_hash` (`db.py:155-162`) — no new index needed (this is never looked up by value, only by `player_id`).
- `auth.create_guest()` (`auth.py:18-33`) seeds `preferred_lang` from the language the client already detected, so the common case — someone whose browser auto-detect already guessed right, who therefore never touches the picker — still gets a value that follows their account to a new device. The frontend's `POST /guests` call (from `ensureGuest()` in `session.ts`) passes `{lang: getSession().lang}` as the request body (that getter already resolves to the stored session value or, failing that, `detectLang(navigator.language)` — see §4.1); `create_guest` writes whatever language it's given as the initial `preferred_lang` rather than leaving it null until an explicit pick. **(call)**
- `accounts.me()` (`accounts.py:149-153`) extends its `SELECT` to also read `preferred_lang` and includes it in the returned dict; `GET /me`'s response shape becomes `{email, preferred_lang}`.
- New endpoint `PATCH /me`, body `{lang}`: `@ratelimits.limit("flood")` → `@auth.require_guest` → `@ratelimits.limit("action")` (a write, same tier as `register`/`logout`), validates `lang` against the same allowed-language set the room-settings routes already validate `main_lang`/`lang` against, then `UPDATE guests SET preferred_lang=? WHERE player_id=?`. Returns `{ok: true, preferred_lang}`.
- `POST /login`'s response (`accounts.py:105-129`) gains `preferred_lang` alongside the existing `{player_id, token, email}`, so the frontend learns the account's preference at the exact moment identity changes to a different device's account — not from a generic background poll, which avoids any race with `Room.tsx` while already seated in a room. `login()` in `src/state/accounts.ts` applies it immediately (`setLang`/`setSessionLang`) when non-null, the same moment it already adopts that account's bots/credits/streak.
- Every place a player explicitly picks *their own* language — the top bar's `pickLang` (`TopBar.tsx:17-20`) and the per-player picker in `Lobby.tsx`/`Table.tsx` — also fires `PATCH /me {lang}` (fire-and-forget, errors swallowed; a language pick is low-stakes) in addition to its existing `setLang`/`setSessionLang` calls. The room's host-only `main_lang` picker (`Lobby.tsx:127`) is untouched — that's a setting about the room, not about the player, and never touches `preferred_lang`.
- If no local session exists yet (a first-time visitor on the landing page picking a language before ever creating a guest), the `PATCH /me` call is skipped — picking a language must not force an eager guest to be created, matching the accounts slice's existing "no eager guest creation" rule (`2026-11-11-accounts-design.md` §4.4).

### 4.3 Game history: storage **(call)**

Two new tables, mirroring the existing `arena_matches`/`arena_entries` split (one row per game, one row per human participant), written at `_finish()` time (`game.py:261-283`) right after the existing `parts = credits.award_game_parts(...)` call, via a new `history.record_game(conn, room, rows, winner, words, parts)` in a new module `ai_svc/spy_hunt/history.py` — a fourth independent call alongside the three `_finish()` already makes, same pattern, no change to the other three or to the `game_over` event payload itself.

```sql
CREATE TABLE IF NOT EXISTS room_results(
  room_id TEXT, game_no INTEGER, finished_at INTEGER, winner TEXT, lang TEXT,
  roles_json TEXT, words_json TEXT, PRIMARY KEY(room_id, game_no));
CREATE TABLE IF NOT EXISTS room_result_players(
  room_id TEXT, game_no INTEGER, player_id TEXT, seat INTEGER, role TEXT, won INTEGER,
  credits_earned INTEGER, credit_parts TEXT, PRIMARY KEY(room_id, game_no, player_id));
CREATE INDEX IF NOT EXISTS idx_room_result_players_player ON room_result_players(player_id);
```

- `roles_json` snapshots **every** seat (human and bot) as `[{seat, role, is_bot, name}]` — taken from `rows` at `_finish()` time, since by the time a player opens their history the live `players`/`rooms` rows that `name` would otherwise come from may already be gone. This is the anti-goal from §2: the history record must be self-contained, not a join against live state.
- `words_json` is `words` (the same `visibility._pair_words(...)` result already computed in `_finish()`), so the detail view can show the word pair exactly as `DailyResult.tsx` already does for the daily puzzle.
- `room_result_players` gets one row per **human** row in `rows` (bots are skipped here, same as `credits.award_game_parts` already only returning entries for humans) — `credits_earned`/`credit_parts` read straight from `parts` (the pre-reseat, player_id-keyed dict `_finish()` already has in hand, before it gets re-keyed to seat for the `game_over` event).

### 4.4 Game history: reading it back **(call)**

- `GET /me/games` — `@auth.require_guest` → `@ratelimits.limit("read")`. `history.games_for(player_id, limit=20)` joins `room_result_players` (filtered to `player_id`) against `room_results` on `(room_id, game_no)`, newest `finished_at` first. Returns a list of `{room_id, game_no, finished_at, winner, your_role, won, credits_earned}` — a flat, lightweight row per game; the opponent lineup and words are detail-view-only (§4.4 below), not duplicated into the list.
- `GET /me/games/<room_id>/<game_no>` — `@auth.require_guest` → `@ratelimits.limit("read")`. Requires auth (unlike the public `GET /arena/matches/<id>`) specifically so the response can mark which seat belongs to the viewer (`is_you: true`) without ever including another human's raw `player_id` in the payload. Returns `{finished_at, winner, lang, words, roles: [{seat, role, is_bot, name, is_you, credits_earned?, credit_parts?}]}` — credits are included for every human seat, not just the viewer's, since that was already visible to everyone at the table when the game actually ended (the live reveal already shows this to the whole room).
- If a non-participant requests a detail they weren't part of, `history.game_detail` returns `None` and the route raises the same `404 not_found` `arena_match` already raises for an unknown match id.

### 4.5 Frontend **(call)**

- `src/screens/Profile.tsx` gains a "Recent Games" section (new `<section>`) between the existing stats-trio block and `<LookEditor>`, listing up to the most recent games from `GET /me/games`, each row linking to a new route/screen.
- New screen `src/screens/GameDetail.tsx` at route `/games/:roomId/:gameNo`, structurally modeled on `MatchPage.tsx`'s existing reveal section (`.match-reveal`: each seat's role, the word pair, a winner banner) but without the round-by-round statement/vote sections that section has above it (no replay data exists for this feature, per the non-goal in §2) — reusing the credit-breakdown presentation already built for `DailyResult.tsx` if that's factored into a reusable piece, otherwise a small new one in the same visual language.
- `Account` type (`api/types.ts`) gains `preferred_lang: Lang | null`; new `GameSummary`/`GameDetail` types for the two new endpoints.

## 5. Constraints

- No new backend dependency for either feature.
- `_finish()`'s existing `game_over` event payload is byte-for-byte unchanged; `history.record_game` is a pure addition alongside it, not a replacement of any existing code path.
- Both new tables follow the existing idempotent `PRAGMA table_info`/`CREATE TABLE IF NOT EXISTS` migration style in `db.py` — no new migration mechanism.
- zh-Hans and en copy for the new "Recent Games" section and the game-detail screen.
- Rate limits: `PATCH /me` uses `action` (existing guest-scoped tier, same as `register`/`logout`); the two new `GET` routes use `read` (existing tier, same as `GET /me`/`GET /daily/streak`).

## 6. Decisions that were the owner's

- Game history ships as list + detail (full end-of-game reveal), not a list-only digest.
- A game left before it finished does not appear in the leaver's own history (confirmed after a builder check raised it as ambiguous).
- Everything else in this doc — where the language preference is stored, when it syncs, the exact shape of the history tables and routes — was left to this session's judgment per the owner's "your call."

## 7. Left to the builder

- Exact pagination mechanics for `GET /me/games` beyond a flat `limit` (cursor vs offset) if the list ever needs to grow past one page in the UI.
- Whether `DailyResult.tsx`'s credit-breakdown presentation is already factored into a reusable component; if not, whether it's worth extracting one now or duplicating a small piece of markup for `GameDetail.tsx`.
- Visual styling of the "Recent Games" list and the game-detail screen; zh-Hans/en copy polish.
- Tests for each part (migration idempotency, `history.record_game` writing the expected rows, the two new routes' auth/404 behavior, the i18n bootstrap fix).
