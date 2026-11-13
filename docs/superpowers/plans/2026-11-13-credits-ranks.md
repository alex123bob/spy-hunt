# Credits, Ranks & Hero Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each player a lifetime credits ledger earned from play, six ranks derived from it, and a hero card that levels up on the daily share card, the game result screen, and a new profile surface.

**Architecture:** A new backend module `credits.py` mirrors `clans.py` (same `_add`/`_safely`/dedupe/cap shape) but writes its own `player_credits` ledger plus a denormalized `player_total_credits` running total, with no membership gate so guests earn. Award functions return the post-cap/post-dedupe delta, threaded to the client via a new `credits_earned` field on the daily result and a per-player map in the `game_over` event. Rank is a pure function of the lifetime total (no stored rank). The frontend adds a `rank.ts` helper and a presentational `HeroCard` that drives all three surfaces.

**Tech Stack:** Flask + SQLite (backend, repo `PP-AI-Service`, package `ai_svc.spy_hunt`), React 19 + TypeScript + Vite (frontend, repo `spy-hunt`), Vitest + pytest.

**Spec:** `docs/superpowers/specs/2026-11-13-credits-ranks-design.md`

## Global Constraints

- Backend package is `ai_svc.spy_hunt`; run pytest from the `PP-AI-Service` repo with its `venv` active.
- Credits use an **independent 500/day cap** (`CREDITS_DAILY_CAP = 500`); never read or change `clans.DAILY_CAP` (100).
- Base point values match the clan engine: finish game +10, win side +10, finish daily +10, find daily spy +10. Streak bonus is credits-only: `min(5 * streak, 50)`.
- Rank thresholds (credits ≥): Rookie 0, Sleuth 250, Spy Hunter 750, Senior Hunter 2000, Mastermind 5000, Legend 12000. Heroes: 🐣 🦊 🕵️ 🦉 🧠 👑. Rank keys: `rookie`, `sleuth`, `hunter`, `senior`, `mastermind`, `legend`.
- Awards must never break a game or puzzle: wrap in the `_safely` savepoint pattern, which returns 0 on a swallowed error.
- Every new user-facing string localized in both `src/i18n/en.json` and `src/i18n/zh-Hans.json`.
- Guests earn credits — `credits._add` has **no** `membership` gate (unlike `clans._add`).
- Credits follow `player_id`; register keeps the same id, login swaps the device to the account's id. No merge logic.

## Review Focus

- **Daily cap clamp mid-award**: a player already at 490 today earns a +20 daily → only +10 lands, and `credits_earned` must report 10, not 20. (Task 2)
- **Replay / idempotency**: re-finishing or re-emitting the same game or daily must award 0 the second time and report `credits_earned: 0`. (Tasks 2, 5)
- **Streak bonus only on solved**: the "spy got away" daily path awards the base only, never the streak bonus. (Task 5)
- **Missing/failed summary on the client**: `/credits` failing must degrade to Rookie / hidden, never block the result screen or crash the card. (Tasks 7, 9)
- **Denormalized total drift**: `player_total_credits` must equal `SUM(player_credits.credits)` per player after any award, including a clamped one. (Task 2)

---

## Task 1: Schema for the credits ledger and running total

**Repo:** `PP-AI-Service`

**Files:**
- Modify: `ai_svc/spy_hunt/db.py` (add two `CREATE TABLE` + indexes to the schema string)
- Test: `ai_svc/spy_hunt/tests/test_credits.py` (create)

**Interfaces:**
- Produces: tables `player_credits(key PK, player_id, credits, created_day, created_at)` and `player_total_credits(player_id PK, credits DEFAULT 0, updated_at)`, created on `get_conn()`.

- [ ] **Step 1: Write the failing test**

```python
# test_credits.py
from ai_svc.spy_hunt.db import get_conn
from ai_svc.spy_hunt.tests.conftest import *  # temp_db fixture

def test_credit_tables_exist(temp_db):
    cols = {r[1] for r in get_conn().execute("PRAGMA table_info(player_credits)")}
    assert cols == {"key", "player_id", "credits", "created_day", "created_at"}
    tcols = {r[1] for r in get_conn().execute("PRAGMA table_info(player_total_credits)")}
    assert tcols == {"player_id", "credits", "updated_at"}
```

