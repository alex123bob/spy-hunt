# Spy Hunter credits, ranks & hero cards — design

Status: ready to plan (builder-check done)
Date: 2026-11-13

## Calls I made after the builder-check (please sanity-check these three)

1. **Showing the real credits earned per game**: the award functions return the
   amount *actually* awarded (after the daily cap and dedupe), threaded to the
   client via a `credits_earned` field on the daily result and a per-player map in
   the `game_over` event. So "+20 credits" is never overstated when the cap clamps
   it. (One additive field on the game event; no existing field changes.)
2. **Streak bonus**: awarded only when you finish *and* find the spy, as a
   credits-only extra of `min(5 * streak, 50)`; the "spy got away" path gives the
   base only. `credits.award_daily` takes the streak explicitly rather than
   recomputing it.
3. **Rank badge on the hot room path**: lifetime total is denormalized into a small
   running-total table so the per-player badge (up to 30 players per poll) is a cheap
   join, not a `SUM … GROUP BY` on every poll. Rank is still *derived* from that
   total, so thresholds stay tunable with no migration.

Everything else from the review was already builder's-call or a direct mirror of the
clan engine.

## Intent and the why

Players have no personal, lasting reason to come back. Streaks live only in the
browser and clan points only matter inside a clan. We want a motivation loop that
belongs to *the player* and follows their account everywhere: play → earn credits
→ climb ranks → unlock a fancier profile/hero card they show off in rooms, on the
result screen, and when they share the daily.

The user's framing: "a senior spy hunter will have a high level fancier card with
different heroes." This design makes that literal — six ranks, each with its own
hero mascot and a progressively richer card frame.

## Goals

- A **single lifetime credits ledger per player**, earned from the same actions
  the game already recognises (real games, daily puzzle, streaks), working with or
  without a clan.
- **Six ranks** derived purely from lifetime credits, with a title, a hero mascot,
  and a card frame treatment per rank.
- The **hero card renders by rank** in three places: the daily share card (already
  rebuilt), the end-of-game result screen, and a new small profile surface.
- Guests earn too; registering only protects the credits across devices (ties into
  the existing nudge banners).

## Non-goals

- No new game modes, no spending credits on anything (credits are status, not
  currency — no store, no cosmetics purchase in this version).
- No leaderboards of players against each other beyond the existing `/top` bots
  board. (A global player board is a possible follow-up, explicitly out of scope.)
- No change to how clan seasons are scored or paired.

## Anti-goals (what would make this a failure)

- **Unbalancing clan competition.** The clan weekly season relies on its own
  `DAILY_CAP = 100`. Credits must **not** reuse or alter that cap. Credits get their
  own independent ledger and their own cap.
- **Pay-to-win / grind-gating play.** Nothing about credits or rank may block,
  slow, or alter a game. Awards are a side effect, wrapped so they can never break
  a game or puzzle (mirror the existing `_safely` savepoint pattern).
- **A second source of truth.** Credits must be derived from / written by the same
  award call sites that already exist, not a parallel system that can drift.

## Constraints

- Backend: Flask + SQLite (`ai_svc/spy_hunt`). Frontend: React 19 + TS + Vite,
  mobile-first, cartoon style (Fredoka/Nunito, `--sun/--sky/--pink/--mint/--lilac`,
  chunky `--ink` borders). i18n via `t()` with `en` + `zh-Hans`; every new string
  localized in both.
- Credits are per `player_id` (guests included), same identity model as streaks and
  clans.
- Award hooks already exist and are the only places credits may be granted:
  - `clans.award_game(conn, room_id, game_no, rows, winner)` — called from
    `game.py:270` when a game ends.
  - `clans.award_daily(conn, player_id, day, solved)` — called from
    `puzzles.py:196` (missed) and `puzzles.py:220` (finished).

## Credits — the earning model

Same point values the clan engine already uses, so the two stay in lockstep
conceptually, but written to a **separate ledger with a separate cap**:

| Action | Credits |
|---|---|
| Finish a real game (2+ humans) | +10 |
| Win your side | +10 |
| Finish the daily puzzle | +10 |
| Find the daily spy | +10 |
| Streak upkeep (per day a streak is extended) | +5, scaled by streak length (see below) |

