# Admin stats dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Stats" tab to the existing hidden admin panel showing six cards (Rooms, Puzzles, Accounts, Economy, Bots & Arena, Clans) with today's snapshot numbers and 14-day sparkline trends, backed by one new `GET /admin/stats` endpoint.

**Architecture:** One new aggregate-query function (`admin.admin_stats()`) in the Flask backend, exposed on the existing `require_admin`-gated blueprint; one new frontend API call + TypeScript type; one new reusable `Sparkline` SVG component; a tab switcher added to the existing `Admin` screen.

**Tech Stack:** Flask + raw sqlite3 (backend, repo `PP-AI-Service`, symlinked into `spy-hunt` at `backend/`), React 19 + TypeScript + Vitest + Testing Library (frontend, repo `spy-hunt`).

**Spec:** `docs/superpowers/specs/2026-11-25-admin-stats-dashboard-design.md`

## Global Constraints

- No new charting dependency — hand-rolled inline SVG only (spec §2, §7).
- No new DB migration or schema change (spec §6) — only new `SELECT` queries.
- No polling/auto-refresh for stats — fetch on tab-open plus a manual "Refresh" button (spec §2).
- Reuse the existing shared `X-Admin-Token` auth (`admin.require_admin`) — no new auth logic (spec §6, §7).
- Trend window is exactly 14 days, UTC-bucketed, using the existing `puzzles.utc_day()` convention for "today" (spec §5, §6, §3).
- `attempts_today`/trend `attempts` = `puzzle_results` rows with `tries >= 1`; `solved_today`/trend `solved` = rows with `solved=1 AND stage='done'` (spec §5, resolved during builder check).
- `total_custom_bots` = `COUNT(*) WHERE COALESCE(blocked,0)=0` (excludes blocked, includes unlisted) (spec §5, resolved during builder check).
- Backend code lives in the separate `PP-AI-Service` git repo (symlinked at `spy-hunt/backend/`) — backend tasks commit there, not in `spy-hunt`.

## Review Focus

- Empty DB / zero-row tables: a `SUM` over zero matching rows must return `0`, not `NULL` or a crash (hits `economy.credits_issued_today` hardest, since `player_credits` can be empty).
- UTC day-boundary bucketing: `rooms`, `guests`, `custom_bots`, `room_results` only have epoch-ms columns (no `day` text column) — bucketing them with anything other than UTC-day arithmetic consistent with `puzzles.utc_day()` would misclassify rows created near midnight UTC.
- Blocked bots must not inflate `total_custom_bots` — a bot with `blocked=1` must be excluded even though it's a real row in `custom_bots`.
- Puzzle attempt/solved semantics: a `puzzle_results` row exists the instant a player opens the puzzle (`tries=0`) — it must not count as an attempt; a row with `solved=1` but `stage='word'` (spy identified, word stage not finished) must not count as solved.
- Trend arrays must have exactly 14 entries covering every day in the window, including days with zero activity (a day must appear with value `0`, never be omitted) — a sparse array breaks a fixed-length sparkline render.

---

## Task 1: Backend — `admin.admin_stats()` aggregate query function

**Files:**
- Modify: `backend/ai_svc/spy_hunt/admin.py`
- Test: `backend/ai_svc/spy_hunt/tests/test_admin.py`

**Interfaces:**
- Consumes: `puzzles.utc_day()`, `puzzles.ready_count()`, `puzzles.total_count()` (existing); `db.get_conn()` (existing, `sqlite3.Row` row factory).
- Produces: `admin_stats() -> dict` matching this exact shape (used by Task 2's route and mirrored by Task 3's TS type):

```python
{
  "day": str,                              # YYYY-MM-DD, puzzles.utc_day()
  "rooms": {
    "active_lobby": int, "active_playing": int,
    "rooms_created_today": int, "games_finished_today": int,
    "trend": [{"day": str, "rooms_created": int, "games_finished": int}, ...]  # 14 entries
  },
  "puzzles": {
    "ready_count": int, "total_count": int,
    "attempts_today": int, "solved_today": int,
    "trend": [{"day": str, "attempts": int, "solved": int}, ...]              # 14 entries
  },
  "accounts": {
    "total_guests": int, "new_today": int,
    "trend": [{"day": str, "new": int}, ...]                                  # 14 entries
  },
  "economy": {
    "credits_issued_today": int,
    "trend": [{"day": str, "credits": int}, ...]                              # 14 entries
  },
  "bots": {
    "total_custom_bots": int, "arena_matches_today": int,
    "trend": [{"day": str, "matches": int}, ...]                              # 14 entries
  },
  "clans": { "total_clans": int, "total_members": int }                      # no trend
}
```