- [ ] **Step 2: Run test to verify it fails** — Run: `python -m pytest ai_svc/spy_hunt/tests/test_credits.py -v` — Expected: FAIL (no such table).
- [ ] **Step 3: Add both tables and indexes** to the schema string in `db.py` (mirror the `clan_points` block; see spec "Where credits are stored"). Indexes: `idx_player_credits_player(player_id)`, `idx_player_credits_day(player_id, created_day)`.
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `fix(spy-hunt): add player_credits and player_total_credits tables`

---

## Task 2: `credits.py` — ledger, cap, dedupe, denormalized total

**Repo:** `PP-AI-Service`

**Files:**
- Create: `ai_svc/spy_hunt/credits.py`
- Test: `ai_svc/spy_hunt/tests/test_credits.py` (extend)

**Interfaces:**
- Consumes: `db.get_conn`; the `_tx`/`_safely`/`_now_ms` patterns from `clans.py`.
- Produces:
  - `CREDITS_DAILY_CAP = 500`
  - `RANKS: list[dict]` — `[{"key","min","hero"}, ...]` in ascending `min` order (shared source of truth for rank-from-total).
  - `_add(conn, key: str, player_id: str, credits: int, now: int) -> int` — inserts one dedup'd, cap-clamped row into `player_credits`, bumps `player_total_credits` by the same amount, returns the amount actually added (0 if duplicate key, capped, or non-positive). **No membership gate.**
  - `total(conn, player_id: str) -> int` — reads `player_total_credits.credits` (0 if absent).
  - `rank_for(total: int) -> dict` — `{"index","key","min"}` for the highest threshold ≤ total.
  - `summary(player_id: str) -> dict` — `{"credits", "today", "rank": {...}, "next": {"key","min","remaining"} | None}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_add_awards_and_updates_total(temp_db):
    with get_conn() as c:
        assert credits._add(c, "k1", "g1", 20, 1000) == 20
    assert credits.total(get_conn(), "g1") == 20

def test_add_is_idempotent_by_key(temp_db):
    with get_conn() as c:
        credits._add(c, "k1", "g1", 20, 1000)
        assert credits._add(c, "k1", "g1", 20, 2000) == 0   # same key, no double
    assert credits.total(get_conn(), "g1") == 20

def test_daily_cap_clamps_and_total_matches_ledger(temp_db):
    with get_conn() as c:
        credits._add(c, "a", "g1", 490, 1000)
        assert credits._add(c, "b", "g1", 20, 1000) == 10    # only 10 of 20 fits under 500
    led = get_conn().execute("SELECT COALESCE(SUM(credits),0) FROM player_credits WHERE player_id='g1'").fetchone()[0]
    assert led == 500 and credits.total(get_conn(), "g1") == 500

def test_guest_earns_without_clan(temp_db):
    with get_conn() as c:
        assert credits._add(c, "k", "guest-no-clan", 10, 1000) == 10

def test_rank_for_thresholds(temp_db):
    assert credits.rank_for(0)["key"] == "rookie"
    assert credits.rank_for(249)["key"] == "rookie"
    assert credits.rank_for(750)["key"] == "hunter"
    assert credits.rank_for(12000)["key"] == "legend"

def test_summary_shape(temp_db):
    with get_conn() as c:
        credits._add(c, "k", "g1", 300, 1000)
    s = credits.summary("g1")
    assert s["credits"] == 300 and s["rank"]["key"] == "sleuth"
    assert s["next"]["key"] == "hunter" and s["next"]["remaining"] == 450
```

