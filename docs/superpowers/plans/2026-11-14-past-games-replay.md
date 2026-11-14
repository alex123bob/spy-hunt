# Past Games Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For human room games finished after this ships, let a player see the round-by-round statements and votes of their own past games, the way `MatchPage.tsx` already does for bot arena matches.

**Architecture:** At the existing `_finish()` hook, snapshot the game's `messages`/`votes` rows into a new `room_replays.log_json` column (same shape/precedent as `arena_matches.log_json`), independently of the existing `room_results` history write. A new authenticated endpoint reads that snapshot back; the frontend renders it on `GameDetail.tsx` below the existing reveal section, reusing `MatchPage.tsx`'s round-grouping and the existing `StatementBubble` component. A nightly job prunes replays older than 30 days; `room_results` is untouched.

**Tech Stack:** Python (Flask, sqlite3) backend in PP-AI-Service; TypeScript/React frontend in spy-hunt.

**Spec:** `docs/superpowers/specs/2026-11-14-past-games-replay-design.md`

## Global Constraints

- No change to `_finish()`'s existing `game_over` event payload or to its three existing side-effect calls (bots, clans, credits) — the replay write is a fourth, independent addition.
- No new backend dependency; same SQLite DB (`PP-AI-Service/ai_svc/spy_hunt/db.py`), same idempotent `CREATE TABLE IF NOT EXISTS` / `PRAGMA table_info` migration style already used there.
- A replay write failure must never block the room from finishing (same savepoint-isolation pattern the existing `history.record_game()` call already uses in `game.py:274-285`).
- Retention: `room_replays` rows are pruned 30 days after `created_at`; `room_results`/`room_result_players` keep today's indefinite retention, untouched.
- Scope: new games only. No backfill for games finished before this ships.
- Translations stored in full: every row already present in `translations` for a captured message at `_finish()` time, not just one viewer's language.
- zh-Hans and en copy for every new user-facing string.
- Never expose another human player's raw `player_id` in the replay response (same rule `history.game_detail()` already follows via `is_you`).
- `room_replays` schema: `log_json` statements include `kind` (`"statement"|"skipped"|"host"`) and nullable `seat`; `words` is the per-language `{"civilian": {lang: word}, "spy": {lang: word}}` shape (`visibility._pair_words()`'s own shape), not a flat pair.

## Review Focus

- A game with zero statements/votes (e.g. the game ended on round 1 with no messages at all) — the replay endpoint must return an empty `rounds: []`, not error, and the frontend must render nothing broken.
- A statement with `seat = NULL` (host narration) — grouping/rendering code must not crash on a null seat when looking up a player name.
- A message whose `kind` is `'skipped'` (`text` is `NULL` in the DB) — `log_json` must carry `text: null` safely through `json.dumps`/`json.loads` and the frontend's `StatementBubble` (which already branches on `kind === 'skipped'` before touching `text`).
- A non-participant (or logged-out) request to the new replay endpoint for a real `(room_id, game_no)` — must 404, identical to the existing detail endpoint's behavior for a foreign game, never leak statements/votes.
- A replay row older than 30 days (pruned) or from a game finished before this feature shipped (no row ever written) — the endpoint 404s and `GameDetail.tsx` must fall back to rendering exactly what it renders today, with no broken layout or stuck loading state.

---

## Task 1: `room_replays` table and migration

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/db.py` (schema + `init_db`)
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_db.py` (create if it doesn't already cover schema; otherwise add to the existing migration test file — check first)

**Interfaces:**
- Produces: table `room_replays(room_id TEXT, game_no INTEGER, log_json TEXT, created_at INTEGER, PRIMARY KEY(room_id, game_no))`.

- [ ] **Step 1: Check for an existing schema/migration test file**

Run: `grep -rl "CREATE TABLE IF NOT EXISTS\|init_db" PP-AI-Service/ai_svc/spy_hunt/tests/*.py | xargs grep -l "def test_" | head -5`

Pick an existing file that already tests `init_db()`/schema idempotency (e.g. a `test_db.py`-like file) to add the new test into; if none exists, create `PP-AI-Service/ai_svc/spy_hunt/tests/test_db.py`.

- [ ] **Step 2: Write the failing test**

```python
def test_init_db_creates_room_replays_table(conn):
    conn.execute("INSERT INTO room_replays(room_id, game_no, log_json, created_at) VALUES (?,?,?,?)",
                 ("r1", 1, "{}", 0))
    row = conn.execute("SELECT log_json FROM room_replays WHERE room_id=? AND game_no=?",
                       ("r1", 1)).fetchone()
    assert row["log_json"] == "{}"


def test_init_db_is_idempotent_with_room_replays(conn):
    from ai_svc.spy_hunt import db
    db.init_db()
    db.init_db()  # must not raise
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_db.py -v -k room_replays`
Expected: FAIL with "no such table: room_replays"

- [ ] **Step 4: Add the table to `SCHEMA` in `db.py`**

Add after the existing `room_result_players`/index block (`db.py:108-111`):

```sql
CREATE TABLE IF NOT EXISTS room_replays(
  room_id TEXT, game_no INTEGER, log_json TEXT, created_at INTEGER,
  PRIMARY KEY(room_id, game_no));
```

`CREATE TABLE IF NOT EXISTS` already makes this idempotent across `init_db()` calls, matching every other table in `SCHEMA` — no `PRAGMA table_info` column-migration needed since this is a brand-new table, not an added column.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_db.py -v -k room_replays`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai_svc/spy_hunt/db.py ai_svc/spy_hunt/tests/test_db.py
git commit -m "feat: add room_replays table"
```

---

## Task 2: `history.build_replay_log` — query messages/votes into arena-shaped `log_json`

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/history.py`
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_history.py`

**Interfaces:**
- Consumes: `conn` (sqlite3 connection), `room` (the `rooms` row mapping already passed into `record_game`, same as `game.py:277`'s `room`), `rows` (the `players` rows for this room, same shape `record_game` already takes — each row has `seat`, `role`, `is_bot`, `name`, `player_id`), `words` (the `{"civilian": {lang: word}, "spy": {lang: word}}` dict already computed by `visibility._pair_words()` and already passed into `record_game`), `winner` (`str | None`).
- Produces: `build_replay_log(conn, room, rows, words, winner) -> dict`, returning the `log_json`-shaped dict described below. Used by Task 3's `record_game` change.

- [ ] **Step 1: Write the failing test**

```python
def test_build_replay_log_groups_statements_and_votes_by_round(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    conn.execute("INSERT INTO messages(room_id, game_no, round, stage, seat, kind, text, lang, created_at)"
                 " VALUES (?,1,1,0,0,'statement','hi','en',0)", (rid,))
    conn.execute("INSERT INTO votes(room_id, game_no, round, stage, voter_seat, target_seat)"
                 " VALUES (?,1,1,0,0,1)", (rid,))
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {"civilian": {"en": "tea"}, "spy": {"en": "coffee"}}, "civilians")
    assert log["rounds"] == [{
        "round": 1, "eliminated": None,
        "statements": [{"seat": 0, "stage": 0, "kind": "statement", "text": "hi", "lang": "en", "translations": {}}],
        "votes": [{"voter": 0, "target": 1, "stage": 0}],
    }]
    assert log["words"] == {"civilian": {"en": "tea"}, "spy": {"en": "coffee"}}
    assert log["winner"] == "civilians"
    assert log["players"] == [
        {"seat": 0, "name": "P0", "is_bot": False, "role": "civilian"},
        {"seat": 1, "name": "P1", "is_bot": False, "role": "spy"},
    ]


def test_build_replay_log_includes_translations(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    cur = conn.execute("INSERT INTO messages(room_id, game_no, round, stage, seat, kind, text, lang, created_at)"
                       " VALUES (?,1,1,0,0,'statement','hi','en',0)", (rid,))
    conn.execute("INSERT INTO translations(message_id, target_lang, text) VALUES (?,?,?)",
                 (cur.lastrowid, "zh-Hans", "你好"))
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {}, None)
    assert log["rounds"][0]["statements"][0]["translations"] == {"zh-Hans": "你好"}


def test_build_replay_log_sets_eliminated_from_alive_transition(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    conn.execute("UPDATE players SET alive=0 WHERE room_id=? AND seat=1", (rid,))
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    conn.execute("INSERT INTO votes(room_id, game_no, round, stage, voter_seat, target_seat)"
                 " VALUES (?,1,1,0,0,1)", (rid,))
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {}, "civilians")
    assert log["rounds"][0]["eliminated"] == 1


def test_build_replay_log_does_not_credit_an_early_nobody_round_with_a_later_elimination(conn):
    """Seat 2 gets a stray vote in round 1 (3-way split, nobody eliminated), then is
    actually voted out in round 2. A naive players.alive-based heuristic would wrongly
    mark round 1 as seat 2's elimination round, since alive=0 only reflects final state."""
    rid = make_room([("a", False, "civilian"), ("b", False, "civilian"), ("c", False, "spy")])
    conn.execute("UPDATE players SET alive=0 WHERE room_id=? AND seat=2", (rid,))
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    # Round 1: votes split 0->1, 1->2, 2->0 -- no majority, nobody eliminated.
    for voter, target in ((0, 1), (1, 2), (2, 0)):
        conn.execute("INSERT INTO votes(room_id, game_no, round, stage, voter_seat, target_seat)"
                     " VALUES (?,1,1,0,?,?)", (rid, voter, target))
    # Round 2: both survivors vote out seat 2.
    for voter, target in ((0, 2), (1, 2)):
        conn.execute("INSERT INTO votes(room_id, game_no, round, stage, voter_seat, target_seat)"
                     " VALUES (?,1,2,0,?,?)", (rid, voter, target))
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {}, "civilians")
    assert log["rounds"][0]["eliminated"] is None
    assert log["rounds"][1]["eliminated"] == 2


def test_build_replay_log_handles_a_game_with_no_messages_or_votes(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {}, None)
    assert log["rounds"] == []


def test_build_replay_log_carries_null_seat_and_null_text_for_host_and_skipped(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    room = dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    conn.execute("INSERT INTO messages(room_id, game_no, round, stage, seat, kind, text, lang, created_at)"
                 " VALUES (?,1,1,0,NULL,'host','welcome','en',0)", (rid,))
    conn.execute("INSERT INTO messages(room_id, game_no, round, stage, seat, kind, text, lang, created_at)"
                 " VALUES (?,1,1,0,0,'skipped',NULL,'en',1)", (rid,))
    rows = conn.execute("SELECT * FROM players WHERE room_id=? ORDER BY seat", (rid,)).fetchall()
    log = history.build_replay_log(conn, room, rows, {}, None)
    kinds = {s["kind"]: s for s in log["rounds"][0]["statements"]}
    assert kinds["host"]["seat"] is None and kinds["host"]["text"] == "welcome"
    assert kinds["skipped"]["seat"] == 0 and kinds["skipped"]["text"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v -k build_replay_log`
Expected: FAIL with "AttributeError: module 'history' has no attribute 'build_replay_log'"

- [ ] **Step 3: Implement `build_replay_log(conn, room, rows, words, winner) -> dict` in `history.py`**

Query `messages` and `votes` for `(room["id"], room["game_no"])`, ordered by `round`, then `stage`, then `id`/rowid for stable ordering within a stage. Group into the per-round `{"round", "statements", "votes", "eliminated"}` shape (same field names arena's `arena.py:156,167,173,182` already use). For each message row, left-join `translations` filtered to that `message_id` and build `translations: {target_lang: text, ...}` from all matching rows (not just one viewer's language — this is the "full" translation storage decision).

`eliminated` for a round is **not** derivable from `players.alive`, which only reflects each seat's *final*, end-of-game status — a seat can receive stray votes in an early round that resolves to "nobody" (votes split with no majority) and only actually die in a later round; crediting the first round a seat appears as a target would attribute the elimination to the wrong round. Instead, replay `engine.resolve_vote` (already a pure function, no DB access) round by round, in ascending round order, using the stored `votes` rows as the only source of truth:

- Track `alive: set[int]` (all seats, minus any seat already resolved as eliminated in an earlier round) and `eliminated_order: dict[round, int|None]`.
- For each round: take that round's `votes` filtered to `stage == 0` as `{voter: target}`, call `engine.resolve_vote(votes0, 0, sorted(alive), None)`.
  - If `outcome == "tiebreak"`: take that round's `votes` filtered to `stage == 1` as `{voter: target}`, call `engine.resolve_vote(votes1, 1, sorted(alive), res0.tied)`; that call's `.eliminated` (`None` if `"nobody"`) is the round's `eliminated`.
  - Otherwise: `res0.eliminated` (`None` if `"nobody"`) is the round's `eliminated`.
- If a round's `eliminated` is not `None`, remove that seat from `alive` before processing the next round.

This exactly mirrors how `arena.py:174-182`'s `play_match` already derives `entry["eliminated"]` live, just replayed from persisted rows instead of computed during play. `players`/`words`/`winner` pass straight through from the arguments, shaped as:

```python
{
  "players": [{"seat": r["seat"], "name": r["name"], "is_bot": bool(r["is_bot"]), "role": r["role"]} for r in rows],
  "rounds": [...],
  "words": words,
  "winner": winner,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v -k build_replay_log`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai_svc/spy_hunt/history.py ai_svc/spy_hunt/tests/test_history.py
git commit -m "feat: build replay log_json from messages and votes"
```

---

## Task 3: Write `room_replays` at `_finish()` time

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/history.py` (`record_game`)
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_history.py`

**Interfaces:**
- Consumes: Task 2's `build_replay_log(conn, room, rows, words, winner) -> dict`.
- Produces: `record_game()` now also writes one row to `room_replays`; no signature change (still `record_game(conn, room, rows, winner, words, parts)`, called from `game.py:277` exactly as today — `_finish()` itself needs no change).

- [ ] **Step 1: Write the failing test**

```python
def test_record_game_writes_a_room_replays_row(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    conn.execute("INSERT INTO messages(room_id, game_no, round, stage, seat, kind, text, lang, created_at)"
                 " VALUES (?,1,1,0,0,'statement','hi','en',0)", (rid,))
    finish(rid, "civilians")
    row = conn.execute("SELECT log_json FROM room_replays WHERE room_id=?", (rid,)).fetchone()
    assert row is not None
    log = json.loads(row["log_json"])
    assert log["rounds"][0]["statements"][0]["text"] == "hi"


def test_record_game_replay_write_is_idempotent_on_retried_finish(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    rows = conn.execute("SELECT * FROM players WHERE room_id=?", (rid,)).fetchall()
    with store.tx(rid) as c:
        history.record_game(c, dict(conn.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone()),
                            rows, "civilians", {}, {})
    assert conn.execute("SELECT COUNT(*) FROM room_replays WHERE room_id=?", (rid,)).fetchone()[0] == 1


def test_finish_still_succeeds_when_replay_write_raises(conn, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("boom")
    monkeypatch.setattr(history, "build_replay_log", boom)
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    assert conn.execute("SELECT status FROM rooms WHERE id=?", (rid,)).fetchone()[0] == "finished"
    # The surrounding SAVEPOINT in game.py rolls back the whole record_game
    # call on any failure inside it, including the room_results insert that
    # already ran earlier in this same call — the room still finishes, but
    # neither row exists for this game.
    assert conn.execute("SELECT COUNT(*) FROM room_results WHERE room_id=?", (rid,)).fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM room_replays WHERE room_id=?", (rid,)).fetchone()[0] == 0
```

Add `import json` to the test file's imports if not already present (it's used elsewhere in `test_history.py` already — check).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v -k room_replays`
Expected: FAIL (no row written / no such table reference in `record_game` yet — table exists from Task 1, but `record_game` doesn't write to it)

- [ ] **Step 3: Extend `record_game` in `history.py`**

Inside the existing `record_game(conn, room, rows, winner, words, parts)` (`history.py:9-28`), after the existing `room_results` insert, add:

```python
log = build_replay_log(conn, room, rows, words, winner)
conn.execute(
    "INSERT OR IGNORE INTO room_replays(room_id, game_no, log_json, created_at) VALUES (?,?,?,?)",
    (room["id"], room["game_no"], json.dumps(log), now))
```

Reuse the same `now` already computed at the top of `record_game` (`history.py:13`). `INSERT OR IGNORE` for the same idempotency-on-retry reason the other two inserts already use it. This call sits inside the same `conn.execute("SAVEPOINT history")` block `game.py:275-285` already wraps around `record_game` — no change needed there. A failure in `build_replay_log` (or its insert) propagates out of `record_game` the same way a failure in the existing `room_results`/`room_result_players` inserts already does, so `game.py`'s existing `ROLLBACK TO history` undoes the *entire* `record_game` call for that game, including the `room_results` insert that ran earlier in the same call (a savepoint rollback undoes everything since the savepoint, not just the statement that raised) — the room still finishes normally, it simply has no history or replay row for that game, same net behavior the existing `test_a_failed_history_write_leaves_no_partial_rows` test already documents for a failure elsewhere in the function.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: PASS (all history tests, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add ai_svc/spy_hunt/history.py ai_svc/spy_hunt/tests/test_history.py
git commit -m "feat: persist replay log at game finish"
```

---

## Task 4: `history.replay_for` read + `history.prune_replays`

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/history.py`
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_history.py`

**Interfaces:**
- Produces: `replay_for(player_id: str, room_id: str, game_no: int) -> Optional[Dict[str, Any]]`. Returns `None` if no replay row exists or the player wasn't a participant (same participant check `game_detail` already does at `history.py:49-51`). On success, returns `log_json` deserialized with `players` entries carrying an added `is_you: bool` key (parallel to how `game_detail`'s `roles` already carries `is_you`), and no `player_id` anywhere in the payload (none was ever stored in `log_json` — `build_replay_log`'s `players` list only has `seat`/`name`/`is_bot`/`role`, so nothing to strip).
- Produces: `prune_replays(conn, keep_days: int = 30) -> int`, deletes `room_replays` rows with `created_at` older than `keep_days` days before "now" and returns the count deleted (mirrors `arena.prune()`'s return-count convention, `arena.py:287-294`, but keyed on milliseconds elapsed rather than a UTC day string, since `room_replays.created_at` is `now_ms()`-style milliseconds like `room_results.finished_at`, not a `day` string like `arena_matches.day`).

- [ ] **Step 1: Write the failing tests**

```python
def test_replay_for_returns_the_stored_log_with_is_you(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    replay = history.replay_for("a", rid, _game_no(conn, rid))
    me = next(p for p in replay["players"] if p["is_you"])
    other = next(p for p in replay["players"] if not p["is_you"])
    assert me["role"] == "civilian"
    assert "player_id" not in me and "player_id" not in other


def test_replay_for_returns_none_for_a_non_participant(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    assert history.replay_for("stranger", rid, _game_no(conn, rid)) is None


def test_replay_for_returns_none_when_no_replay_row_exists(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    conn.execute("DELETE FROM room_replays WHERE room_id=?", (rid,))
    assert history.replay_for("a", rid, _game_no(conn, rid)) is None


def test_prune_replays_deletes_rows_past_the_keep_window(conn, monkeypatch):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    old_ms = int(time.time() * 1000) - 31 * 86_400_000
    conn.execute("UPDATE room_replays SET created_at=? WHERE room_id=?", (old_ms, rid))
    deleted = history.prune_replays(conn, keep_days=30)
    assert deleted == 1
    assert conn.execute("SELECT COUNT(*) FROM room_replays WHERE room_id=?", (rid,)).fetchone()[0] == 0


def test_prune_replays_keeps_rows_inside_the_keep_window(conn):
    rid = make_room([("a", False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    deleted = history.prune_replays(conn, keep_days=30)
    assert deleted == 0
    assert conn.execute("SELECT COUNT(*) FROM room_replays WHERE room_id=?", (rid,)).fetchone()[0] == 1
```

Add `import time` to the test file if not already imported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v -k "replay_for or prune_replays"`
Expected: FAIL with "AttributeError"

- [ ] **Step 3: Implement `replay_for` and `prune_replays` in `history.py`**

`replay_for` follows `game_detail`'s existing structure (`history.py:44-69`): validate `game_no` bounds the same way (`0 <= game_no <= 2**62`), check participation via `room_result_players` (same query `game_detail` already runs), fetch `room_replays.log_json`, `json.loads` it, and map `is_you` onto each `players` entry by comparing that entry's `seat` against the requesting player's seat (looked up from the same `room_result_players` row used for the participation check).

`prune_replays`:

```python
def prune_replays(conn, keep_days: int = 30) -> int:
    cutoff = int(time.time() * 1000) - keep_days * 86_400_000
    ids = conn.execute("SELECT room_id, game_no FROM room_replays WHERE created_at < ?", (cutoff,)).fetchall()
    conn.execute("DELETE FROM room_replays WHERE created_at < ?", (cutoff,))
    conn.commit()
    return len(ids)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai_svc/spy_hunt/history.py ai_svc/spy_hunt/tests/test_history.py
git commit -m "feat: add replay_for lookup and prune_replays cleanup"
```

---

## Task 5: `GET /me/games/<room_id>/<game_no>/replay` endpoint

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/routes.py`
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_history.py`

**Interfaces:**
- Consumes: Task 4's `history.replay_for(player_id, room_id, game_no)`.
- Produces: route `GET /api/spy-hunt/me/games/<room_id>/<int:game_no>/replay`, JSON response `{"players": [...], "rounds": [...], "words": {...}, "winner": ...}` or `404 not_found`.

- [ ] **Step 1: Write the failing tests**

```python
def test_replay_route_requires_auth(client):
    assert client.get("/api/spy-hunt/me/games/r/1/replay").status_code == 401


def test_replay_route_404s_for_a_foreign_game(client):
    guest = _make_guest(client)
    r = client.get("/api/spy-hunt/me/games/no-such-room/1/replay", headers=_auth_header(guest))
    assert r.status_code == 404


def test_replay_route_returns_the_log_for_a_participant(conn, client):
    guest = _make_guest(client)
    rid = make_room([(guest["player_id"], False, "civilian"), ("b", False, "spy")])
    finish(rid, "civilians")
    r = client.get(f"/api/spy-hunt/me/games/{rid}/{_game_no(conn, rid)}/replay", headers=_auth_header(guest))
    assert r.status_code == 200
    assert "rounds" in r.get_json()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v -k replay_route`
Expected: FAIL with 404 (route doesn't exist / Flask's own 404, not `store.StoreError`'s)

- [ ] **Step 3: Add the route in `routes.py`**

Immediately after the existing `my_game_detail` route (`routes.py:75-83`):

```python
@spy_hunt_bp.route("/me/games/<room_id>/<int:game_no>/replay", methods=["GET"])
@ratelimits.limit("flood")
@auth.require_guest
@ratelimits.limit("read")
def my_game_replay(room_id: str, game_no: int):
    replay = history.replay_for(g.player_id, room_id, game_no)
    if replay is None:
        raise store.StoreError(404, "not_found", "No such game.")
    return jsonify(replay)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_history.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai_svc/spy_hunt/routes.py ai_svc/spy_hunt/tests/test_history.py
git commit -m "feat: add GET /me/games/:roomId/:gameNo/replay endpoint"
```

---

## Task 6: Wire `prune_replays` into the nightly script

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/scripts/arena_night.py`
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_arena_night.py` (or a new small test file for the script's `main`, if the existing one only tests `arena.run_night` directly — check first)

**Interfaces:**
- Consumes: Task 4's `history.prune_replays(conn, keep_days=30)`.

- [ ] **Step 1: Check how `arena_night.py`'s `main()` is currently tested**

Run: `grep -n "arena_night\|temp_db" PP-AI-Service/ai_svc/spy_hunt/tests/test_arena_night.py`

Find the existing `test_arena_night_script_main`-style test: it takes the `temp_db` fixture (DB isolation in this suite is opt-in, not autouse — `tests/conftest.py`), and `main()`'s body does a local `from ai_svc.spy_hunt import arena, db` on every call (`arena_night.py:18`), so `arena` is rebound fresh each call and cannot be usefully monkeypatched by setting an attribute on the `arena_night` module. Follow the existing test's pattern (take `temp_db`, and patch `history.prune_replays`/`arena.run_night` as module-level attributes on `ai_svc.spy_hunt.history`/`ai_svc.spy_hunt.arena` respectively, not as attributes on `arena_night`) rather than the snippet below verbatim.

- [ ] **Step 2: Write the failing test**

```python
def test_main_calls_prune_replays(temp_db, monkeypatch):
    from ai_svc.spy_hunt import arena, history
    from ai_svc.spy_hunt.scripts import arena_night
    calls = []
    monkeypatch.setattr(history, "prune_replays", lambda conn, **k: calls.append(1) or 0)
    monkeypatch.setattr(arena, "run_night",
                        lambda *a, **k: {"played": 0, "discarded": 0, "skipped": 0})
    arena_night.main(["--matches", "0"])
    assert calls == [1]
```

This patches `history.prune_replays` and `arena.run_night` as attributes on the `history`/`arena` modules themselves (which `main()`'s local imports resolve against at call time, since `from X import Y` still looks up `Y` as an attribute of module `X` at the moment of that `import` statement) rather than on `arena_night`, avoiding the import-rebinding problem.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_arena_night.py -v -k prune_replays`
Expected: FAIL (`history.prune_replays` never called)

- [ ] **Step 4: Call `history.prune_replays` from `main()`**

In `arena_night.py`'s `main()`, after the existing `res = arena.run_night(...)` call and before the `print(...)` line:

```python
from ai_svc.spy_hunt import history
history.prune_replays(db.get_conn())
```

This is a sibling call to `arena.run_night()`, not a change inside `arena.py` — keeps `arena.py` from needing to import `history`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests/test_arena_night.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai_svc/spy_hunt/scripts/arena_night.py ai_svc/spy_hunt/tests/test_arena_night.py
git commit -m "feat: prune old replay logs in the nightly script"
```

---

## Task 7: Frontend types and API call

**Files:**
- Modify: `spy-hunt/src/api/types.ts`
- Modify: `spy-hunt/src/games/api.ts`
- Test: `spy-hunt/src/games/api.test.ts` (create if no existing test file covers `games/api.ts`; check first — `getMyGames`/`getMyGameDetail` may already be tested elsewhere, e.g. indirectly via `Profile.test.tsx`/`GameDetail.test.tsx`; if so, add the new test alongside using the same mocking pattern those use for `request`)

**Interfaces:**
- Produces: `interface ReplayStatement { seat: number | null; stage: number; kind: 'statement' | 'skipped' | 'host'; text: string | null; lang: Lang | null; translations: Partial<Record<Lang, string>> }`, `interface ReplayRound { round: number; statements: ReplayStatement[]; votes: { voter: number; target: number | null; stage: number }[]; eliminated: number | null }`, `interface ReplayPlayer { seat: number; name: string; is_bot: boolean; role: Role; is_you: boolean }`, `interface GameReplay { players: ReplayPlayer[]; rounds: ReplayRound[]; words: WordsByRole; winner: 'civilians' | 'spies' | null }`.
- Produces: `getMyGameReplay(roomId: string, gameNo: number): Promise<GameReplay>`, hitting `GET /me/games/${roomId}/${gameNo}/replay`, returning `null` on a 404 rather than throwing (parallel to how `GameDetail.tsx`'s existing `Load` type already distinguishes `'notFound'` from `'error'` by inspecting `ApiError`/`status === 404` at the call site — so this function itself should still throw `ApiError` on 404, matching `getMyGameDetail`'s existing contract, and the calling component inspects the error the same way `GameDetail.tsx:28-29` already does for the main detail fetch).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { getMyGameReplay } from './api'
import { request } from '../api/client'

vi.mock('../api/client', () => ({ request: vi.fn() }))
vi.mock('../state/session', () => ({ ensureGuest: vi.fn() }))

describe('getMyGameReplay', () => {
  it('fetches the replay for a room and game number', async () => {
    const replay = { players: [], rounds: [], words: { civilian: {}, spy: {} }, winner: null }
    ;(request as any).mockResolvedValue(replay)
    const result = await getMyGameReplay('room1', 3)
    expect(request).toHaveBeenCalledWith('GET', '/me/games/room1/3/replay')
    expect(result).toEqual(replay)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd spy-hunt && npx vitest run src/games/api.test.ts`
Expected: FAIL with "getMyGameReplay is not a function" (or module has no export)

- [ ] **Step 3: Add the types to `types.ts`**

Add after `GameDetail` (`types.ts:254-260`):

```typescript
export interface ReplayStatement {
  seat: number | null
  stage: number
  kind: 'statement' | 'skipped' | 'host'
  text: string | null
  lang: Lang | null
  translations: Partial<Record<Lang, string>>
}
export interface ReplayRound {
  round: number
  statements: ReplayStatement[]
  votes: { voter: number; target: number | null; stage: number }[]
  eliminated: number | null
}
export interface ReplayPlayer { seat: number; name: string; is_bot: boolean; role: Role; is_you: boolean }
export interface GameReplay {
  players: ReplayPlayer[]
  rounds: ReplayRound[]
  words: WordsByRole
  winner: 'civilians' | 'spies' | null
}
```

- [ ] **Step 4: Add `getMyGameReplay` to `games/api.ts`**

```typescript
export async function getMyGameReplay(roomId: string, gameNo: number): Promise<GameReplay> {
  await ensureGuest()
  return request<GameReplay>('GET', `/me/games/${roomId}/${gameNo}/replay`)
}
```

Add `GameReplay` to the existing `import type { GameDetail, GameSummary } from '../api/types'` line.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd spy-hunt && npx vitest run src/games/api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/games/api.ts src/games/api.test.ts
git commit -m "feat: add GameReplay type and getMyGameReplay API call"
```

---

## Task 8: Render the replay section on `GameDetail.tsx`

**Files:**
- Modify: `spy-hunt/src/screens/GameDetail.tsx`
- Modify: `spy-hunt/src/i18n/en.json`, `spy-hunt/src/i18n/zh-Hans.json`
- Test: `spy-hunt/src/screens/GameDetail.test.tsx`

**Interfaces:**
- Consumes: Task 7's `getMyGameReplay(roomId, gameNo) -> Promise<GameReplay>`, and the existing `StatementBubble` component (`src/components/StatementBubble.tsx`), which takes `{ message: Message; name: string; viewerLang: Lang; mine?: boolean; avatar?: ... }`. Building a `Message` for replay from a `ReplayStatement` maps: `id` → any stable synthetic value (e.g. `round * 1000 + index`, since `Message.id` isn't used for anything but the React `key` here), `created_at` → `0` (unused by `StatementBubble`, but `Message.created_at` is a required `number` field so it must be supplied), `round`/`stage`/`seat`/`kind`/`text`/`lang` pass straight through, `translations` passes straight through (the `Message` type already has a `translations?: Partial<Record<Lang, string>>` field — no `translation` singular field needed since replay never needs the live-SSE-merge path `roomStore.ts` uses). The seat→name lookup helper ported from `MatchPage.tsx:50` (`const name = (seat: number) => bySeat.get(seat)?.name ?? String(seat)`) must be widened to accept `seat: number | null` (returning e.g. `''` for `null`, since a `null`-seat statement is host narration, which `StatementBubble` already renders with a fixed `"Host"` label instead of calling `name` at all per its own `kind === 'host'` branch — so the widened signature just needs to not throw a TS error on a `null` argument, not produce a meaningful string for it).

- [ ] **Step 1: Write the failing test**

```typescript
it('shows a replay section with statements and votes when a replay exists', async () => {
  ;(getMyGameDetail as any).mockResolvedValue(detail())
  ;(getMyGameReplay as any).mockResolvedValue({
    players: [{ seat: 0, name: 'Alice', is_bot: false, role: 'civilian', is_you: true }],
    rounds: [{
      round: 1,
      statements: [{ seat: 0, stage: 0, kind: 'statement', text: 'hi there', lang: 'en', translations: {} }],
      votes: [{ voter: 0, target: null, stage: 0 }],
      eliminated: null,
    }],
    words: { civilian: { en: 'tea' }, spy: { en: 'coffee' } },
    winner: 'civilians',
  })
  render(tree)
  expect(await screen.findByText('hi there')).toBeTruthy()
})

it('renders without a replay section when no replay exists (404)', async () => {
  ;(getMyGameDetail as any).mockResolvedValue(detail())
  ;(getMyGameReplay as any).mockRejectedValue(new ApiError(404, 'not_found', 'none'))
  render(tree)
  expect(await screen.findByText(/.+/)).toBeTruthy()  // page still renders the existing reveal section
  expect(screen.queryByText('hi there')).toBeNull()
})

it('renders a host statement (null seat) without crashing', async () => {
  ;(getMyGameDetail as any).mockResolvedValue(detail())
  ;(getMyGameReplay as any).mockResolvedValue({
    players: [{ seat: 0, name: 'Alice', is_bot: false, role: 'civilian', is_you: true }],
    rounds: [{
      round: 1,
      statements: [{ seat: null, stage: 0, kind: 'host', text: 'round begins', lang: 'en', translations: {} }],
      votes: [],
      eliminated: null,
    }],
    words: { civilian: { en: 'tea' }, spy: { en: 'coffee' } },
    winner: 'civilians',
  })
  render(tree)
  expect(await screen.findByText('round begins')).toBeTruthy()
})
```

Check the existing `GameDetail.test.tsx`'s exact mocking setup (its `vi.mock('../games/api', ...)` call and `detail()` helper) and match that file's conventions rather than introducing a new pattern — add `getMyGameReplay: vi.fn()` to the existing mock factory for `'../games/api'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd spy-hunt && npx vitest run src/screens/GameDetail.test.tsx`
Expected: FAIL (no replay section rendered / `getMyGameReplay` not called)

- [ ] **Step 3: Add i18n strings**

Add to both `en.json` and `zh-Hans.json`, near the existing `profile.gameDetail.*`/`arena.match.*` keys:

- `profile.gameDetail.replayTitle`: en `"Replay"`, zh-Hans `"回放"`.

No other new strings are needed — the replay section reuses `arena.match.round`, `arena.match.tiebreak`, `arena.match.vote`, `arena.match.abstain`, `arena.match.out`, `arena.match.nobody`, and `table.skipped`/`table.host` (via `StatementBubble`), all of which already exist.

- [ ] **Step 4: Implement the replay section in `GameDetail.tsx`**

Fetch the replay in a second `useEffect` keyed on `[roomId, gameNo, attempt]`, alongside the existing detail fetch, storing it in its own state (`{ kind: 'loading' | 'ok' | 'none' }`, where `'none'` covers both a 404 and any other error — never block the page on this fetch). When `kind === 'ok'`, render a new `<section className="card match-round">`-styled block (reusing `MatchPage.tsx`'s existing round/stage-grouping logic at `MatchPage.tsx:63-88`, adapted to read `replay.rounds` instead of `match.rounds`, and `replay.players` for the seat→name lookup instead of `match.players`) above the existing `.match-reveal` section, titled with `profile.gameDetail.replayTitle`. Each statement renders via `<StatementBubble message={...} name={...} viewerLang={viewerLang} />` (building the `Message` shape per this task's Interfaces block) instead of the raw `<div className="bubble wrap">` `MatchPage.tsx` uses, since `MatchPage`'s bot statements have no translations/host/skipped concept to handle. When `kind !== 'ok'`, render nothing extra — the page is byte-for-byte what it renders today.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd spy-hunt && npx vitest run src/screens/GameDetail.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/GameDetail.tsx src/i18n/en.json src/i18n/zh-Hans.json src/screens/GameDetail.test.tsx
git commit -m "feat: render round-by-round replay on the game detail page"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/ -v`
Expected: PASS, no regressions in unrelated suites (arena, clans, credits, accounts)

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd spy-hunt && npx vitest run`
Expected: PASS, no regressions in `MatchPage.test.tsx`, `GameDetail.test.tsx`, `Profile.test.tsx`, `GameRow`-related tests

- [ ] **Step 3: Type-check the frontend**

Run: `cd spy-hunt && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "fix: address full-suite verification findings"
```