- [x] **Step 1: Write the failing test for the empty-DB shape**

```python
def test_stats_shape_on_empty_db(temp_db, token):
    out = admin.admin_stats()
    assert out["day"] == puzzles.utc_day()
    for domain in ("rooms", "puzzles", "accounts", "economy", "bots"):
        assert "trend" in out[domain] and len(out[domain]["trend"]) == 14
        assert all(isinstance(e["day"], str) for e in out[domain]["trend"])
    assert out["rooms"]["active_lobby"] == 0
    assert out["puzzles"]["ready_count"] == 0
    assert out["economy"]["credits_issued_today"] == 0  # SUM over no rows, not None
    assert out["bots"]["total_custom_bots"] == 0
    assert out["clans"] == {"total_clans": 0, "total_members": 0}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py::test_stats_shape_on_empty_db -v`
Expected: FAIL (`AttributeError: module 'admin' has no attribute 'admin_stats'`)

- [x] **Step 3: Implement `admin_stats() -> dict` in `backend/ai_svc/spy_hunt/admin.py`**

One query set per domain per the shape above. For every table with no `day`/`created_day` text column (`rooms`, `guests`, `custom_bots`, `room_results`), bucket with `strftime('%Y-%m-%d', <col>/1000, 'unixepoch')` for UTC-day grouping, consistent with `puzzles.utc_day()`. Build the 14-day window as the 14 UTC day-strings ending today; every trend array must have one entry per window day, in ascending order, even when the count for that day is 0 (left-join the day list against the `GROUP BY` results rather than only emitting days that have rows). Use `COALESCE(SUM(...), 0)` for the economy sum. Apply the `tries >= 1` / `solved=1 AND stage='done'` filters for puzzles, and `COALESCE(blocked,0)=0` for bots, per Global Constraints.

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py::test_stats_shape_on_empty_db -v`
Expected: PASS

- [x] **Step 5: Write the failing test for rooms counts**

```python
def test_stats_rooms_counts(temp_db, token):
    r1 = store.create_room("p1", "Al", "en")
    store.create_room("p2", "Bo", "en")
    conn = db.get_conn()
    conn.execute("UPDATE rooms SET status='playing' WHERE id=?", (r1["id"],))
    conn.execute(
        "INSERT INTO room_results(room_id, game_no, finished_at, winner, lang, roles_json, words_json)"
        " VALUES (?,1,?,?,?,'[]','{}')",
        (r1["id"], int(time.time() * 1000), "spies", "en"))
    conn.commit()
    out = admin.admin_stats()["rooms"]
    assert out["active_lobby"] == 1
    assert out["active_playing"] == 1
    assert out["rooms_created_today"] == 2
    assert out["games_finished_today"] == 1
    today_entry = next(e for e in out["trend"] if e["day"] == puzzles.utc_day())
    assert today_entry == {"day": puzzles.utc_day(), "rooms_created": 2, "games_finished": 1}


def test_stats_rooms_trend_buckets_by_utc_day_not_local(temp_db, token):
    # A room created at 23:59:59 UTC two days ago must land in *that* day's
    # bucket, not the next day's — guards against bucketing by local time
    # or by a naive integer-division day boundary.
    conn = db.get_conn()
    two_days_ago = puzzles._shift_day(puzzles.utc_day(), -2)
    late_utc_ms = int(datetime.strptime(two_days_ago, "%Y-%m-%d")
                       .replace(hour=23, minute=59, second=59, tzinfo=timezone.utc).timestamp() * 1000)
    conn.execute(
        "INSERT INTO rooms(id, code, host_player_id, main_lang, config_json, status,"
        " game_no, phase_seq, last_active, created_at, version)"
        " VALUES('r-late','CODE1','p1','en','{}','lobby',1,0,?,?,1)",
        (late_utc_ms, late_utc_ms))
    conn.commit()
    out = admin.admin_stats()["rooms"]
    entry = next(e for e in out["trend"] if e["day"] == two_days_ago)
    assert entry["rooms_created"] == 1
    next_day = puzzles._shift_day(two_days_ago, 1)
    next_entry = next(e for e in out["trend"] if e["day"] == next_day)
    assert next_entry["rooms_created"] == 0
```

- [x] **Step 6: Run both rooms tests to verify they fail, then fix the rooms query until they pass**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -k stats_rooms -v`
Expected: first FAIL (if the Step 3 implementation has a bug), then PASS after adjustment. If they pass immediately, the Step 3 rooms query was already correct.

