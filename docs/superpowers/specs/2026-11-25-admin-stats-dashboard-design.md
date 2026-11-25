# Admin panel: database stats dashboard

Status: draft for owner approval. Tags: **(owner)** decided by the owner, **(call)** my decision, change it if you disagree.

## 1. Goal

The admin panel (`src/screens/Admin.tsx`, token-gated per `2026-11-12-admin-refill-design.md`) currently has one card: the daily puzzle queue. The owner wants a second view in the same panel that gives a visual read on the health of the database as a whole — "used to monitor data" **(owner)** — so a quick glance answers "is the game getting played, are puzzles being solved, are new players showing up, is anything stalled," without running SQL by hand.

This is explicitly an **overview/monitoring surface**, not a database browser or reporting tool.

## 2. Non-goals / anti-goals

- A generic table browser or raw-row inspector. This is curated stats, not `SELECT * FROM <table>` **(owner: picked "monitoring dashboard" over "schema/ERD view" or "generic table browser" — see §4)**.
- Any write/mutate action. Read-only, unlike the existing refill card.
- Per-player or per-room drill-down (clicking into a specific player's history). Aggregate counts and trends only.
- A new charting dependency. The project has zero charting libraries today; this stays hand-rolled inline SVG **(call, from earlier conversation — revisit if the owner wants richer interaction like tooltips/zoom later)**.
- Real-time/auto-refresh polling. Unlike the refill card (which polls because an action is in flight), stats are a point-in-time snapshot fetched on load plus a manual refresh button **(call)** — there's no "in progress" state to watch.
- Changing admin auth, adding roles, or exposing this to non-admins. Same shared `X-Admin-Token` gate as the rest of the panel.

It would be a failure if this became a second maintenance burden that drifts from the schema every time a table changes — so the design keeps every metric as a small, independent, named SQL aggregate rather than anything generic/reflective over the schema.

## 3. Current state (for the builder)

- Frontend: `src/screens/Admin.tsx` renders one `.screen` > `.card`-ish section today (the puzzle-queue card uses `admin-card`/`admin-prompt` classes, which are **not actually defined in CSS** — they fall through to base `.card`/`.screen`/`.btn` primitives in `src/styles/primitives.css` and tokens in `src/styles/tokens.css`). There is one route, `/admin` (`src/routes.tsx`), not linked from any nav.
- Backend: Flask blueprint `spy_hunt_bp` in `backend/ai_svc/spy_hunt/routes.py`; admin routes live at the bottom (`routes.py:351-368`), both gated by `@admin.require_admin` (shared-secret header, `backend/ai_svc/spy_hunt/admin.py`). Business logic for `/admin/status` lives in `admin.admin_status()`.
- DB: raw sqlite3, no ORM, schema in `backend/ai_svc/spy_hunt/db.py`. Existing aggregate-helper pattern to mirror: `puzzles.py:76-82` (`ready_count()`/`total_count()`, one-line `get_conn().execute(...).fetchone()["c"]`). `puzzles.utc_day()` (`puzzles.py:31`) is the existing "what day is it" helper and should be reused rather than reimplemented.
- Timestamp conventions in the DB (confirmed by sampling the dev DB): `created_at`/`finished_at`/etc. columns are epoch-**milliseconds** ints everywhere (`rooms`, `guests`, `custom_bots`, `arena_matches`, `room_results`...). `puzzles`, `puzzle_results`, `player_credits`, `clan_points`, `arena_matches` additionally have an explicit `day`/`created_day` **text** column already in `YYYY-MM-DD` form — prefer those text columns over re-deriving the day from an epoch-ms column when both exist, since it's one less thing to get wrong (timezone, bucketing) and matches how `puzzle_results` already works.
- `rooms.status` is one of exactly `'lobby' | 'playing' | 'finished'` (no "abandoned"/"cancelled" state exists today) **(not a design decision, just a fact the builder needs)**.
- `rooms` has no `finished_at`. "A game finished" is better read from `room_results` (one row per `room_id, game_no` with its own `finished_at`), since a single room can play multiple games (`game_no` increments) — `rooms.created_at` only tells you when the room/session started, not how many games were played in it. **(call)** — this is why "rooms created" and "games finished" are tracked as two separate series below rather than one.

## 4. Approaches considered

Laid out and discussed earlier in this conversation:

- **A — Single overview page, stat tiles + sparklines per domain.** One new read endpoint, one new section in `Admin.tsx`, a handful of named aggregate queries. Lowest build cost, matches the panel's existing minimalism, fits the current small data volume (tens-hundreds of rows/table).
- **B — Per-domain tabs/drill-downs**, each with its own route, endpoint, charts, and a recent-rows table. More thorough and scales further, but notably more surface to build and to keep in sync with schema changes.
- **C — Generic table browser** (pick a table, see row count + recent rows + column stats). Fast to build and flexible, but closer to a DB inspector than a "visual aid" — more raw data, less at-a-glance signal.

**Owner picked A.** B's depth can be layered on later as additional tabs without redoing A's foundation; C was explicitly ruled out as the wrong shape for "monitor the data."

## 5. What the dashboard shows

One new endpoint, one JSON payload, six cards. Every number below is either a **snapshot** (today/right now) or a **trend** (a 14-day daily series, rendered as a sparkline) **(call: 14 days — long enough to see a weekly pattern, short enough that the response stays tiny at current/foreseeable row counts)**.

1. **Rooms** — `active_lobby`, `active_playing` (current counts by status), `rooms_created_today`, `games_finished_today`; trend: rooms created per day + games finished per day (two lines or two sparklines, builder's call which reads clearer).
2. **Puzzles** — `ready_count`/`total_count` (reuse `puzzles.ready_count()`/`total_count()` directly, same numbers as the existing refill card), `attempts_today`, `solved_today`; trend: attempts per day + solved per day. **(call, resolved during builder check)** A `puzzle_results` row is created the instant a player opens today's puzzle (`tries=0, solved=0`), before any guess — so a plain row-count would measure "opened the puzzle," not "played it." `attempts_today`/the trend's `attempts` count rows with `tries >= 1` (at least one real guess made). Likewise `solved=1` fires as soon as the spy is identified, even if the player never finishes the word-guess stage — `solved_today`/`solved` counts rows with `solved=1 AND stage='done'` (fully completed), since "are puzzles being solved" should mean completed, not half-solved.
3. **Accounts** — `total_guests`, `new_today`; trend: new guests per day.
4. **Economy** — `credits_issued_today` (sum of `player_credits.credits` for today); trend: credits issued per day.
5. **Bots & Arena** — `total_custom_bots`, `arena_matches_today`; trend: arena matches per day. **(call, resolved during builder check)** Every existing query over `custom_bots` excludes `blocked` bots (e.g. `arena.py:226`'s eligibility check); there's no prior "total bot count" to match, but a raw `COUNT(*)` would count bots an admin has explicitly blocked for abuse, which works against this being a clean health signal rather than a raw row count (§2). `total_custom_bots` = `COUNT(*) WHERE COALESCE(blocked,0)=0` — includes unlisted bots (still real/playable, just off the leaderboard), excludes blocked ones.
6. **Clans** — `total_clans`, `total_members`. No trend **(call)** — clan activity is low-volume enough that a 14-day sparkline would mostly be noise/flat; revisit if the owner wants clan-week performance surfaced instead (that's `clan_weeks`, a different and more interesting metric, but a bigger addition — left out of v1 as a non-goal, not forgotten).

Response shape, e.g.:

```json
{
  "day": "2026-11-25",
  "rooms": {
    "active_lobby": 2, "active_playing": 5,
    "rooms_created_today": 11, "games_finished_today": 9,
    "trend": [{"day": "2026-11-12", "rooms_created": 8, "games_finished": 7}, ...]
  },
  "puzzles": { "ready_count": 6, "total_count": 23, "attempts_today": 14, "solved_today": 9,
               "trend": [{"day": "...", "attempts": 12, "solved": 8}, ...] },
  "accounts": { "total_guests": 22, "new_today": 3, "trend": [{"day": "...", "new": 2}, ...] },
  "economy": { "credits_issued_today": 480, "trend": [{"day": "...", "credits": 410}, ...] },
  "bots": { "total_custom_bots": 1, "arena_matches_today": 0, "trend": [{"day": "...", "matches": 1}, ...] },
  "clans": { "total_clans": 4, "total_members": 17 }
}
```

## 6. Backend changes (`PP-AI-Service`)

- New functions in `admin.py` (same file as `admin_status()`/`start_refill()` — this is all "admin read/action surface," no need for a separate module): one `admin_stats() -> dict` that runs the queries above and assembles the payload. Mirror the existing one-liner style from `puzzles.py:76-82` for the snapshot counts; the trend queries are simple `GROUP BY day` aggregates (pattern already used elsewhere, e.g. `timers.py:341`'s `GROUP BY ... HAVING COUNT`).
- Use `puzzles.utc_day()` for "today," and compute the 14-day window as the 14 day-strings ending today (builder's call how — a small loop or a single `WHERE day >= ?` bound using the day-string 14 days back, consistent with `puzzles._shift_day` style).
- For tables that only have an epoch-ms column (no `day` text column) — `rooms`, `guests`, `room_results`, `custom_bots` — bucket with `strftime('%Y-%m-%d', created_at/1000, 'unixepoch')` (or `finished_at` for `room_results`). This is UTC bucketing, consistent with `puzzles.utc_day()`'s own `timezone.utc` use.
- New route in `routes.py`, directly after the existing `/admin/refill` block (after line 368): `GET /admin/stats`, `@admin.require_admin`, returns `jsonify(admin.admin_stats())`. No new auth, no new worker/lock machinery — this never mutates or blocks (all queries are small reads against a WAL-mode sqlite file).
- No new dependency, no migration — nothing here touches `SCHEMA`/`init_db()`.

## 7. Frontend changes (spy-hunt)

- `src/admin/api.ts`: add `getAdminStats(): Promise<AdminStats>` calling `GET /admin/stats` with the same `adminHeaders()` as the existing calls; add the `AdminStats` TypeScript type matching §5's shape.
- `src/screens/Admin.tsx`: once a token is present, show a small tab switcher — two buttons, e.g. "Puzzle queue" / "Stats" **(call)** — toggling a local `view` state between the existing puzzle card and a new stats section. No new route, no new nav entry, same hidden/unlinked posture as the rest of the panel.
- New stats section: a responsive grid of six cards (one per §5 domain), each showing its snapshot number(s) plus a hand-rolled inline-SVG sparkline for its trend series where one exists. Reuse `.card`/`.panel`/`.screen`/`.muted`/`.btn` primitives already in `src/styles/primitives.css` rather than inventing new chrome; a "Refresh" button re-fetches on demand (no polling, per §2).
- **Before writing any chart/sparkline code or picking chart colors, consult the `dataviz` skill** for stat-tile and sparkline conventions (this wasn't loaded during brainstorming since no chart code has been written yet — it must be loaded before that happens, per the skill's own trigger rule).
- Extracting a small `Sparkline` component (array of numbers → inline SVG polyline) is reasonable since it's reused across 5 of the 6 cards — this is the one abstraction this feature actually earns.

## 8. Testing

- Backend (pytest, mirrors the refill tests): `admin_stats()` / `GET /admin/stats` returns the expected keys with a fresh/empty DB (all zeros, no crashes on empty tables — watch for `SUM()` returning `NULL` on an empty group, needs `COALESCE(..., 0)`); a couple of seeded rows across a few tables produce the expected snapshot counts and a trend entry for "today." Auth reuses the existing `require_admin` tests (missing/wrong token → 401) — no new auth logic to test.
- Frontend (Vitest, mirrors `Admin.test.tsx`'s pattern): mock `getAdminStats` the same way `getAdminStatus`/`startRefill` are mocked; test tab switch renders the stats section and calls `getAdminStats`; test a 401 from the stats call clears the token and re-prompts, same as the existing flow.
- No Playwright e2e, same reasoning as the refill design: hidden, single-operator page, manual check suffices.

## 9. Open question for the owner

None blocking. Calls worth a glance: the 14-day trend window, the tab-switch UI vs. e.g. stacking both cards on one page, and leaving `clan_weeks` (rival-match results) out of v1 — flag if any of these should go differently.