- **Daily cap: 500 credits/day** (user's decision, up from the 100 clan cap). This
  is a *credits-only* cap and does not touch `clans.DAILY_CAP`.
- **Streak bonus**: when a daily is finished and the streak increases, award
  `min(5 * streak, 50)` credits (gentle ramp, capped). This is the one credit source
  the clan system does not have; it rewards the returning-player loop directly.
- Awards are idempotent per source key (reuse the existing `key`-based dedupe idea
  from `clan_points`: `g:<room>:<game>:<player>`, `d:<day>:<player>`, plus a new
  `ds:<day>:<player>` for the streak bonus).

### Where credits are stored

New table, independent of `clan_points`:

```
CREATE TABLE IF NOT EXISTS player_credits(
  key TEXT PRIMARY KEY,         -- idempotency: one row per award event
  player_id TEXT,
  credits INTEGER,
  created_day TEXT,             -- UTC day, for the 500/day cap
  created_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_player_credits_player ON player_credits(player_id);
CREATE INDEX IF NOT EXISTS idx_player_credits_day ON player_credits(player_id, created_day);
```

Today's earned = `SUM(credits) WHERE player_id = ? AND created_day = ?` (for cap
enforcement and for showing "X earned today").

**Lifetime total is denormalized** into a running column rather than summed on every
read (resolves builder-check Q3 — the rank badge needs each player's lifetime total
on the hot room-snapshot path, up to 30 players per poll; a `SUM … GROUP BY` there
is the wrong cost profile):

```
CREATE TABLE IF NOT EXISTS player_total_credits(
  player_id TEXT PRIMARY KEY, credits INTEGER DEFAULT 0, updated_at INTEGER);
```

`_add` bumps `player_total_credits.credits` by the same (post-cap, post-dedupe)
amount it inserts into `player_credits`, in the same transaction. Rank is still
**derived** from this total on read (no stored rank), so thresholds stay tunable;
only the raw total is materialized. The room snapshot joins this one-row-per-player
table (batched, mirroring `clan_badges()`), never an aggregate.

A new module `credits.py` mirrors `clans.py`'s shape:
`_add(conn, key, player_id, credits, now) -> int` (returns the amount actually
awarded after cap/dedupe) with the 500/day cap and dedupe, `award_game` /
`award_daily` entry points wrapped in the same `_safely` savepoint helper, and a
`summary(player_id)` read. Unlike `clans._add`, there is **no `membership` gate** —
guests earn credits.

### Wiring into existing hooks

`credits.award_game` and `credits.award_daily` are called right next to the existing
`clans.*` calls at the three sites above (same `conn`, same transaction), so credits
and clan points are written together and can never diverge.

**The award functions return the amount actually awarded** (resolves builder-check
Q1 — the result screen must show the *real* delta, which the nominal +10/+20 can
overstate when the daily cap or dedupe clamps it). The `_safely` wrapper is extended
to return that int (0 on a swallowed error), and the delta is threaded to the client:

- **Daily**: `puzzles.guess_spy` (missed path) and `puzzles.guess_word` capture the
  returned credit delta and include it in the `result()` payload as
  `credits_earned`, which `DailyResult.tsx` already fetches.
- **Real game**: `credits.award_game` returns a `{player_id: delta}` map; `game.py`
  includes it in the `game_over` event payload. `Result.tsx` reads its own
  `player_id`'s delta from the snapshot/event. This is the one place the event
  contract grows — a single additive field, no change to existing fields.

### Streak bonus (resolves builder-check Q2)

`credits.award_daily` takes an explicit `streak` argument — it does **not** reuse
the clan signature, and does not call `streak_for()` mid-transaction. The caller
(`puzzles.guess_word`, which already has the finished `result`/streak in hand)
passes it. The bonus `min(5 * streak, 50)`, keyed `ds:<day>:<player>`, is awarded
**only on the finished-and-solved path** (`guess_word` with `solved == True`). The
missed path (`guess_spy` at tries exhausted) awards the +10 base only, never a
streak bonus. This keeps the +10/+10 base identical to the clan values and adds the
streak bonus as a credits-only extra.

## Ranks — derived, not stored

Rank is a pure function of lifetime credits. No stored rank column; compute on read
so thresholds can be tuned without migration.

