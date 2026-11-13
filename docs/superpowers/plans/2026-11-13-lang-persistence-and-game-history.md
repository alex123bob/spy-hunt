# Language Persistence and Game History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the language-reset-on-refresh bug, carry a player's language preference across devices via their account, and let a player see a list and detail view of their own recently finished room games.

**Architecture:** Backend additions follow the exact idempotent-migration and route-decorator patterns the 2026-11-11 accounts slice already established (`PRAGMA table_info` migrations, `@ratelimits.limit("flood") → @auth.require_guest → @ratelimits.limit(...)` route stacks). Game history is written once, synchronously, at the existing `game._finish()` hook — a fourth independent side effect alongside the three it already performs (bots, clans, credits) — as a self-contained snapshot so it survives the room's own later sweep. Frontend additions follow the existing small-wrapper-module API pattern (`src/credits/api.ts`) and the existing `MatchPage.tsx`/`DailyResult.tsx` structures for the new detail screen.

**Tech Stack:** Backend: Flask + raw sqlite3 (no ORM), pytest. Frontend: React + TypeScript + React Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-lang-persistence-and-game-history-design.md`

## Global Constraints

- No new backend dependency for either feature.
- `_finish()`'s existing `game_over` event payload stays byte-for-byte unchanged; nothing in this plan edits that dict.
- All new tables/columns follow the existing idempotent `PRAGMA table_info(...)` / `CREATE TABLE IF NOT EXISTS` migration style already in `backend/ai_svc/spy_hunt/db.py` — no new migration mechanism.
- zh-Hans and en copy is required for every new user-facing string (the "Recent Games" section, the game-detail screen).
- Rate limits: the new account-level `PATCH /me` uses the `action` tier (same as `register`/`logout`); `GET /me/games` and `GET /me/games/<room_id>/<game_no>` use the `read` tier (same as `GET /me`/`GET /daily/streak`).
- A game a player left before it finished never appears in that player's own history (owner-confirmed).

## Review Focus

- `PATCH /me` (account-level) or guest creation receives a `lang` value outside `LANGS` — the PATCH must 400 `bad_lang`; guest creation must still succeed with `preferred_lang` left `null`, never storing garbage.
- `_finish()` runs twice for the same `(room_id, game_no)` (already-exercised retry behavior for `clans.award_game`/`credits.award_game_parts`) — `history.record_game` must not raise on the resulting primary-key collision.
- A player requests `GET /me/games/<room_id>/<game_no>` for a game they were never seated in — must 404, never leak another player's reveal or raw `player_id`.
- A game finishes with fewer than `MIN_HUMANS` players (already exempt from credits/clan points) — the humans who did play it still get a history row, since "see my own past games" isn't gated on credit eligibility.
- A brand-new browser with no stored session at all still gets the right first-run language — the i18n bootstrap fix must preserve `getSession().lang`'s existing fallback to `detectLang(navigator.language)`, not only the "already has a stored value" case.

---

## Task 1: Backend schema — account language column and game-history tables

**Files:**
- Modify: `backend/ai_svc/spy_hunt/db.py` (the `SCHEMA` string and the migration block in `init_db()`)
- Test: `backend/ai_svc/spy_hunt/tests/test_db.py`

**Interfaces:**
- Produces: `guests.preferred_lang` (nullable `TEXT` column); `room_results(room_id, game_no, finished_at, winner, lang, roles_json, words_json)` with `PRIMARY KEY(room_id, game_no)`; `room_result_players(room_id, game_no, player_id, seat, role, won, credits_earned, credit_parts)` with `PRIMARY KEY(room_id, game_no, player_id)`; index `idx_room_result_players_player` on `room_result_players(player_id)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_guest_preferred_lang_column_exists(conn):
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(guests)")}
    assert "preferred_lang" in cols


def test_room_results_tables_and_index_created(conn):
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"room_results", "room_result_players"} <= names
    idx = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "idx_room_result_players_player" in idx


def test_room_results_schema_columns(conn):
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(room_results)")}
    assert cols == {"room_id", "game_no", "finished_at", "winner", "lang", "roles_json", "words_json"}
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(room_result_players)")}
    assert cols == {"room_id", "game_no", "player_id", "seat", "role", "won", "credits_earned", "credit_parts"}
