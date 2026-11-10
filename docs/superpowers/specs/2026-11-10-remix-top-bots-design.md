# Phase 2, third slice: Outfit remixing and the "top bots" board: design

Status: draft for owner approval. Date: 2026-11-10. The owner delegated the design ("you name it") and approved approach A in the conversation; every other choice is a **(call)**, so change any you disagree with. Builds on `2026-11-10-bot-dressup-design.md` (bot card) and `2026-11-10-rule-cards-design.md` (merged). Product background: `docs/brainstorm/2026-11-06-brainstorm-record.md` section 4: "A bot that wins a lot is an earned flex and is not capped. A 'top bots' board shows winning outfits, and others can copy and tweak them... with credit for popular outfits."

## 1. Intent

Bots so far are private creations with a link. This slice makes the best ones **discoverable and copyable**: a board of the bots that really win, and a "Remix" button that lets anyone start from a winning outfit and tweak it, with credit flowing back to the original. It gives players a reason to tune bots (to climb), to look at other people's (to learn), and to share.

## 2. Goals, non-goals, anti-goals

Goals
- A public **Top bots** screen with two tabs, **Top winners** and **Best spies** (fooled the table), 10 bots each.
- A **ranked record** per bot, separate from the existing plain record, that only counts games with enough different human players.
- **Remix**: from any bot's public page, create a bot of your own that starts with that bot's outfit and rules, then tweak it. The card shows "Remixed from X"; the original shows "remixed N times".
- The owner can hide a bot from the board.

Non-goals (this slice)
- Extra lists (most remixed, rising this week, per-slot popularity), search, follows, comments, likes.
- Accounts, owner names or profiles, a moderation screen, anti-cheat beyond the ranked rule (a determined player with several guest browsers can still farm; accepted until accounts).
- Copying a bot's name, record or avatar as a "clone". Remix copies the outfit only.
- Balancing individual options. If one option dominates the board later, balance that option, never cap players (brainstorm record).

Anti-goals (a failure even if it technically works)
- Anything on the board, the bot page or the remix credit that reveals or hints at the owner.
- A bot ranking on a record earned by a different outfit, or on games it could pad alone or with its own owner and one friend.
- Remix copying more than the outfit, or letting anyone change another player's bot.
- The board making new bots hopeless to discover: ranking uses win rate, so a bot with few games is not buried by one with many.

## 3. Approaches considered

- **A. Remix first, small ranked board (chosen by the owner).** One board, two tabs, a ranked record, a Remix button and credit.
- B. Fuller board with most-remixed, rising and per-slot lists. More fun but needs far more UI and enough played games to fill it; a later pass.
- C. Remix only, no board. Smallest, but good bots stay hidden behind shared links, which drops the "winning outfits get seen" idea.

## 4. Design

### 4.1 Ranked record **(call)**

- New columns on `custom_bots`: `ranked_games`, `ranked_wins`, `ranked_spy_games`, `ranked_spy_wins` (integers, default 0).
- At game end, `custombots.record_game` already updates the plain record for every custom bot. It now also updates the ranked columns by the same rules **when the game qualifies**: the room has at least **3 distinct human players** (`is_bot = 0` rows) at the moment the game ends. A human who left mid-game and became a bot seat does not count.
- **Editing a bot's outfit or rules resets its ranked columns to 0** (name or avatar edits do not). The reset fires only when the submitted outfit **differs from the stored one** (the three slots, or the rules list compared in order, since list order is rule priority). The form sends the whole draft on every save, so a name-only save must not reset anything. The plain record keeps its current behaviour. Existing bots start with 0 ranked games, since the past cannot be recomputed.
- **Games in progress across an edit.** A room holds its own copy of the outfit (`players.outfit_json`). At game end, a bot's ranked columns are updated only if that room copy equals the bot's current stored outfit (slots and rules); otherwise the game still counts in the plain record but not the ranked one. This keeps a ranked record tied to the outfit that earned it.
- **"Human" means a player row with `is_bot = 0` at game end**, connected or not (a human who closed the tab as the game ended still played it). The bot's own owner counts as one of the three. Absent humans can still pad a room; accepted with the other farming limits.
- Migration: the existing idempotent `ALTER TABLE ... ADD COLUMN` pattern in `db.py`.

### 4.2 The board **(call)**