- [ ] **Step 2: Run to verify they fail** — Expected: ImportError / no module.
- [ ] **Step 3: Implement `credits.py`.** Mirror `clans._add` (dedupe by `key`, `used = SUM(credits) WHERE player_id AND created_day`, clamp `credits = min(credits, CAP - used)`, insert, then `INSERT INTO player_total_credits … ON CONFLICT(player_id) DO UPDATE SET credits = credits + excluded.credits, updated_at = …`). `created_day` via the same UTC-day helper `clans` uses. `rank_for` scans `RANKS` descending; `summary` reads `total`, today's sum, `rank_for`, and computes `next`.
- [ ] **Step 4: Run to verify all pass.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): credits ledger with 500/day cap, dedupe, rank-from-total`

---

## Task 3: `credits.award_game` / `award_daily` returning the real delta

**Repo:** `PP-AI-Service`

**Files:**
- Modify: `ai_svc/spy_hunt/credits.py`
- Test: `ai_svc/spy_hunt/tests/test_credits.py` (extend)

**Interfaces:**
- Consumes: `_add`; row shape from `game.py` `_players` (`player_id`, `is_bot`, `role`); `clans.MIN_HUMANS`-equivalent (inline `MIN_HUMANS = 2`).
- Produces:
  - `_safely(fn, *args) -> int` — like `clans._safely` but returns the wrapped call's int result, 0 on a swallowed exception.
  - `award_game(conn, room_id: str, game_no: int, rows, winner: str | None) -> dict[str, int]` — `{player_id: delta}` for each human; only side winners get the +10 win. Returns `{}` when <2 humans or no winner.
  - `award_daily(conn, player_id: str, day: str, solved: bool, streak: int) -> int` — base `DAILY_DONE + (DAILY_SOLVED if solved else 0)` keyed `d:<day>:<player>`, **plus** `min(5*streak, 50)` keyed `ds:<day>:<player>` only when `solved`. Returns the summed delta actually awarded.

- [ ] **Step 1: Write the failing tests**

```python
def test_award_game_returns_per_player_delta(temp_db):
    rows = [{"player_id": "a", "is_bot": 0, "role": "spy"},
            {"player_id": "b", "is_bot": 0, "role": "civilian"},
            {"player_id": "z", "is_bot": 1, "role": "civilian"}]
    with get_conn() as c:
        d = credits.award_game(c, "r1", 1, rows, "spies")
    assert d == {"a": 20, "b": 10}   # spy won (+10+10), civ played (+10), bot excluded

def test_award_game_needs_two_humans(temp_db):
    rows = [{"player_id": "a", "is_bot": 0, "role": "spy"}, {"player_id": "z", "is_bot": 1, "role": "civilian"}]
    with get_conn() as c:
        assert credits.award_game(c, "r1", 1, rows, "spies") == {}

def test_award_daily_solved_adds_streak_bonus(temp_db):
    with get_conn() as c:
        assert credits.award_daily(c, "g1", "2026-11-13", True, streak=4) == 10 + 10 + 20  # base+solved+min(20,50)

def test_award_daily_missed_has_no_streak_bonus(temp_db):
    with get_conn() as c:
        assert credits.award_daily(c, "g1", "2026-11-13", False, streak=9) == 10  # base only

def test_award_daily_replay_is_zero(temp_db):
    with get_conn() as c:
        credits.award_daily(c, "g1", "2026-11-13", True, streak=4)
        assert credits.award_daily(c, "g1", "2026-11-13", True, streak=4) == 0
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the three functions (mirror `clans._award_game`/`_award_daily`; sum the `_add` return values; `award_game` keys `g:<room>:<game>:<player>`). Public `award_game`/`award_daily` call through `_safely`.
- [ ] **Step 4: Run to verify all pass.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): credits award hooks return the real post-cap delta`

---

## Task 4: Wire credits into the game-end hook

**Repo:** `PP-AI-Service`

**Files:**
- Modify: `ai_svc/spy_hunt/game.py:260-278` (`_finish`)
- Test: `ai_svc/spy_hunt/tests/test_credits_integration.py` (create)

**Interfaces:**
- Consumes: `credits.award_game` (Task 3).
- Produces: the `game_over` event payload gains `"credits": {player_id: delta}` (additive; existing fields unchanged).

- [ ] **Step 1: Write the failing test** — build a 2-human playing room (reuse `make_room` from `test_clans_points.py`), finish it, and assert the persisted `game_over` event's payload has a `credits` map awarding the humans, and `credits.total` increased.

```python
def test_game_over_event_carries_credits(temp_db):
    # make_room([...2 humans...]); drive to finish via game._finish or a full play
    ev = get_conn().execute("SELECT payload_json FROM events WHERE kind='game_over' ...").fetchone()
    assert json.loads(ev["payload_json"])["credits"]  # non-empty
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — in `_finish`, call `deltas = credits.award_game(conn, room_id, room["game_no"], rows, winner)` right after `clans.award_game(...)`, and add `"credits": deltas` to the `append_event("game_over", {...})` payload. Import `credits` alongside the existing `from ai_svc.spy_hunt import clans`.
- [ ] **Step 4: Run to verify it passes**, plus the existing clan/game suites: `python -m pytest ai_svc/spy_hunt/tests/ -k "game or clan or credit" -q`.
- [ ] **Step 5: Commit** — `feat(spy-hunt): award credits on game end and emit them in game_over`