- [x] **Step 7: Write the failing test for puzzles counts**

```python
def test_stats_puzzles_counts(temp_db, token):
    puzzles.insert_ready(*sample_puzzle(), 2, "pair-1")
    day = puzzles.utc_day()
    conn = db.get_conn()
    conn.execute("INSERT INTO puzzle_results(day, player_id, stage, tries, solved)"
                 " VALUES (?,?,?,?,?)", (day, "p-viewed", "spy", 0, 0))      # opened only, not an attempt
    conn.execute("INSERT INTO puzzle_results(day, player_id, stage, tries, solved)"
                 " VALUES (?,?,?,?,?)", (day, "p-tried", "spy", 1, 0))      # attempted, not solved
    conn.execute("INSERT INTO puzzle_results(day, player_id, stage, tries, solved)"
                 " VALUES (?,?,?,?,?)", (day, "p-half", "word", 1, 1))      # spy correct, not done
    conn.execute("INSERT INTO puzzle_results(day, player_id, stage, tries, solved)"
                 " VALUES (?,?,?,?,?)", (day, "p-done", "done", 1, 1))      # fully solved
    conn.commit()
    out = admin.admin_stats()["puzzles"]
    assert out["ready_count"] == 1 and out["total_count"] == 1
    assert out["attempts_today"] == 3   # all but p-viewed
    assert out["solved_today"] == 1     # only p-done
```

- [x] **Step 8: Run test to verify it fails, then fix the puzzles query until it passes**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py::test_stats_puzzles_counts -v`
Expected: PASS after any needed adjustment.

- [x] **Step 9: Write the failing test for accounts and economy**

```python
def test_stats_accounts_and_economy(temp_db, token):
    auth.create_guest()
    auth.create_guest()
    conn = db.get_conn()
    day = puzzles.utc_day()
    now = int(time.time() * 1000)
    conn.execute("INSERT INTO player_credits(key, player_id, credits, created_day, created_at)"
                 " VALUES ('k1','p1',40,?,?)", (day, now))
    conn.execute("INSERT INTO player_credits(key, player_id, credits, created_day, created_at)"
                 " VALUES ('k2','p2',15,?,?)", (day, now))
    conn.commit()
    out = admin.admin_stats()
    assert out["accounts"]["total_guests"] == 2
    assert out["accounts"]["new_today"] == 2
    assert out["economy"]["credits_issued_today"] == 55
```

- [x] **Step 10: Run test to verify it fails, then fix the accounts/economy queries until it passes**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py::test_stats_accounts_and_economy -v`
Expected: PASS after any needed adjustment.

- [x] **Step 11: Write the failing test for bots, arena, and clans**

```python
def test_stats_bots_arena_clans(temp_db, token):
    custombots.create("owner1", "Bot A", {}, {})
    blocked = custombots.create("owner1", "Bot B", {}, {})
    conn = db.get_conn()
    conn.execute("UPDATE custom_bots SET blocked=1 WHERE id=?", (blocked["id"],))
    day = puzzles.utc_day()
    conn.execute("INSERT INTO arena_matches(id, day, lang, pair_id, log_json, created_at)"
                 " VALUES ('m1',?,'en','pair-1','{}',?)", (day, int(time.time() * 1000)))
    conn.commit()
    clans.create("leader1", "Spies Inc", 0)
    out = admin.admin_stats()
    assert out["bots"]["total_custom_bots"] == 1   # blocked one excluded
    assert out["bots"]["arena_matches_today"] == 1
    assert out["clans"] == {"total_clans": 1, "total_members": 1}
```

- [x] **Step 12: Run test to verify it fails, then fix the bots/arena/clans queries until it passes**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py::test_stats_bots_arena_clans -v`
Expected: PASS after any needed adjustment.

- [x] **Step 13: Run the full test file and commit**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -v`
Expected: all tests PASS.

```bash
cd backend && git add ai_svc/spy_hunt/admin.py ai_svc/spy_hunt/tests/test_admin.py
git commit -m "feat: add admin_stats aggregate query for the admin stats dashboard"
```

---

## Task 2: Backend — `GET /admin/stats` route

**Files:**
- Modify: `backend/ai_svc/spy_hunt/routes.py` (directly after the existing `/admin/refill` block, `routes.py:351-368`)
- Test: `backend/ai_svc/spy_hunt/tests/test_admin.py`