- `GET /bots/top?kind=winners|spies` returns up to 10 bots, public, no token, `flood` limiter only.
- Eligibility: not hidden by the owner (`listed`), not blocked by the operator (`blocked`), and at least **10 ranked games** (winners) or **5 ranked spy games** (spies).
- Order: winners by `ranked_wins / ranked_games` descending, then more ranked games, then older bot; spies by `ranked_spy_wins / ranked_spy_games`, same tie-breaks. No smoothing beyond the minimum games.
- A row has: `rank`, `id`, `name`, `avatar`, the rate as a percent, the games it is based on, and `remixes`. Never an owner.
- `kind` anything else gives `400 bad_request`.
- Screen `/top`, linked from a "Top bots" card on the Landing page and from the bot page. Tabs, rows open `/bot/:id`.

```
 Top bots     [Winners] [Best spies]
 Ranked games need 3+ people in the room.
 1 🦊 Mochi    68% · 24 ranked games · remixed 5×
 2 🐙 Inky     61% · 31 ranked games · remixed 2×
```

Empty state: "No ranked bots yet. Play a room with 3 or more people to get on the board." (en and zh-Hans).

### 4.3 Hiding and blocking **(call)**

- `listed` (integer, default 1): the owner's switch. `PATCH /bots/<id>` accepts `listed: boolean`; the bot form shows "Show on the top bots board" (a checkbox, default on). Hidden bots keep their public page and can still be remixed.
- `blocked` (integer, default 0): operator-only, set by a small script (`scripts/block_bot.py <id>`, `--unblock`), for bad names. A blocked bot is left off the board and cannot be used as a remix source; its page stays reachable by link. There is no UI for it.

### 4.4 Remix and credit **(call)**

- Table `remixes(source_id, owner_player_id, PRIMARY KEY(source_id, owner_player_id))`. Rows are never deleted when the remixing bot is deleted, so the count cannot be gamed by create and delete cycles; one guest counts once per source.
- `POST /bots` accepts an optional `remix_of` (a bot id). The body is otherwise unchanged: the client sends the name, avatar and outfit (the tweaked copy). The server checks `remix_of` exists and is not blocked (`404 not_found` otherwise), stores `remix_of` on the new bot, and inserts the `remixes` row. Remixing your own bot is allowed, stores no credit and adds no row.
- The public card gains `remix_of: {id, name} | null` (null if the source was deleted **or is blocked**, so a blocked name never shows on descendants, or this is not a remix), `remixable: boolean` (false when the bot is blocked; the Remix button is hidden then), `remixes: number` (distinct owners who remixed it, owner's own excluded), `ranked: {games, wins, spy_games, spy_wins}` and `listed: boolean`.
- Frontend: a **Remix** button on `/bot/:id` for anyone who does not own the bot. It goes to `/bots?remix=<id>`, which loads the source card and opens the form with its outfit and rules filled in; name starts blank and avatar starts as the source's, both editable. Save posts with `remix_of`. At 3 bots the button shows the existing "You can have up to 3 bots." hint instead. Without a guest session the existing guest creation applies as it does for creating any bot.
- The card shows "Remixed from Mochi" (a link) and "Remixed N times" (only when N > 0), in both the bot page and the "My bots" list. If the source is later deleted the credit line disappears (the id stays stored, the card returns null).

### 4.5 API summary

All under `/api/spy-hunt`:
- `GET /bots/top?kind=winners|spies` (public).
- `POST /bots` gains `remix_of`; `PATCH /bots/<id>` gains `listed`.
- Every bot card (`GET /bots`, `GET /bots/<id>`, create and patch responses) gains `remix_of`, `remixes`, `remixable`, `ranked`, `listed`.
- No change to rooms, games or the bot engine.

## 5. Constraints

- Information firewall and per-room model-call budget unchanged; nothing here touches prompts.
- The remix copy is the outfit and rules only; the server revalidates it with the existing `check_outfit` like any create.
- Existing bots, rooms and all existing tests keep working; old rows have null or 0 in the new columns and must read as 0, true and null.
- zh-Hans and en copy for every new label.
- Rate limits: board and page use the `flood` limiter; create and patch keep `action`.

## 6. Decisions that were the owner's

- Approach A: remix first with a small ranked board (two tabs of 10).
- Credit for remixed bots, no owner shown anywhere.
- The rest was delegated and is marked **(call)** above.

## 7. Left to the builder

Exact copy in both languages, row and tab styling, the minimum-game thresholds' constant names, the script's argument handling, index choices for the board query, the remix form's layout, and tests for each part. The thresholds (10 ranked games, 5 ranked spy games, 3 humans, 10 rows) are starting values and live as named constants so they can be tuned once real games exist.