---

## Task 5: Wire credits into the daily hooks + `result()` payload

**Repo:** `PP-AI-Service`

**Files:**
- Modify: `ai_svc/spy_hunt/puzzles.py` (`guess_spy` missed path ~:196, `guess_word` ~:220, `result` return ~:233)
- Test: `ai_svc/spy_hunt/tests/test_puzzles_play.py` (extend)

**Interfaces:**
- Consumes: `credits.award_daily` (Task 3); `streak_for(player_id, day)` already in `puzzles.py`.
- Produces: `result()` dict gains `"credits_earned": int` (delta from this attempt's award).

- [ ] **Step 1: Write the failing tests**

```python
def test_daily_solved_awards_credits_and_reports_them(temp_db, clock):
    add(); puzzles.get_today("g1", DAY)
    puzzles.guess_spy("g1", 2, DAY)            # found
    puzzles.guess_word("g1", 0, DAY)           # word right
    r = puzzles.result("g1", DAY)
    assert r["credits_earned"] >= 20           # base+solved (+streak bonus)
    assert r["credits_earned"] == credits.total(get_conn(), "g1")

def test_daily_missed_awards_base_only(temp_db, clock):
    add(); puzzles.get_today("g1", DAY)
    puzzles.guess_spy("g1", 0, DAY); puzzles.guess_spy("g1", 1, DAY)   # two wrong → done
    assert puzzles.result("g1", DAY)["credits_earned"] == 10
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — replace both `clans.award_daily(c, player_id, day, ...)` calls so each also calls `credits.award_daily(c, player_id, day, solved, streak=streak_for(player_id, day)["streak"])` and stores the returned delta on the attempt row (new nullable column `credits_earned` on `puzzle_results`, added in `db.py`) so `result()` can read it back; or compute and return it directly within the same transaction. `result()` returns `"credits_earned"`. The missed path passes `solved=False`; the word path passes `solved=bool(att["solved"])`.
- [ ] **Step 4: Run to verify they pass**, plus the full puzzle suite (must stay green): `python -m pytest ai_svc/spy_hunt/tests/test_puzzles_play.py -q`.
- [ ] **Step 5: Commit** — `feat(spy-hunt): award credits for the daily and report the per-attempt delta`

---

## Task 6: `GET /credits` endpoint + rank badge in the room snapshot

**Repo:** `PP-AI-Service`

**Files:**
- Modify: `ai_svc/spy_hunt/routes.py` (add route), `ai_svc/spy_hunt/visibility.py` (`public_player` + a batch `credit_ranks(player_ids)` helper)
- Test: `ai_svc/spy_hunt/tests/test_credits_routes.py` (create)

**Interfaces:**
- Consumes: `credits.summary`, `credits.rank_for`, `credits.total`.
- Produces:
  - route `GET /credits` → `jsonify(credits.summary(g.player_id))`, same auth decorators as `/daily/streak` (routes.py:285-290).
  - `visibility.credit_ranks(player_ids) -> dict[str, int]` — `player_id -> rank index` via one batched read of `player_total_credits`.
  - `public_player(row, host_player_id, clans=None, ranks=None)` gains an optional prefetched `ranks` map and includes `"rank": <index or None>` (None for bots).

- [ ] **Step 1: Write the failing tests** — a registered player with seeded credits: `GET /credits` returns the summary shape; `public_player` with a `ranks` map includes the `rank` index; bots get `rank: None`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.** Add the route mirroring `daily_streak`. Add `credit_ranks` (one `SELECT player_id, credits FROM player_total_credits WHERE player_id IN (...)`, map each through `credits.rank_for(...)["index"]`, default 0). Thread an optional `ranks` param through `public_player` (default `None`; when absent, like `clans`, look it up for the single row) and add `"rank"`. The batched callers that already prefetch `clan_badges(...)` — `game.py:189-190` and `visibility.py:195-197` — also prefetch `credit_ranks(...)` and pass it in; the single-row callers (`game.py:194`, `store.py:201`) need no change.
- [ ] **Step 4: Run to verify they pass**, plus the snapshot/room suite.
- [ ] **Step 5: Commit** — `feat(spy-hunt): /credits endpoint and rank index on room players`

---

## Task 7: Frontend types + `rank.ts` helper

**Repo:** `spy-hunt`

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/game/rank.ts`
- Test: `src/game/rank.test.ts` (create)

**Interfaces:**
- Produces:
  - types: `interface CreditSummary { credits: number; today: number; rank: { index: number; key: string; min: number }; next: { key: string; min: number; remaining: number } | null }`; add `rank?: number | null` to `Player`.
  - `RANKS: { key: string; min: number; hero: string }[]` (same order/values as backend).
  - `rankByIndex(i: number)` and `rankTitleKey(i: number)` → i18n key `rank.<key>`.

- [ ] **Step 1: Write the failing test** — `rankByIndex(0).hero === '🐣'`, `rankByIndex(5).key === 'legend'`, `rankTitleKey(2) === 'rank.hunter'`.
- [ ] **Step 2: Run to verify it fails** — `yarn vitest run src/game/rank.test.ts`.
- [ ] **Step 3: Implement** `rank.ts` with the `RANKS` array and helpers; add the types.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): rank helper and credit summary types`

---

## Task 8: `credits` API client + i18n strings

**Repo:** `spy-hunt`

**Files:**
- Create: `src/credits/api.ts`, `src/credits/api.test.ts`
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json`