| # | Title (key) | Credits ≥ | Hero | Frame treatment |
|---|---|---|---|---|
| 0 | Rookie | 0 | 🐣 | plain paper card, simple ink border |
| 1 | Sleuth | 250 | 🦊 | dotted frame, small rank badge by name |
| 2 | Spy Hunter | 750 | 🕵️ | gold (`--sun`) frame, tape-corner flourish |
| 3 | Senior Hunter | 2,000 | 🦉 | double frame + drop shadow, subtle shine |
| 4 | Mastermind | 5,000 | 🧠 | lilac holo frame, confetti burst on reveal |
| 5 | Legend | 12,000 | 👑 | foil frame, hall-of-fame treatment |

Thresholds live in one constant array (`RANKS`) shared in spirit between backend
(authoritative, returned in the summary) and frontend (for the next-rank progress
bar). Backend is source of truth for the player's current rank; frontend renders
the ladder and "X credits to <next title>".

Hero mascots are a **fixed set** (user's decision) — one signature hero per rank,
no per-player choice in this version.

## API

New endpoint `GET /credits` (auth required, guests ok):

```json
{
  "credits": 3120,          // lifetime
  "today": 40,              // earned today (for the cap hint)
  "rank": { "index": 3, "key": "senior", "min": 2000 },
  "next": { "key": "mastermind", "min": 5000, "remaining": 1880 }  // null at top rank
}
```

Rank keys feed i18n: `rank.rookie`, `rank.sleuth`, `rank.hunter`, `rank.senior`,
`rank.mastermind`, `rank.legend` (+ `zh-Hans`).

The per-event delta (`credits_earned` on the daily result, the per-player map in the
`game_over` event) is separate from this summary — see "Wiring into existing hooks".

Optionally also fold a compact `{credits, rank}` into the existing `GET /me` so the
TopBar can show the rank badge without a second request — **builder's call**;
`/credits` is the authoritative one.

## Frontend

1. **`HeroCard` component** — given `{rankIndex, hero, title, credits, next}`,
   renders the tiered card (frame treatment by rank, hero mascot, title, and a
   progress bar to the next rank). Pure presentational; drives all three surfaces.
2. **Daily share card** — the canvas renderer (`src/daily/share.ts`, already built)
   gains the hero + rank title/frame, so a higher-ranked player's shared card looks
   fancier. The share model gains `rankIndex`/`hero`/`title` from the `/credits`
   summary fetched on the result screen.
3. **Result screen** (`Result.tsx`) — show credits earned this game ("+20 credits")
   and the player's `HeroCard`.
4. **Profile surface** — a small `/me`-style card (reachable from the TopBar account
   menu) showing the `HeroCard`, lifetime credits, today's earned, and the full rank
   ladder with the current rank highlighted. Rank badge also appears by the player's
   name in rooms/result (next to the existing clan badge).

All frame treatments in CSS tokens; confetti reuses the existing `Confetti`
component. Reduced-motion respected (no shine/confetti when the user prefers it).

## Rollout / migration

- `player_credits` (event ledger) and `player_total_credits` (denormalized running
  total) are additive; `CREATE TABLE IF NOT EXISTS` in `db.py`.
- **Backfill**: optionally seed `player_total_credits` from existing `clan_points`
  on first deploy so current clan players don't start at zero — **builder's call**;
  acceptable to start everyone at 0 and earn forward. If backfilled, do it once via
  a script keyed so it can't double-count (and seed the running total directly).
- No frontend route is gated; everything degrades gracefully if `/credits` fails
  (card falls back to Rookie / hidden, never an error that blocks play).

## Testing

- Backend: credits awarded on game end and daily finish; 500/day cap enforced
  independently of the 100 clan cap (a test that earns >100 in a day gets credits
  but the clan score still caps at 100); idempotency per key; streak bonus scaling
  and that it fires only on solved; `award_*` return the real post-cap/post-dedupe
  delta (overstated nominal is clamped, replay returns 0); denormalized total stays
  in sync with the ledger; `_safely` swallows errors without breaking the game and
  returns 0. Rank thresholds → titles.
- Frontend: `HeroCard` renders the right hero/frame/title per rank and the
  next-rank progress; share card includes the hero; i18n for all rank titles.

## Left to the builder

- Whether to fold `{credits, rank}` into `GET /me` or keep a single `/credits`.
- Whether to backfill lifetime credits from `clan_points` on first deploy.
- Exact CSS for the per-rank frame flourishes (shine, holo, foil) within the
  cartoon style — match the Dribbble references' playful, chunky feel.
- Final copy for rank titles in both languages.