**Interfaces:**
- Consumes: `admin.admin_stats()` (Task 1), `admin.require_admin` (existing).
- Produces: `GET /api/spy-hunt/admin/stats` — 200 with `admin.admin_stats()`'s JSON on a valid `X-Admin-Token`, 401 otherwise.

- [x] **Step 1: Write the failing route tests**

```python
def test_stats_route_requires_token(client, token):
    assert client.get("/api/spy-hunt/admin/stats").status_code == 401


def test_stats_route_returns_stats(client, token):
    _seed(1)
    r = client.get("/api/spy-hunt/admin/stats", headers=HDR)
    assert r.status_code == 200
    body = r.get_json()
    assert body["puzzles"]["ready_count"] == 1
    assert "trend" in body["rooms"]
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -k stats_route -v`
Expected: FAIL with 404 (no such route)

- [x] **Step 3: Add the route in `backend/ai_svc/spy_hunt/routes.py`**

```python
@spy_hunt_bp.route("/admin/stats", methods=["GET"])
@admin.require_admin
def admin_stats():
    return jsonify(admin.admin_stats())
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -k stats_route -v`
Expected: PASS

- [x] **Step 5: Commit**

```bash
cd backend && git add ai_svc/spy_hunt/routes.py ai_svc/spy_hunt/tests/test_admin.py
git commit -m "feat: expose GET /admin/stats route"
```

---

## Task 3: Frontend — `getAdminStats()` API call

**Files:**
- Modify: `src/admin/api.ts`
- Modify: `src/admin/api.test.ts`

**Interfaces:**
- Consumes: `request()` from `../api/client` (existing, 4th param is a headers map), `adminHeaders()` (existing, private to `api.ts`).
- Produces: `export interface AdminStats { ... }` (exact shape mirrors Task 1's Python dict, with TS types) and `export async function getAdminStats(): Promise<AdminStats>` — used by Task 5.

- [x] **Step 1: Write the failing test**

```ts
test('getAdminStats GETs with the admin header', async () => {
  const sample /* : AdminStats */ = {
    day: '2026-11-25',
    rooms: { active_lobby: 1, active_playing: 0, rooms_created_today: 1, games_finished_today: 0, trend: [] },
    puzzles: { ready_count: 3, total_count: 5, attempts_today: 2, solved_today: 1, trend: [] },
    accounts: { total_guests: 10, new_today: 1, trend: [] },
    economy: { credits_issued_today: 40, trend: [] },
    bots: { total_custom_bots: 2, arena_matches_today: 0, trend: [] },
    clans: { total_clans: 1, total_members: 3 },
  }
  vi.mocked(request).mockResolvedValue(sample)
  expect(await getAdminStats()).toEqual(sample)
  expect(request).toHaveBeenCalledWith('GET', '/admin/stats', undefined, { 'X-Admin-Token': 'tok' })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/admin/api.test.ts`
Expected: FAIL (`getAdminStats` is not exported)

- [x] **Step 3: Implement `AdminStats` and `getAdminStats()` in `src/admin/api.ts`**

`AdminStats` is the TS mirror of Task 1's §Interfaces dict shape (six domain keys plus `day: string`; each domain's `trend` is `Array<{ day: string; ... }>` per domain, `clans` has no `trend`). `getAdminStats` calls `request<AdminStats>('GET', '/admin/stats', undefined, adminHeaders())`, matching the existing `getAdminStatus` pattern exactly.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/admin/api.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/admin/api.ts src/admin/api.test.ts
git commit -m "feat: add getAdminStats API call and AdminStats type"
```

---

## Task 4: Frontend — `Sparkline` component

**Files:**
- Create: `src/admin/Sparkline.tsx`
- Create: `src/admin/Sparkline.test.tsx`

**Interfaces:**
- Produces: `export function Sparkline({ values }: { values: number[] }): JSX.Element` — renders an inline SVG trend line for a fixed-length numeric series. Used by Task 5, once per card that has a `trend`.

- [x] **Step 1: Load the `dataviz` skill for sparkline/stat-tile conventions before writing any chart code**, per spec §7 — use it to inform stroke/sizing/color choices made in Step 3.

- [x] **Step 2: Write the failing tests**

```tsx
test('renders one point per value', () => {
  const { container } = render(<Sparkline values={[1, 3, 2, 5, 4]} />)
  expect(container.querySelector('svg')).toBeInTheDocument()
  expect(container.querySelector('polyline, path')).toBeInTheDocument()
})