**Interfaces:**
- Consumes: `request` from `src/api/client`, `ensureGuest` from `src/state/session` (mirror `src/daily/api.ts`).
- Produces: `getCredits(): Promise<CreditSummary>` → `GET /credits`.

- [ ] **Step 1: Write the failing test** — mock `request`, assert `getCredits()` calls `GET /credits` and returns the payload (mirror `src/daily/api.test.ts`).
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `getCredits`. Add i18n keys in both files: `rank.rookie/sleuth/hunter/senior/mastermind/legend`, `credits.title`, `credits.lifetime`, `credits.today`, `credits.toNext` (`"{n} to {title}"`), `credits.earned` (`"+{n} credits"`), `credits.max` (top rank). Copy for both languages.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): credits API client and rank/credit i18n`

---

## Task 9: `HeroCard` component

**Repo:** `spy-hunt`

**Files:**
- Create: `src/components/HeroCard.tsx`, `src/components/HeroCard.test.tsx`
- Modify: `src/styles/pages.css` (per-rank frame treatments via tokens)

**Interfaces:**
- Consumes: `rank.ts`, `CreditSummary`, `t`, `useReducedMotion`.
- Produces: `HeroCard({ summary }: { summary: CreditSummary | null })` — renders hero, rank title, lifetime credits, and a progress bar to `next` (or a "max rank" state). `null` renders a Rookie placeholder, never throws.

- [ ] **Step 1: Write the failing tests** — given a Senior summary, shows the 🦉 hero and the `rank.senior` title; shows `credits.toNext` with the remaining count; a `null` summary renders Rookie and does not throw; top-rank summary (`next: null`) shows `credits.max`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the component and CSS. Frame treatment keyed by `rank.index` (class `hero-rank-<index>`): plain → dotted → gold → double+shadow → holo → foil, all from existing color tokens; shine/confetti gated on `!useReducedMotion()`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): HeroCard that renders the player's rank tier`

---

## Task 10: Hero on the daily share card

**Repo:** `spy-hunt`

**Files:**
- Modify: `src/daily/share.ts` (model + canvas), `src/screens/DailyResult.tsx`
- Test: `src/daily/share.test.ts` (extend)