```

Add these to `backend/ai_svc/spy_hunt/tests/test_db.py`, alongside the existing `test_sessions_table_and_guest_columns_exist`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/jiali/personal_github_repos/PP-AI-Service && source venv/bin/activate && python -m pytest ai_svc/spy_hunt/tests/test_db.py -v`
Expected: the three new tests FAIL (column/tables/index don't exist yet).

- [ ] **Step 3: Add the migration**

In `db.py`'s `init_db()`, extend the existing `guests` column-migration loop (the one already adding `email`/`password_hash`, next to `db.py:155-162`) to also add `preferred_lang`:

```python
have = {r[1] for r in conn.execute("PRAGMA table_info(guests)")}
for col in ("email", "password_hash", "preferred_lang"):
    if col not in have:
        conn.execute(f"ALTER TABLE guests ADD COLUMN {col} TEXT")
```

Add the two new `CREATE TABLE IF NOT EXISTS` statements to the `SCHEMA` string (next to the existing `puzzle_results`/`arena_matches` definitions, `db.py:14-105`):

```sql
CREATE TABLE IF NOT EXISTS room_results(
  room_id TEXT, game_no INTEGER, finished_at INTEGER, winner TEXT, lang TEXT,
  roles_json TEXT, words_json TEXT, PRIMARY KEY(room_id, game_no));
CREATE TABLE IF NOT EXISTS room_result_players(
  room_id TEXT, game_no INTEGER, player_id TEXT, seat INTEGER, role TEXT, won INTEGER,
  credits_earned INTEGER, credit_parts TEXT, PRIMARY KEY(room_id, game_no, player_id));
```

Add the index next to the existing `idx_puzzle_results_player` index (`db.py:104`):

```sql
CREATE INDEX IF NOT EXISTS idx_room_result_players_player ON room_result_players(player_id);
```

Because `CREATE TABLE`/`CREATE INDEX ... IF NOT EXISTS` statements live in the `SCHEMA` string that already runs on every `init_db()` call, no extra guard is needed for these two tables — only the `guests` column addition needs the `PRAGMA table_info` check.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_db.py -v`
Expected: all tests PASS, including the pre-existing ones (no regression).

- [ ] **Step 5: Commit**

```bash
git -C /Users/jiali/personal_github_repos/PP-AI-Service add ai_svc/spy_hunt/db.py ai_svc/spy_hunt/tests/test_db.py
git -C /Users/jiali/personal_github_repos/PP-AI-Service commit -m "feat(spy-hunt): add guests.preferred_lang and room-result history tables"
```

---

## Task 2: Backend — account-level language preference

**Files:**
- Modify: `backend/ai_svc/spy_hunt/auth.py` (`create_guest`)
- Modify: `backend/ai_svc/spy_hunt/accounts.py` (`me`, `login`, new `update_me`)
- Modify: `backend/ai_svc/spy_hunt/routes.py` (`POST /guests`, new `PATCH /me`)
- Test: `backend/ai_svc/spy_hunt/tests/test_accounts.py`, `backend/ai_svc/spy_hunt/tests/test_auth.py`

**Interfaces:**
- Consumes: Task 1's `guests.preferred_lang` column; `store.check_lang(value: Any) -> str` (`store.py:61-64`, raises `StoreError(400, "bad_lang", ...)` on an invalid value).
- Produces: `auth.create_guest(lang: Optional[str] = None) -> Tuple[str, str]` (unchanged return shape, new optional param); `accounts.me(player_id: str) -> Dict[str, Optional[str]]` now includes `"preferred_lang"`; `accounts.update_me(player_id: str, lang: Any) -> Dict[str, str]`; `accounts.login(...)`'s returned dict gains `"preferred_lang"`.

- [ ] **Step 1: Write the failing tests**

In `test_auth.py`, next to `test_create_guest_returns_ids`:

```python
def test_create_guest_seeds_preferred_lang_from_body(client, conn):
    body = _make_guest(client, json={"lang": "zh-Hans"})
    row = conn.execute("SELECT preferred_lang FROM guests WHERE player_id=?",
                        (body["player_id"],)).fetchone()
    assert row["preferred_lang"] == "zh-Hans"


def test_create_guest_ignores_an_invalid_lang(client, conn):
    body = _make_guest(client, json={"lang": "klingon"})
    row = conn.execute("SELECT preferred_lang FROM guests WHERE player_id=?",
                        (body["player_id"],)).fetchone()
    assert row["preferred_lang"] is None


def test_create_guest_without_a_body_still_works(client, conn):
    body = _make_guest(client)
    row = conn.execute("SELECT preferred_lang FROM guests WHERE player_id=?",
                        (body["player_id"],)).fetchone()
    assert row["preferred_lang"] is None
```

In `test_accounts.py`, next to `test_me_reports_email_or_null`:

```python
def test_me_reports_preferred_lang_or_null(client):
    guest = _make_guest(client, json={"lang": "zh-Hans"})
    r = client.get("/api/spy-hunt/me", headers=_auth_header(guest))
    assert r.get_json() == {"email": None, "preferred_lang": "zh-Hans"}


def test_patch_me_requires_guest_token(client):
    r = client.patch("/api/spy-hunt/me", json={"lang": "en"})
    assert r.status_code == 401


def test_patch_me_sets_preferred_lang(client, conn):
    guest = _make_guest(client)
    r = client.patch("/api/spy-hunt/me", json={"lang": "zh-Hans"}, headers=_auth_header(guest))
    assert r.status_code == 200
    assert r.get_json() == {"preferred_lang": "zh-Hans"}
    row = conn.execute("SELECT preferred_lang FROM guests WHERE player_id=?",
                        (guest["player_id"],)).fetchone()
    assert row["preferred_lang"] == "zh-Hans"


def test_patch_me_rejects_an_invalid_lang(client):
    guest = _make_guest(client)
    r = client.patch("/api/spy-hunt/me", json={"lang": "klingon"}, headers=_auth_header(guest))
    assert r.status_code == 400
    assert r.get_json()["error"] == "bad_lang"


def test_login_returns_preferred_lang(client):
    guest = _make_guest(client, json={"lang": "zh-Hans"})
    client.post("/api/spy-hunt/register", json={"email": "a@b.com", "password": "longenough"},
                headers=_auth_header(guest))
    r = client.post("/api/spy-hunt/login", json={"email": "a@b.com", "password": "longenough"})
    assert r.get_json()["preferred_lang"] == "zh-Hans"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_auth.py ai_svc/spy_hunt/tests/test_accounts.py -v`
Expected: all new tests FAIL (`create_guest` ignores `lang`; `/me` lacks `preferred_lang`; `PATCH /me` doesn't exist → 404; `login` lacks `preferred_lang`).

- [ ] **Step 3: Implement `auth.create_guest(lang: Optional[str] = None) -> Tuple[str, str]` in `auth.py`**

Keep the existing `player_id`/`token` generation and the `sessions` insert unchanged. Before inserting the `guests` row, validate `lang` the same way `store.check_lang` does, but tolerate an invalid value instead of raising (guest creation must never fail over a bad language hint): if `lang` is not `None` and not in `store.LANGS`-equivalent set, treat it as `None`. If `store.py` importing into `auth.py` (or vice versa) creates an import cycle, use a deferred import inside the function body — the same pattern `game.py`'s `_finish()` already uses for `custombots`/`clans`/`credits`. Insert `lang` (or `None`) as `preferred_lang` on the `guests` row.

- [ ] **Step 4: Implement the `POST /guests` body change in `routes.py`**

Read an optional JSON body with `request.get_json(silent=True) or {}` (tolerant of no body at all, matching today's no-body callers) and pass `body.get("lang")` into `auth.create_guest(lang=...)`.

- [ ] **Step 5: Implement `accounts.me` and `accounts.update_me` in `accounts.py`**

```python
def me(player_id: str) -> Dict[str, Optional[str]]:
    row = get_conn().execute(
        "SELECT email, preferred_lang FROM guests WHERE player_id=?", (player_id,)
    ).fetchone()
    return {"email": row["email"] if row else None,
            "preferred_lang": row["preferred_lang"] if row else None}


def update_me(player_id: str, lang: Any) -> Dict[str, str]:
    lang = store.check_lang(lang)
    get_conn().execute("UPDATE guests SET preferred_lang=? WHERE player_id=?", (lang, player_id))
    get_conn().commit()
    return {"preferred_lang": lang}
```

Import `store` (or just `check_lang`) at the top of `accounts.py`. Also extend whatever `SELECT` `login()` already runs against `guests` to also select `preferred_lang`, and add `"preferred_lang": row["preferred_lang"]` to its returned dict alongside the existing `player_id`/`token`/`email` keys.

- [ ] **Step 6: Add the `PATCH /me` route in `routes.py`**

```python
@spy_hunt_bp.route("/me", methods=["PATCH"])
@ratelimits.limit("flood")
@auth.require_guest
@ratelimits.limit("action")
def update_me():
    body = _json_body()
    return jsonify(accounts.update_me(g.player_id, body.get("lang")))
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_auth.py ai_svc/spy_hunt/tests/test_accounts.py -v`
Expected: all PASS, including pre-existing tests.

- [ ] **Step 8: Commit**

```bash
git -C /Users/jiali/personal_github_repos/PP-AI-Service add ai_svc/spy_hunt/auth.py ai_svc/spy_hunt/accounts.py ai_svc/spy_hunt/routes.py ai_svc/spy_hunt/tests/test_auth.py ai_svc/spy_hunt/tests/test_accounts.py
git -C /Users/jiali/personal_github_repos/PP-AI-Service commit -m "feat(spy-hunt): add account-level preferred_lang, seeded at guest creation"
```

---

## Task 3: Backend — write game history at `_finish()`

**Files:**
- Create: `backend/ai_svc/spy_hunt/history.py`
- Modify: `backend/ai_svc/spy_hunt/game.py` (`_finish`, `game.py:261-283`)
- Test: `backend/ai_svc/spy_hunt/tests/test_history.py` (new)

**Interfaces:**
- Consumes: Task 1's `room_results`/`room_result_players` tables; `rows` (list of player-row mappings with `player_id`, `seat`, `role`, `is_bot`, `name`) and `parts` (`Dict[player_id, List[Part]]`, pre-reseat, as already computed in `_finish()` by `credits.award_game_parts`).
- Produces: `history.record_game(conn, room: Mapping, rows: List[Mapping], winner: Optional[str], words: dict, parts: Dict[str, list]) -> None`.

- [ ] **Step 1: Write the failing tests**

In a new `test_history.py`, follow `test_clans_points.py`'s `make_room()`/`finish()` helper pattern:

```python
from ai_svc.spy_hunt import game, history, store


def make_room(seats):
    """seats: list of (player_id, is_bot, role) tuples. Returns room_id."""
    # mirror test_clans_points.py's make_room: insert rooms/players rows directly via SQL.


def finish(rid, winner):
    with store.tx(rid) as c:
        game._finish(c, rid, [], winner, [])


def test_record_game_writes_one_row_per_human(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy"), ("bot1", True, "civilian")])
    finish(rid, "civilians")
    rows = conn.execute("SELECT player_id FROM room_result_players WHERE room_id=?", (rid,)).fetchall()
    assert {r["player_id"] for r in rows} == {"a", "b"}


def test_record_game_writes_the_room_result_row(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    row = conn.execute("SELECT winner FROM room_results WHERE room_id=?", (rid,)).fetchone()
    assert row["winner"] == "civilians"


def test_record_game_is_idempotent_on_retried_finish(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    rows = conn.execute("SELECT * FROM players WHERE room_id=?", (rid,)).fetchall()
    with store.tx(rid) as c:
        history.record_game(c, dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone()),
                             rows, "civilians", {}, {})
    assert conn.execute("SELECT COUNT(*) FROM room_results WHERE room_id=?", (rid,)).fetchone()[0] == 1


def test_record_game_still_writes_below_min_humans(conn):
    rid = make_room([("a", False, "civilian"), ("bot1", True, "spy")])
    finish(rid, "civilians")
    row = conn.execute("SELECT player_id FROM room_result_players WHERE room_id=?", (rid,)).fetchone()
    assert row["player_id"] == "a"


def test_finish_still_succeeds_when_record_game_raises(conn, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("boom")
    monkeypatch.setattr(history, "record_game", boom)
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")  # must not raise
    assert conn.execute("SELECT status FROM rooms WHERE id=?", (rid,)).fetchone()[0] == "finished"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: FAIL with `ModuleNotFoundError`/`AttributeError` (`history.py` and `record_game` don't exist yet; `_finish` doesn't call it).

- [ ] **Step 3: Implement `history.record_game` in `history.py`**

Build `roles_json` as `json.dumps([{"seat": r["seat"], "role": r["role"], "is_bot": bool(r["is_bot"]), "name": r["name"]} for r in rows])` and `words_json` as `json.dumps(words)`. Insert into `room_results` with `INSERT OR IGNORE` (keyed on `room_id, game_no` — tolerates a retried `_finish()` without raising). For every row in `rows` where `not row["is_bot"]`, compute `won = (row["role"] == "spy") == (winner == "spies")`, read that player's parts list from `parts.get(row["player_id"], [])`, and `INSERT OR IGNORE` into `room_result_players` with `credits_earned = sum(p["n"] for p in those parts)` and `credit_parts = json.dumps(those parts)`. Use `finished_at = int(time.time() * 1000)`, `lang = room["main_lang"]`.

- [ ] **Step 4: Wire the call into `game._finish()`**

Immediately after the existing line `parts = credits.award_game_parts(conn, room_id, room["game_no"], rows, winner)` (`game.py:261-283`) and before the `seat_of = {...}` re-keying line, add:

```python
from ai_svc.spy_hunt import history
try:
    history.record_game(conn, room, rows, winner, words, parts)
except Exception:
    pass
```

The `try/except` at this call site (not inside `history.py`) ensures a bug in history-writing can never break the live game-over flow for everyone else at the table — matching the resilience the three existing calls already get from their own internal error handling.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_history.py ai_svc/spy_hunt/tests/test_clans_points.py ai_svc/spy_hunt/tests/test_custom_bots_room.py -v`
Expected: all PASS (including the two existing files, to confirm `_finish()`'s other three side effects are unaffected).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jiali/personal_github_repos/PP-AI-Service add ai_svc/spy_hunt/history.py ai_svc/spy_hunt/game.py ai_svc/spy_hunt/tests/test_history.py
git -C /Users/jiali/personal_github_repos/PP-AI-Service commit -m "feat(spy-hunt): persist a durable game-history snapshot at game finish"
```

---

## Task 4: Backend — read game history

**Files:**
- Modify: `backend/ai_svc/spy_hunt/history.py` (add `games_for`, `game_detail`)
- Modify: `backend/ai_svc/spy_hunt/routes.py` (add `GET /me/games`, `GET /me/games/<room_id>/<game_no>`)
- Test: `backend/ai_svc/spy_hunt/tests/test_history.py`

**Interfaces:**
- Consumes: Task 3's `room_results`/`room_result_players` rows.
- Produces: `history.games_for(player_id: str, limit: int = 20) -> List[Dict]`; `history.game_detail(player_id: str, room_id: str, game_no: int) -> Optional[Dict]`.

- [ ] **Step 1: Write the failing tests**

```python
def test_games_for_lists_most_recent_first(conn):
    rid1 = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid1, "civilians")
    rid2 = make_room([("a", False, "spy"), ("b", False, "civilian")])
    finish(rid2, "spies")
    games = history.games_for("a")
    assert [g["room_id"] for g in games] == [rid2, rid1]
    assert games[0]["your_role"] == "spy" and games[0]["won"] is True


def test_games_for_only_includes_the_requested_player(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    assert history.games_for("nobody") == []


def test_game_detail_marks_the_viewer_and_hides_other_player_ids(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    game_no = conn.execute("SELECT game_no FROM room_results WHERE room_id=?", (rid,)).fetchone()[0]
    detail = history.game_detail("a", rid, game_no)
    you = next(r for r in detail["roles"] if r["is_you"])
    other = next(r for r in detail["roles"] if not r["is_you"])
    assert you["role"] == "civilian"
    assert "player_id" not in you and "player_id" not in other


def test_game_detail_returns_none_for_a_non_participant(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    game_no = conn.execute("SELECT game_no FROM room_results WHERE room_id=?", (rid,)).fetchone()[0]
    assert history.game_detail("stranger", rid, game_no) is None


def test_my_games_route_requires_auth(client):
    assert client.get("/api/spy-hunt/me/games").status_code == 401


def test_my_game_detail_route_404s_for_a_foreign_game(client):
    guest = _make_guest(client)
    r = client.get("/api/spy-hunt/me/games/no-such-room/1", headers=_auth_header(guest))
    assert r.status_code == 404
```

(`_make_guest`/`_auth_header` as already defined in `test_auth.py`/`test_accounts.py`; import or re-declare locally per this file's convention.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: FAIL (`games_for`/`game_detail` don't exist; routes 404 instead of 401/the expected codes).

- [ ] **Step 3: Implement `history.games_for`**

Join `room_result_players` (filtered to `player_id`) against `room_results` on `(room_id, game_no)`, ordered by `finished_at DESC` limited to `limit`. Return one dict per row: `{"room_id", "game_no", "finished_at", "winner", "your_role": row["role"], "won": bool(row["won"]), "credits_earned": row["credits_earned"]}`.

- [ ] **Step 4: Implement `history.game_detail`**

First confirm the viewer participated: `SELECT 1 FROM room_result_players WHERE room_id=? AND game_no=? AND player_id=?`; return `None` if no row. Otherwise load the `room_results` row (parse `roles_json`/`words_json`) and `SELECT seat, player_id, credits_earned, credit_parts FROM room_result_players WHERE room_id=? AND game_no=?`, keyed by `seat`, to look up each human seat's credits and to set `is_you = (that row's player_id == player_id)` — the lookup dict's `player_id` values are used only for this comparison and are never placed in the returned structure. Return `{"finished_at", "winner", "lang", "words", "roles": [...]}` where each role entry is `{"seat", "role", "is_bot", "name", "is_you", "credits_earned"?, "credit_parts"?}` (the last two present only for human seats).

- [ ] **Step 5: Add the two routes in `routes.py`**

```python
@spy_hunt_bp.route("/me/games", methods=["GET"])
@ratelimits.limit("flood")
@auth.require_guest
@ratelimits.limit("read")
def my_games():
    return jsonify(history.games_for(g.player_id))


@spy_hunt_bp.route("/me/games/<room_id>/<int:game_no>", methods=["GET"])
@ratelimits.limit("flood")
@auth.require_guest
@ratelimits.limit("read")
def my_game_detail(room_id: str, game_no: int):
    detail = history.game_detail(g.player_id, room_id, game_no)
    if detail is None:
        raise store.StoreError(404, "not_found", "No such game.")
    return jsonify(detail)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: all PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `python -m pytest ai_svc/spy_hunt/tests -v`
Expected: all PASS (no regression anywhere else).

- [ ] **Step 8: Commit**

```bash
git -C /Users/jiali/personal_github_repos/PP-AI-Service add ai_svc/spy_hunt/history.py ai_svc/spy_hunt/routes.py ai_svc/spy_hunt/tests/test_history.py
git -C /Users/jiali/personal_github_repos/PP-AI-Service commit -m "feat(spy-hunt): add GET /me/games and GET /me/games/<room>/<n> history endpoints"
```

---

## Task 5: Frontend — fix the i18n refresh bug

**Files:**
- Modify: `src/i18n/index.ts`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `getSession(): Session` from `src/state/session.ts` (already exists; `Session.lang` already falls back to `detectLang(navigator.language)` when nothing is stored).
- Produces: no interface change — `getLang`/`setLang`/`t`/`useLang` keep their existing signatures; only the module's initial value changes.

- [ ] **Step 1: Write the failing test**

```typescript
test('boots from the stored session language, not the browser locale', async () => {
  vi.resetModules()
  vi.doMock('../state/session', () => ({ getSession: () => ({ lang: 'zh-Hans' }) }))
  const mod = await import('./index')
  expect(mod.getLang()).toBe('zh-Hans')
  vi.doUnmock('../state/session')
  vi.resetModules()
})

test('a brand-new browser with no stored session still falls back to the browser locale', async () => {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules()
  const { resetSessionForTests } = await import('../state/session')
  resetSessionForTests()
  vi.stubGlobal('navigator', { ...navigator, language: 'zh' })
  const mod = await import('./index')
  expect(mod.getLang()).toBe('zh-Hans')
  vi.unstubAllGlobals()
  vi.resetModules()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jiali/personal_github_repos/spy-hunt && yarn vitest run src/i18n/i18n.test.ts`
Expected: FAIL — `getLang()` returns `'en'` (from `navigator.language` in jsdom) regardless of a stubbed `navigator.language`, since the module doesn't consult `getSession()`/`detectLang` for its initial value yet.

- [ ] **Step 3: Implement the fix**

In `src/i18n/index.ts`, replace the `current` initializer (currently `let current: Lang = detectLang(typeof navigator !== 'undefined' ? navigator.language : 'en')`) with:

```typescript
import { getSession } from '../state/session'
...
let current: Lang = getSession().lang
```

`getSession().lang` already resolves to the stored value, or — when nothing is stored — to `detectLang(navigator.language)` internally, so first-time behavior is unchanged. Keep the existing `export { detectLang }` line as-is (other modules still import `detectLang` from here).

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/i18n/i18n.test.ts`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.ts src/i18n/i18n.test.ts
git commit -m "fix(spy-hunt): boot the UI language from the stored session, not the browser locale"
```

---

## Task 6: Frontend — account language type, API wrapper, and login sync

**Files:**
- Modify: `src/api/types.ts` (`Account`)
- Modify: `src/state/accounts.ts` (`login`, new `patchMyLang`)
- Test: `src/state/accounts.test.ts`

**Interfaces:**
- Consumes: Task 5's `setLang` export from `src/i18n`; existing `setSessionLang`/`getSession` from `src/state/session.ts`; existing `request` from `src/api/client.ts`.
- Produces: `Account` gains `preferred_lang: Lang | null`; `accounts.ts` exports `patchMyLang(lang: Lang): Promise<void>` (used by Task 7).

- [ ] **Step 1: Write the failing tests**

In `src/state/accounts.test.ts`:

```typescript
import { getLang } from '../i18n'

test('login applies the account preferred_lang immediately', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    reply({ player_id: 'p9', token: 'tok9', email: 'a@b.com', preferred_lang: 'zh-Hans' }),
  )
  await login('a@b.com', 'longenough')
  expect(getLang()).toBe('zh-Hans')
})

test('login leaves the language unchanged when preferred_lang is null', async () => {
  const { setLang } = await import('../i18n')
  setLang('en')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    reply({ player_id: 'p9', token: 'tok9', email: 'a@b.com', preferred_lang: null }),
  )
  await login('a@b.com', 'longenough')
  expect(getLang()).toBe('en')
})

test('patchMyLang sends PATCH /me when a session exists', async () => {
  setCredentials({ playerId: 'p1', token: 't1' })
  localStorage.setItem('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ preferred_lang: 'zh-Hans' }))
  await patchMyLang('zh-Hans')
  expect(String(f.mock.calls[0][0])).toMatch(/\/me$/)
  expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ lang: 'zh-Hans' })
})

test('patchMyLang is a no-op without a session', async () => {
  const f = vi.spyOn(globalThis, 'fetch')
  await patchMyLang('zh-Hans')
  expect(f).not.toHaveBeenCalled()
})

test('patchMyLang swallows request errors', async () => {
  setCredentials({ playerId: 'p1', token: 't1' })
  localStorage.setItem('spy-hunt.session', JSON.stringify({ playerId: 'p1', token: 't1' }))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
  await expect(patchMyLang('zh-Hans')).resolves.toBeUndefined()
})
```

Add `patchMyLang` to this test file's imports from `./accounts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn vitest run src/state/accounts.test.ts`
Expected: FAIL (`patchMyLang` doesn't exist; `login` doesn't apply `preferred_lang`).

- [ ] **Step 3: Add `preferred_lang` to the `Account` type**

In `src/api/types.ts`, change `export interface Account { email: string | null }` to:

```typescript
export interface Account { email: string | null; preferred_lang: Lang | null }
```

- [ ] **Step 4: Implement the `login` change and `patchMyLang` in `src/state/accounts.ts`**

Add `setSessionLang` to the existing `import { ... } from './session'` line, and add `import { setLang } from '../i18n'`. Change `login`:

```typescript
export async function login(email: string, password: string): Promise<void> {
  const r = await request<{ player_id: string; token: string; email?: string; preferred_lang?: Lang | null }>(
    'POST', '/login', { email, password },
  )
  setAccountSession({ playerId: r.player_id, token: r.token })
  setCachedEmail(r.email ?? null)
  if (r.preferred_lang) {
    setLang(r.preferred_lang)
    setSessionLang(r.preferred_lang)
  }
}
```

Add:

```typescript
export async function patchMyLang(lang: Lang): Promise<void> {
  if (!getSession().playerId) return
  try {
    await request('PATCH', '/me', { lang })
  } catch {
    // best-effort; a language pick must not surface an error to the player
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/state/accounts.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/state/accounts.ts src/state/accounts.test.ts
git commit -m "feat(spy-hunt): sync account preferred_lang on login and add patchMyLang"
```

---

## Task 7: Frontend — wire language pickers and guest creation to the account preference

**Files:**
- Modify: `src/state/session.ts` (`ensureGuest`)
- Modify: `src/components/TopBar.tsx` (`pickLang`)
- Modify: `src/screens/Lobby.tsx` (`pickLang`)
- Modify: `src/screens/Table.tsx` (`pickLang`)
- Test: `src/state/session.test.ts`, `src/components/TopBar.test.tsx`, and (create if not already present, following `TopBar.test.tsx`'s mocking style) `src/screens/Lobby.test.tsx`, `src/screens/Table.test.tsx`

**Interfaces:**
- Consumes: Task 6's `patchMyLang(lang: Lang): Promise<void>` from `src/state/accounts.ts`.
- Produces: none new — this task only adds call sites.

- [ ] **Step 1: Write the failing test for guest creation**

In `src/state/session.test.ts`:

```typescript
test('ensureGuest tells the server the current language when creating a guest', async () => {
  localStorage.clear()
  localStorage.setItem('spy-hunt.session', JSON.stringify({ lang: 'zh-Hans' }))
  resetSessionForTests()
  const f = guestFetch()
  await ensureGuest()
  expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ lang: 'zh-Hans' })
})
```

- [ ] **Step 2: Write the failing test for `TopBar`'s `pickLang`**

In `src/components/TopBar.test.tsx`, add `patchMyLang: vi.fn()` to the existing `vi.mock('../state/accounts', () => ({ ... }))` block, then:

```typescript
test('picking a language also syncs it to the account', async () => {
  render(<TopBar />)
  fireEvent.click(screen.getByRole('radio', { name: '简体中文' }))
  expect(patchMyLang).toHaveBeenCalledWith('zh-Hans')
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn vitest run src/state/session.test.ts src/components/TopBar.test.tsx`
Expected: FAIL (the request body has no `lang`; `patchMyLang` was never called).

- [ ] **Step 4: Implement the `ensureGuest` change in `src/state/session.ts`**

Change the `POST /guests` call inside `ensureGuest()` to pass the current language: `request<Guest>('POST', '/guests', { lang: getSession().lang })`.

- [ ] **Step 5: Implement `pickLang` additions**

In `TopBar.tsx`, import `patchMyLang` from `'../state/accounts'` and add it as a third statement in `pickLang`:

```typescript
const pickLang = (l: Lang) => {
  setLang(l)
  setSessionLang(l)
  void patchMyLang(l)
}
```

In `Lobby.tsx`'s `pickLang` (`Lobby.tsx:49-53`) and `Table.tsx`'s `pickLang` (`Table.tsx:44-48`), add the same `void patchMyLang(l)` call alongside the existing room-level `PATCH /rooms/:code/me` call (import `patchMyLang` from `'../state/accounts'` in each file). Leave each file's existing room-level PATCH call untouched — this is an addition, not a replacement.

- [ ] **Step 6: Write and run the equivalent tests for `Lobby.tsx` and `Table.tsx`**

Following `TopBar.test.tsx`'s mocking pattern (`vi.mock('../state/accounts', () => ({ patchMyLang: vi.fn(), ... }))`), add one test per screen asserting `patchMyLang` is called with the picked language when its own language picker's `onChange` fires. If `Lobby.test.tsx`/`Table.test.tsx` don't already exist, create them scoped to this behavior plus whatever minimal rendering setup the screen requires.

Run: `yarn vitest run src/state/session.test.ts src/components/TopBar.test.tsx src/screens/Lobby.test.tsx src/screens/Table.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/session.ts src/components/TopBar.tsx src/screens/Lobby.tsx src/screens/Table.tsx src/state/session.test.ts src/components/TopBar.test.tsx src/screens/Lobby.test.tsx src/screens/Table.test.tsx
git commit -m "feat(spy-hunt): sync every language pick to the account, and seed new guests from the current language"
```

---

## Task 8: Frontend — game history types and API wrapper

**Files:**
- Modify: `src/api/types.ts` (add `GameSummary`, `GameRoleEntry`, `GameDetail`)
- Create: `src/games/api.ts`
- Test: `src/games/api.test.ts`

**Interfaces:**
- Consumes: existing `request` (`src/api/client.ts`), `ensureGuest` (`src/state/session.ts`), existing `Role`, `Lang`, `CreditPart`, `WordsByRole` types.
- Produces: `getMyGames(): Promise<GameSummary[]>`; `getMyGameDetail(roomId: string, gameNo: number): Promise<GameDetail>` (used by Tasks 9 and 10).

- [ ] **Step 1: Write the failing tests**

```typescript
import { getMyGameDetail, getMyGames } from './api'

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

test('getMyGames calls GET /me/games', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply([]))
  await getMyGames()
  expect(String(f.mock.calls.at(-1)?.[0])).toMatch(/\/me\/games$/)
})

test('getMyGameDetail calls GET /me/games/:roomId/:gameNo', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({}))
  await getMyGameDetail('r1', 3)
  expect(String(f.mock.calls.at(-1)?.[0])).toMatch(/\/me\/games\/r1\/3$/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn vitest run src/games/api.test.ts`
Expected: FAIL (`src/games/api.ts` doesn't exist yet).

- [ ] **Step 3: Add the new types to `src/api/types.ts`**

```typescript
export interface GameSummary {
  room_id: string
  game_no: number
  finished_at: number
  winner: 'civilians' | 'spies' | null
  your_role: Role
  won: boolean
  credits_earned: number
}

export interface GameRoleEntry {
  seat: number
  role: Role
  is_bot: boolean
  name: string
  is_you: boolean
  credits_earned?: number
  credit_parts?: CreditPart[]
}

export interface GameDetail {
  finished_at: number
  winner: 'civilians' | 'spies' | null
  lang: Lang
  words: WordsByRole
  roles: GameRoleEntry[]
}
```

- [ ] **Step 4: Implement `src/games/api.ts`**

```typescript
import { request } from '../api/client'
import type { GameDetail, GameSummary } from '../api/types'
import { ensureGuest } from '../state/session'

export async function getMyGames(): Promise<GameSummary[]> {
  await ensureGuest()
  return request<GameSummary[]>('GET', '/me/games')
}

export async function getMyGameDetail(roomId: string, gameNo: number): Promise<GameDetail> {
  await ensureGuest()
  return request<GameDetail>('GET', `/me/games/${roomId}/${gameNo}`)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/games/api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/games/api.ts src/games/api.test.ts
git commit -m "feat(spy-hunt): add GameSummary/GameDetail types and the games API wrapper"
```

---

## Task 9: Frontend — "Recent Games" section on Profile

**Files:**
- Modify: `src/screens/Profile.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json` (new copy keys)
- Test: `src/screens/Profile.test.tsx`

**Interfaces:**
- Consumes: Task 8's `getMyGames` from `src/games/api.ts`.
- Produces: none new.

- [ ] **Step 1: Write the failing test**

In `src/screens/Profile.test.tsx`, add `vi.mock('../games/api', () => ({ getMyGames: vi.fn() }))` alongside the existing credits mock, then:

```typescript
test('shows recent games and links to the detail screen', async () => {
  vi.mocked(getMyGames).mockResolvedValue([
    { room_id: 'r1', game_no: 1, finished_at: 0, winner: 'civilians', your_role: 'civilian', won: true, credits_earned: 20 },
  ])
  render(<Profile />, { wrapper: MemoryRouterWrapper })
  await waitFor(() => {
    expect(screen.getByRole('link', { name: new RegExp(t('profile.gameOutcome.won', { credits: 20 })) }))
      .toHaveAttribute('href', '/games/r1/1')
  })
})
```

(Use whatever router-wrapping helper `Profile.test.tsx` already uses for its existing `<Link>`-rendering tests — mirror that file's existing render setup exactly rather than introducing a new one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/screens/Profile.test.tsx`
Expected: FAIL (no "Recent Games" section rendered yet).

- [ ] **Step 3: Add the copy keys**

Add `profile.recentGames`, `profile.gameOutcome.won`, `profile.gameOutcome.lost` to both `src/i18n/en.json` and `src/i18n/zh-Hans.json`, each taking a `{credits}` interpolation param for the outcome strings (wording is the implementer's call).

- [ ] **Step 4: Implement the section in `Profile.tsx`**

Add imports: `import { Link } from 'react-router-dom'` (if not already imported), `import type { GameSummary } from '../api/types'`, `import { getMyGames } from '../games/api'`. Add state and a fetch effect mirroring the existing `summary`/`getCredits()` effect:

```typescript
const [games, setGames] = useState<GameSummary[] | null>(null)
useEffect(() => {
  let live = true
  getMyGames().then((g) => { if (live) setGames(g) }).catch(() => {})
  return () => { live = false }
}, [])
```

Insert a new section between the existing `<LookEditor .../>` line and the ranks-ladder `<h3>`:

```tsx
{games && games.length > 0 && (
  <section className="recent-games">
    <h3 className="center">{t('profile.recentGames')}</h3>
    <ol className="game-list">
      {games.map((gm) => (
        <li key={`${gm.room_id}-${gm.game_no}`}>
          <Link to={`/games/${gm.room_id}/${gm.game_no}`}>
            {t(`profile.gameOutcome.${gm.won ? 'won' : 'lost'}`, { credits: gm.credits_earned })}
          </Link>
        </li>
      ))}
    </ol>
  </section>
)}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn vitest run src/screens/Profile.test.tsx`
Expected: PASS, including pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Profile.tsx src/screens/Profile.test.tsx src/i18n/en.json src/i18n/zh-Hans.json
git commit -m "feat(spy-hunt): show a Recent Games section on the profile screen"
```

---

## Task 10: Frontend — game detail screen and route

**Files:**
- Create: `src/screens/GameDetail.tsx`
- Modify: `src/routes.tsx` (add the route)
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json` (new copy keys)
- Test: `src/screens/GameDetail.test.tsx`

**Interfaces:**
- Consumes: Task 8's `getMyGameDetail` from `src/games/api.ts`; existing `CreditBurst` (`src/components/CreditBurst.tsx`, props `{ total: number; parts?: CreditPart[] }`); the same `Loader`/`EmptyState` components and loading/error-state pattern `src/screens/MatchPage.tsx` already uses (mirror its imports and `Load` union exactly).
- Produces: route `/games/:roomId/:gameNo` rendering `<GameDetail />`.

- [ ] **Step 1: Write the failing tests**

Mirror `MatchPage.test.tsx`'s structure (loading / not-found / error / success states), mocking `src/games/api.ts`'s `getMyGameDetail`:

```typescript
vi.mock('../games/api', () => ({ getMyGameDetail: vi.fn() }))

test('renders every seat, the words, and the winner banner on success', async () => {
  vi.mocked(getMyGameDetail).mockResolvedValue({
    finished_at: 0, winner: 'civilians', lang: 'en',
    words: { civilian: 'apple', spy: 'pear' },
    roles: [
      { seat: 1, role: 'civilian', is_bot: false, name: 'Ann', is_you: true, credits_earned: 20, credit_parts: [{ kind: 'played', n: 10 }, { kind: 'won', n: 10 }] },
      { seat: 2, role: 'spy', is_bot: false, name: 'Bob', is_you: false },
    ],
  })
  render(<GameDetail />, { wrapper: /* route at /games/r1/1, same as MatchPage.test.tsx's /match/:id wrapper */ })
  expect(await screen.findByText('Ann:')).toBeInTheDocument()
  expect(screen.getByText('Bob:')).toBeInTheDocument()
})

test('shows a not-found state for an unknown game', async () => {
  vi.mocked(getMyGameDetail).mockRejectedValue(new ApiError(404, 'not_found'))
  render(<GameDetail />, { wrapper: /* same as above */ })
  expect(await screen.findByText(/* MatchPage's not-found copy key, mirrored */)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn vitest run src/screens/GameDetail.test.tsx`
Expected: FAIL (`src/screens/GameDetail.tsx` doesn't exist yet).

- [ ] **Step 3: Add the copy keys**

Add `profile.gameDetail.title` to both `src/i18n/en.json` and `src/i18n/zh-Hans.json` (wording is the implementer's call); reuse the existing `arena.role.spy`/`arena.role.civilian`, `arena.match.words`, `arena.match.winner.*` keys as-is (same i18n keys `MatchPage.tsx`'s reveal section already uses — no new keys needed for those).

- [ ] **Step 4: Implement `src/screens/GameDetail.tsx`**

Model it on `MatchPage.tsx`: same `Load` union shape (`loading` / `ok` / `notFound` / `error`), same `useParams`/`useEffect`/retry-`attempt` pattern, fetching with `getMyGameDetail(roomId, Number(gameNo))` instead of `getMatch(id)`. Render only the reveal-equivalent section (no round/statement/vote sections — there's no replay data for this feature):

```tsx
<section className="card match-reveal">
  <h3>{t('profile.gameDetail.title')}</h3>
  {detail.roles.map((r) => (
    <p key={r.seat} className={`reveal-line wrap${r.is_you ? ' is-you' : ''}`}>
      <span>{r.name}:</span> <span className={`role ${r.role}`}>{t(`arena.role.${r.role}`)}</span>
    </p>
  ))}
  <p>{t('arena.match.words', detail.words)}</p>
  <p className="winner-banner">{t(`arena.match.winner.${detail.winner}`)}</p>
</section>
{detail.roles.filter((r) => r.is_you).map((r) => (
  <CreditBurst key={r.seat} total={r.credits_earned ?? 0} parts={r.credit_parts} />
))}
<Link to="/me" className="btn center">{t('bots.home')}</Link>
```

- [ ] **Step 5: Add the route in `src/routes.tsx`**

Add `/games/:roomId/:gameNo` → `<GameDetail />`, mirroring the existing `/match/:id` → `<MatchPage />` route's structure exactly.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn vitest run src/screens/GameDetail.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full frontend suite**

Run: `yarn test`
Expected: all PASS (no regression anywhere else).

- [ ] **Step 8: Commit**

```bash
git add src/screens/GameDetail.tsx src/routes.tsx src/screens/GameDetail.test.tsx src/i18n/en.json src/i18n/zh-Hans.json
git commit -m "feat(spy-hunt): add the game-detail screen and its route"
```