test('renders a flat line without dividing by zero when every value is equal', () => {
  const { container } = render(<Sparkline values={[0, 0, 0, 0]} />)
  expect(container.querySelector('svg')).toBeInTheDocument()
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/admin/Sparkline.test.tsx`
Expected: FAIL (module does not exist)

- [x] **Step 4: Implement `Sparkline` in `src/admin/Sparkline.tsx`**

Normalize `values` to an SVG `viewBox`, guarding the case `max === min` (render a flat horizontal line instead of dividing by zero). Follow the dataviz skill's guidance from Step 1 for stroke width/color and sizing so it reads consistently with the rest of the admin panel.

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/admin/Sparkline.test.tsx`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/admin/Sparkline.tsx src/admin/Sparkline.test.tsx
git commit -m "feat: add Sparkline component for admin stats trends"
```

---

## Task 5: Frontend — Stats tab in `Admin.tsx`

**Files:**
- Modify: `src/screens/Admin.tsx`
- Modify: `src/screens/Admin.test.tsx`

**Interfaces:**
- Consumes: `getAdminStats()`, `AdminStats` (Task 3); `Sparkline` (Task 4); existing `onError` (401 → `clearToken` + re-prompt, already defined in `Admin.tsx`).
- Produces: a tab-switcher UI inside the existing `ready`-phase render, with no new route.

- [x] **Step 1: Write the failing test for opening the Stats tab**

```tsx
test('opening the Stats tab fetches and shows stats', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockResolvedValue({
    day: '2026-11-25',
    rooms: { active_lobby: 1, active_playing: 0, rooms_created_today: 1, games_finished_today: 0, trend: [] },
    puzzles: { ready_count: 2, total_count: 2, attempts_today: 9, solved_today: 5, trend: [] },
    accounts: { total_guests: 10, new_today: 1, trend: [] },
    economy: { credits_issued_today: 40, trend: [] },
    bots: { total_custom_bots: 2, arena_matches_today: 0, trend: [] },
    clans: { total_clans: 1, total_members: 3 },
  })
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  expect(await screen.findByText(/9/)).toBeInTheDocument()   // attempts_today
  expect(getAdminStats).toHaveBeenCalledTimes(1)
})
```

(Add `getAdminStats` to the `vi.mock('../admin/api', ...)` factory alongside the existing mocked exports.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/Admin.test.tsx -t "opening the Stats tab"`
Expected: FAIL (no "Stats" button / `getAdminStats` never called)

- [x] **Step 3: Implement the tab switcher and stats section in `src/screens/Admin.tsx`**

Add local `view` state (`'queue' | 'stats'`, default `'queue'`). Two tab buttons toggle it. Switching to `'stats'` for the first time calls `getAdminStats()` (via the existing `onError` handler on failure) and stores the result in a new `stats` state; switching back and forth does not refetch. Render six cards (Rooms, Puzzles, Accounts, Economy, Bots & Arena, Clans) from `stats`, each showing its snapshot numbers and, where the domain has a `trend`, a `<Sparkline values={...} />` built from the relevant trend field. A "Refresh" button on the stats view re-calls `getAdminStats()`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/Admin.test.tsx -t "opening the Stats tab"`
Expected: PASS

- [x] **Step 5: Write the failing test for a 401 on the stats fetch**

```tsx
test('a 401 on the stats fetch clears the token and re-prompts', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  await waitFor(() => expect(clearToken).toHaveBeenCalled())
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})
```

- [x] **Step 6: Run test to verify it fails, then route the stats fetch's catch through `onError`**

Run: `npx vitest run src/screens/Admin.test.tsx -t "401 on the stats fetch"`
Expected: PASS once the stats fetch's `.catch` calls the existing `onError`.

- [x] **Step 7: Write the failing test for the Refresh button re-fetching**

```tsx
test('Refresh on the stats tab re-fetches stats', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(getAdminStats).mockResolvedValue(/* same sample as Step 1 */)
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /stats/i }))
  await screen.findByText(/9/)
  await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
  expect(getAdminStats).toHaveBeenCalledTimes(2)
})
```

- [x] **Step 8: Run test to verify it fails, then wire the Refresh button**

Run: `npx vitest run src/screens/Admin.test.tsx -t "Refresh on the stats tab"`
Expected: PASS once Refresh calls `getAdminStats()` again.

- [x] **Step 9: Run the full frontend test suite**

Run: `npx vitest run`
Expected: all tests PASS (including the pre-existing `Admin.test.tsx` tests, unaffected by the new tab).

- [x] **Step 10: Commit**

```bash
git add src/screens/Admin.tsx src/screens/Admin.test.tsx
git commit -m "feat: add Stats tab to the admin panel"
```