**Interfaces:**
- Consumes: `getCredits` (Task 8), `rank.ts`, existing `ShareInput`/`shareCardModel`/`drawShareCard`.
- Produces: `ShareInput` gains optional `rankIndex?: number`; `shareCardModel` adds `hero` and `rankTitle` from it (defaults to Rookie when absent).

- [ ] **Step 1: Write the failing test** — `shareCardModel({...base, rankIndex: 3}).hero === '🦉'` and its `rankTitle` is the localized Senior title; omitting `rankIndex` yields the Rookie hero.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — extend the model and draw the hero + rank title band on the canvas (place above the verdict pill). In `DailyResult.tsx`, fetch `getCredits()` on mount (tolerate failure → undefined `rankIndex`), pass `rankIndex` into the `ShareInput`, and render `<HeroCard summary={...}/>` plus `credits.earned` using `result.credits_earned` (add to the `DailyResult` type).
- [ ] **Step 4: Run to verify it passes**, plus the full daily/share suites.
- [ ] **Step 5: Commit** — `feat(spy-hunt): hero tier on the daily share card and result`

---

## Task 11: Credits on the game result screen + rank badge in rooms

**Repo:** `spy-hunt`

**Files:**
- Modify: `src/screens/Result.tsx`, `src/components/ClanTag.tsx` (or a new `RankBadge.tsx`)
- Test: `src/screens/Result.test.tsx` (extend)

**Interfaces:**
- Consumes: `game_over` event `credits` map (via the snapshot/event), `Player.rank`, `HeroCard`, `getCredits`.
- Produces: a `RankBadge({ rank }: { rank?: number | null })` next to each player's name.

- [ ] **Step 1: Write the failing tests** — Result shows `credits.earned` for the viewer's own delta when present; each player row with a `rank` renders the rank badge; a player with no rank renders none.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — read the viewer's own credit delta from the snapshot's `game_over` data (wire the field through `Snapshot`/event types as needed), show `credits.earned` and `<HeroCard>` (fetched via `getCredits` on mount). Add `RankBadge` beside `<ClanTag>` in the everyone list using `p.rank`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(spy-hunt): show credits earned and rank badges on the result screen`

---

## Task 12: Profile surface with the full ladder

**Repo:** `spy-hunt`

**Files:**
- Create: `src/screens/Profile.tsx`, `src/screens/Profile.test.tsx`
- Modify: `src/routes.tsx` (add `/me`), `src/components/AccountMenu.tsx` (link), `src/styles/pages.css`

**Interfaces:**
- Consumes: `getCredits`, `HeroCard`, `rank.ts`, `t`.
- Produces: route `/me` rendering the `HeroCard`, lifetime + today's credits, and the six-rank ladder with the current rank highlighted.

- [ ] **Step 1: Write the failing tests** — `/me` renders the HeroCard and all six rank titles with the current one marked; a failed `getCredits` shows a graceful empty/Rookie state, not an error that blocks the page.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the screen, route, and account-menu link; reuse the ladder styling from the mockup within the app tokens.
- [ ] **Step 4: Run to verify they pass**, then the whole frontend suite `yarn test` and `yarn build`.
- [ ] **Step 5: Commit** — `feat(spy-hunt): player profile screen with the rank ladder`

---

## Task 13: Docs + optional backfill script

**Repo:** both

**Files:**
- Modify: `README.md` (Accounts/Clans section — credits & ranks)
- Create (optional, builder's call): `backend/ai_svc/spy_hunt/scripts/backfill_credits.py`

- [ ] **Step 1:** Update `README.md` with a short Credits & Ranks paragraph (earning, 500/day cap, six ranks, where the hero card shows).
- [ ] **Step 2:** (Optional) If backfilling, write a keyed one-shot script that seeds `player_total_credits` from historical `clan_points` without double-counting; otherwise note "everyone earns forward from zero" in the README.
- [ ] **Step 3:** Run both full suites (`yarn test`, `python -m pytest ai_svc/spy_hunt/tests/ -q`) and `yarn build`.
- [ ] **Step 4: Commit** — `docs(spy-hunt): document credits and ranks`
