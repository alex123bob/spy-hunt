# Spy Hunt Back End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 spy-hunt game server as one standalone folder `ai_svc/spy_hunt/` with one blueprint under `/api/spy-hunt`.

**Architecture:** Flask blueprint over a SQLite source of truth. Pure-logic game engine, one timer thread (min-heap) that also schedules bot actions, SSE event stream read from an `events` table, and a DeepSeek wrapper (`llm.call_json`) that every AI feature goes through. Single process only.

**Tech Stack:** Python 3.10, Flask 3.0, sqlite3 (stdlib), agno 2.4.7 `DeepSeek` (fallback: `openai` package against DeepSeek's endpoint), pytest.

**Spec:** `docs/specs/2026-11-06-spy-hunt-design-spec.md` (rules, UX) and `docs/specs/2026-11-06-spy-hunt-implementation-spec.md` (this plan implements it; section numbers below like "impl §6.3" refer to it). Brainstorm: `docs/brainstorm/2026-11-06-brainstorm-record.md`.

**Working location:** `/Users/jiali/personal_github_repos/PP-AI-Service` (reachable as `spy-hunt/backend`). Create a branch `spy-hunt-backend` there before Task 1. Commits go to that repo, not spy-hunt.

## Global Constraints

- All new code lives in `ai_svc/spy_hunt/` (tests in `ai_svc/spy_hunt/tests/`). The only edit outside is two lines in `app.py`: `from ai_svc.spy_hunt import spy_hunt_bp` and `app.register_blueprint(spy_hunt_bp)`.
- One blueprint `spy_hunt_bp`, `url_prefix="/api/spy-hunt"`. No new dependencies.
- Defaults live only in `GameConfig`: `min_players=4`, `max_players=10`, `two_spies_at=8`, `turn_seconds=45`, `vote_seconds=30`, `statement_max_chars=120`, `extra_rounds=2`, `room_ai_budget=300`, `room_idle_hours=6`. `LANGS=("en","zh-Hans")`. No literal 45 or 4 elsewhere.
- `max_rounds = (players - 2*spies) + extra_rounds`, computed at start, stored in the room config snapshot.
- Win check order: all spies out → civilians; spies >= alive civilians → spies; `round >= max_rounds` → spies.
- No spy word-guess. No human-civilian guard. Tied players do not vote in a re-vote.
- Timers and stale-result checks use `rooms.phase_seq`, never `rooms.version`.
- No model call while holding a room lock. Every state change runs in `BEGIN IMMEDIATE`; SQLite uses WAL, `busy_timeout=5000`, `synchronous=NORMAL`, one connection per thread.
- Tokens stored only as SHA-256 hash. Auth header: `Authorization: Bearer <player_id>.<token>`. No token in URLs.
- No role or secret word in any `audience="all"` event or snapshot before `game_over`.
- Budget degradation order: host narration, then translation, then bots → canned.
- Translation prompt rule: preserve vagueness; do not clarify or embellish. Player text only inside marked data blocks.
- Do not edit PP-AI-Service outside the rules above.

## Review Focus

- Two players submit the same vote or statement at the same instant: exactly one succeeds, the other gets 409, state stays consistent (Task 5).
- A player's browser sends malformed JSON, a 10k-character name, or emoji/control characters in name or statement: 400 or sanitized, never 500 (Task 4, 5).
- Server restart mid-game: timers rebuild from the DB and the game continues (Task 6).
- Host leaves or all humans leave mid-game: host transfers or room finishes, no zombie room (Task 5).
- DeepSeek down, slow, or returning garbage: games still progress using canned bot statements and original-only chat (Tasks 8–10).

---

### Task 1: Package skeleton, config, DB, health route, registration

**Files:**
- Create: `ai_svc/spy_hunt/__init__.py`, `config.py`, `db.py`, `routes.py`, `tests/__init__.py`, `tests/conftest.py`, `tests/test_config.py`, `tests/test_db.py`, `tests/test_health.py`
- Modify: `app.py` (two lines, next to the `see_bp`/`tts_bp` registrations)

**Interfaces:**
- Produces: `GameConfig` (frozen dataclass, fields per Global Constraints) with `spy_count(players:int)->int` and `max_rounds(players:int, spies:int)->int`; `LANGS`; `db.get_conn()->sqlite3.Connection` (per-thread, row factory `sqlite3.Row`, pragmas applied); `db.init_db()` creating all tables and indexes from impl §5; `db.DB_PATH` from `SPY_HUNT_DB_PATH` else `ai_svc/spy_hunt/spy_hunt.db`; `spy_hunt_bp`; pytest fixtures `client` (Flask test client with temp DB) and `conn`.

- [ ] **Step 1: Write failing tests.** `test_config.py`: `GameConfig().spy_count(7)==1`, `spy_count(8)==2`, `max_rounds(4,1)==4`, `max_rounds(6,1)==6`, `max_rounds(10,2)==8`. `test_db.py`: `init_db()` creates tables `guests rooms players messages translations votes events pairs room_pairs guest_recent_pairs`; `PRAGMA journal_mode` is `wal`; calling `init_db()` twice is safe. `test_health.py`: `GET /api/spy-hunt/health` returns 200 `{"ok": true}`.
- [ ] **Step 2: Run** `cd PP-AI-Service && python -m pytest ai_svc/spy_hunt/tests -v`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the files above. Schema is impl §5 verbatim including `game_no`, `phase_seq`, `stage`, and `kind` in (`statement`,`skipped`,`host`); add indexes `events(room_id, seq)`, `messages(room_id, id)`, `rooms(status, last_active)`. Add the two `app.py` lines.
- [ ] **Step 4: Run** the same command plus `python -c "import app"`. Expected: PASS, import succeeds.
- [ ] **Step 5: Commit** `feat(spy-hunt): skeleton, config, db, health`.

### Task 2: Guest identity, auth decorator, rate limiters

**Files:** Create `auth.py`, `ratelimits.py`, `tests/test_auth.py`; modify `routes.py`.

**Interfaces:**
- Consumes: `db.get_conn`, `ai_svc.rate_limit.RateLimiter`.
- Produces: `POST /guests` → `{player_id, token}`; `auth.require_guest` decorator that sets `g.player_id` or returns 401 `{"error":"unauthorized"}`; `ratelimits.limit(name)->decorator` where `name` is one of `guest_create`, `room_create`, `action`, `read`, `flood`, with limits from impl §14 (40/min/IP, 5/min/guest, 30/min/guest, 60/min/guest, 200/min/IP), one `RateLimiter` instance per row, IP from `X-Real-IP` else `remote_addr`.

- [ ] **Step 1: Tests:** creating a guest returns ids; a request with a wrong token → 401; the 41st guest creation from one IP within a minute → 429 and the 40th succeeds; token is not stored in plain text (query `guests.token_hash != token`).
- [ ] **Step 2: Run** `pytest ai_svc/spy_hunt/tests/test_auth.py -v`; FAIL.
- [ ] **Step 3: Implement** with constant-time compare (`hmac.compare_digest`) on SHA-256 hashes.
- [ ] **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): guests and rate limits`.

### Task 3: Pure game engine

**Files:** Create `engine.py`, `tests/test_engine.py`.

**Interfaces:**
- Produces (all pure, no I/O; `Seat = dict(seat:int, role:str, alive:bool)`):
  - `assign_roles(n_seats:int, spies:int, rng) -> list[str]`
  - `check_win(seats:list[Seat], round:int, max_rounds:int) -> str|None` returning `"civilians"`, `"spies"` or `None`, in the Global Constraints order
  - `resolve_vote(votes:dict[int,int|None], stage:int, alive:list[int], tied:list[int]|None) -> VoteResult` where `VoteResult(eliminated:int|None, tied:list[int], outcome:str)` and `outcome` ∈ `eliminated | tiebreak | nobody`
  - `eligible_voters(alive:list[int], stage:int, tied:list[int]|None)->list[int]` and `eligible_targets(...)->list[int]` (re-vote: voters are alive non-tied, targets are tied)
  - `contains_own_word(text:str, words:dict[str,str])->bool` (case-insensitive substring across all languages in `words`)
  - `next_speaker(order:list[int], alive:set[int], spoken:set[int], tied:list[int]|None)->int|None`

- [ ] **Step 1: Write failing tests** for: 1 spy with 3 alive (1 spy) → spies win; 4 players after one civilian out, spy caught → civilians; 2 spies at 8 players, one caught, 3 civilians vs 1 spy continues; final-round catch → civilians (check order); `max_rounds` reached with spy in → spies; 2-way tie → `tiebreak`; 2-way tie at stage 1 → `nobody`; 1-1-1 among 3 alive → `nobody` with no tiebreak; zero votes → `nobody`; abstains ignored in counting; re-vote eligibility excludes tied voters; `contains_own_word("I like 咖啡?", {"en":"coffee","zh-Hans":"咖啡"})` true, `"I drink Coffee"` true, text containing only the *other* pair word false; `assign_roles` returns exactly `spies` spies and is unbiased across seeds (2000 draws, each seat spy ≈ spies/n ±5%).
- [ ] **Step 2: Run** `pytest ai_svc/spy_hunt/tests/test_engine.py -v`; FAIL.
- [ ] **Step 3: Implement.** Pure functions only.
- [ ] **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): pure engine rules`.

### Task 4: Store, visibility, rooms API (create/join/snapshot/settings/me)

**Files:** Create `store.py`, `visibility.py`, `locks.py`, `tests/test_rooms.py`, `tests/test_visibility.py`; modify `routes.py`.

**Interfaces:**
- Produces: `locks.room_lock(room_id)->RLock`; `store.create_room(player_id,name,lang)->room`, `store.add_player(...)`, `store.get_room_by_code(code)`, `store.append_event(room_id,type,payload,audience)->seq`; room code: 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; `visibility.visible_to(event, seat)->bool` and `visibility.build_snapshot(room_id, player_id)->dict` — the only code allowed to read `players.role` or pair words for client payloads (impl §7.2, §7.3).
- Routes per impl §7: `POST /rooms`, `POST /rooms/<code>/join`, `GET /rooms/<code>`, `PATCH /rooms/<code>/me`, `PATCH /rooms/<code>/settings`. Names capped at 16 chars with control characters stripped; invalid lang → 400; non-member snapshot → 403; unknown code → 404; full/started → 409; same-guest rejoin idempotent. Join and settings emit `player_joined` / `settings` events.

- [ ] **Step 1: Failing tests:** create → join → snapshot flow; 11th join → 409; join after start → 409; 17+ char or control-char name sanitized; malformed JSON body → 400; `test_visibility.py` asserts that for every event type constructed by the store, an `audience="all"` payload contains none of the keys `role`, `word`, `words` before `game_over`, and that a snapshot never contains the caller's own role.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): rooms API and visibility`.

### Task 5: Game flow (start, statement, vote, leave, rematch)

**Files:** Create `game.py`, `tests/test_game_flow.py`, `tests/test_concurrency.py`; modify `routes.py`.

**Interfaces:**
- Consumes: Tasks 3 and 4; `words.draw_pair` is stubbed here by a fixture pair (real implementation in Task 12) via `game.set_pair_source(fn)`.
- Produces: `game.start_game(room_id, by_player)`, `game.submit_statement(room_id, player_id, text)`, `game.submit_vote(room_id, player_id, target_seat|None)`, `game.advance_phase(room_id, expected_phase_seq)` (the single function timers call; idempotent), `game.leave(room_id, player_id)`, `game.rematch(room_id, by_player)`; routes `POST /rooms/<code>/{start,statement,vote,leave,rematch}`. Every mutation: take `room_lock`, `BEGIN IMMEDIATE`, bump `rooms.version`, bump `phase_seq` only on phase/speaker change, then append events (`game_started` with per-seat word as `seat:<n>` audience, `turn`, `statement`, `vote_locked`, `reveal`, `game_over`). Leaving mid-game converts the seat to a bot (`is_bot=1`) keeping name and role; if no human remains the room is `finished` with no winner; host passes to the longest-present human. Rematch bumps `game_no` and clears roles/alive/pair/winner. Start fills bots up to `min_players`; `spy_count` and `max_rounds` come from the final seat count and are saved in the config snapshot.

- [ ] **Step 1: Failing tests:** start with 3 humans → 1 bot added, 4 seats, 1 spy; 8 seats → 2 spies; non-host start → 403; statement out of turn → 409; own-word statement → 400 and turn not consumed; over-120-char → 400; full 4-player scripted game to a civilian win and to a spy win; abstain-only round advances; two-way tie runs tiebreak then re-vote with tied players excluded; rematch round 1 does not collide with game 1 rows; leaving player becomes a bot; host leaves → transfer. `test_concurrency.py`: two threads post the same vote at once → one 200 and one 409; two threads post statements for the same turn → exactly one stored.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): game flow`.

### Task 6: Timer thread

**Files:** Create `timers.py`, `tests/test_timers.py`; modify `game.py` (call `timers.schedule` after commit).

**Interfaces:**
- Produces: `timers.schedule(at_ms:int, kind:str, room_id:str, phase_seq:int, payload:dict|None=None)`, `timers.ensure_started()` (lazy, module flag plus lock; called from request handlers, never at import), `timers.rebuild_from_db()`, handler registry `timers.register(kind, fn)`. Kinds: `phase_timeout`, `bot_act`, `mark_disconnected`, `sweep`. Timeout handlers call `game.advance_phase(room_id, phase_seq)`: describe timeout stores a `skipped` message; vote timeout resolves with votes in; reveal (8 s) starts the next round. Sweep every 10 min: finish rooms idle past `room_idle_hours`, prune `events` to last 500 per room and drop events of rooms finished over 24 h ago.

- [ ] **Step 1: Failing tests** (inject a fake clock): entry with a stale `phase_seq` is discarded; the same entry fired twice acts once; a join during describe does not cancel the timeout; `rebuild_from_db()` after a simulated restart reschedules a playing room's deadline; sweep prunes events and finishes idle rooms.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): timers and sweep`.

### Task 7: Events and SSE stream

**Files:** Create `events.py`, `tests/test_sse.py`; modify `routes.py`, `store.py` (notify on append).

**Interfaces:**
- Produces: `GET /rooms/<code>/events?after=<seq>` honoring `Last-Event-ID`; headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`; frame `id:`/`event:`/`data:`; per-room `threading.Condition` wake-ups; 15 s wait then `: ping`; stop after 30 min; caps 4 streams/guest and 200 total → 429; non-member → 403; `after` older than oldest retained event → one `state` event with the snapshot. The generator's `finally` schedules `mark_disconnected` 10 s out (Task 6); connecting sets `connected=1`. Stream connects are excluded from the Task 2 limiters.

- [ ] **Step 1: Failing tests:** events come in order after `after`; reconnect with `Last-Event-ID` gets only newer events; too-old `after` yields `state`; a personal `seat:<n>` event reaches only that seat; idle stream yields a ping (shorten the wait via a test setting); 5th stream for one guest → 429.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): SSE stream`.

### Task 8: LLM wrapper (with spike)

**Files:** Create `llm.py`, `prompts.py` (skeleton with `data_block(text)->str`), `tests/test_llm.py`, `tests/fake_llm.py`.

**Interfaces:**
- Produces: `llm.call_json(task:str, prompt:str, schema:type[BaseModel], room_id:str, max_tokens:int, timeout:float) -> BaseModel`; raises `BudgetExceeded`, `LlmError`. Increments `rooms.ai_calls` before each attempt (retry on parse failure counts), refuses at `room_ai_budget`. Per-task timeouts: bot turn and translation 8 s, pair generation and validation 20 s. `SPY_HUNT_FAKE_LLM=1` swaps in `fake_llm` (deterministic canned JSON). `prompts.data_block` strips the delimiter string from input and wraps it as data. Env: `SPY_HUNT_MODEL` default `deepseek-chat`.

- [ ] **Step 1: Spike (not a test):** with the real `DEEPSEEK_API_KEY`, confirm in a scratch script whether `agno==2.4.7` `Agent(model=DeepSeek(...))` returns parseable JSON with a timeout; if awkward, use the `openai` client against DeepSeek's endpoint with JSON mode. Record the choice in a comment at the top of `llm.py`.
- [ ] **Step 2: Failing tests** with the transport mocked: valid JSON parses; invalid JSON retries once then raises `LlmError`; call 301 in a room raises `BudgetExceeded` and `ai_calls` stays 300; delimiter text in input cannot close the data block.
- [ ] **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): llm wrapper`.

### Task 9: Language detection and translation

**Files:** Create `translation.py`, `tests/test_translation.py`; modify `prompts.py`, `game.py` (post-commit hook enqueues).

**Interfaces:**
- Consumes: `llm.call_json`, worker pool (4 workers, shared with Task 10 via `workers.py`).
- Produces: `translation.detect_local(text)->"en"|"zh-Hans"|None` (mostly-CJK → zh-Hans, mostly-Latin → en, else None); `translation.process_message(message_id)` — detect (local first, model if None), store `messages.lang`, for each distinct room language ≠ `lang` get one model call returning all targets, store in `translations`, emit `translation` events; `translation.ensure_for(message_ids, lang)` for lazy backfill when a player switches language. Prompt carries the "preserve vagueness; do not clarify or embellish" rule. Bot messages arrive with known `lang`, so no detection call. `skipped` and `host`-canned messages are not translated by the model. Failure or budget exhaustion: no event, original stays.

- [ ] **Step 1: Failing tests (fake LLM):** zh text with en viewer produces a `translation` event; en text with only en viewers makes no model call; mixed text goes through the model; the prompt contains the vagueness rule and the data block; `LlmError` is swallowed and logged; language switch backfills missing translations once.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): translation`.

### Task 10: Bots

**Files:** Create `bots.py`, `workers.py`, `tests/test_bots.py`; modify `prompts.py`, `game.py`, `timers.py` handler registration.

**Interfaces:**
- Produces: `bots.PERSONAS` (4 built-ins: cheerful, dry, chatty, terse; plain constants shaped as a `BotProfile` dataclass so Phase 2 can replace them); `bots.public_view(room_id, seat)->dict` (own word, alive seats, public statements, past votes and eliminations; never roles or the other word); `bots.schedule_bot_actions(room_id)` — pushes `bot_act` entries with random 1–4 s delay (each voting bot separately); handler: lock → check `phase_seq` → unlock → model call on the worker pool (statement `{statement}` in the room's `main_lang`, vote `{vote_for, reason}`) → lock → recheck `phase_seq` and seat → submit through `game.submit_statement` / `game.submit_vote`. Fallbacks: canned per-language statement list and a random valid vote on any `LlmError`/`BudgetExceeded`. A bot statement containing its own word is replaced with a canned one.

- [ ] **Step 1: Failing tests:** `public_view` has no key `role` and no other-pair word (assert on a spy and on a civilian); a result arriving after `phase_seq` changed is dropped; `LlmError` → canned statement and the game progresses; bot votes are valid (alive, not self, not tied-voter in re-vote); injection text in another player's statement appears only inside the data block in the built prompt; a full 1-human + 3-bot game finishes under the fake LLM.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS. **Step 5: Commit** `feat(spy-hunt): bots`.

### Task 11: Host narration

**Files:** Create `host.py`, `tests/test_host.py`; modify `prompts.py`, `game.py`.

**Interfaces:**
- Produces: `host.narrate(room_id, moment:str)` for `moment` ∈ `round_start | elimination | game_over`; builds from public state only; writes a `kind='host'` message in `main_lang`, then the standard translation pipeline applies; canned fallback lines per language; skipped first when budget remaining < 20%.

- [ ] **Step 1: Failing tests:** prompt input contains no roles before reveal; fallback used on `LlmError`; skipped when 19% budget remains while a bot call still goes through.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat(spy-hunt): host narration`.

### Task 12: Word pool

**Files:** Create `words.py`, `seed/pairs_seed.json`, `scripts/build_pool.py`, `tests/test_words.py`; modify `db.py` (seed load when `pairs` empty), `game.py` (replace the stub).

**Interfaces:**
- Produces: `words.draw_pair(room_id)->Pair` (excludes pairs in `room_pairs` for the room and pairs recently seen by any human guest in the last 30 days; weights `difficulty=2`; falls back to `generate_pair()`; after 2 failures uses any pool pair); `words.generate_pair()->Pair` (generate call plus per-language validation call; stored only if both languages pass); `words.record_outcome(pair_id, spy_won:bool)`. `Pair.words = {"en":{"a","b"},"zh-Hans":{"a","b"}}`. `build_pool.py --target 120` writes `seed/pairs_seed.json`; the file is **not loaded until the owner reviews it**, so the repo ships a small 10-pair placeholder seed for tests/dev.

- [ ] **Step 1: Failing tests:** draw never repeats within a room; recently-seen pairs skipped when alternatives exist; generation rejected when validation fails for either language (nothing inserted); `record_outcome` increments `plays` and `spy_wins`; seed loads once.
- [ ] **Step 2: Run;** FAIL. **Step 3: Implement.** **Step 4: Run;** PASS.
- [ ] **Step 5: Generate the real pool:** run `python -m ai_svc.spy_hunt.scripts.build_pool --target 120` with the real key (≈300–400 calls) and stop; hand `seed/pairs_seed.json` to the owner for review. Do not load until approved.
- [ ] **Step 6: Commit** `feat(spy-hunt): word pool`.

### Task 13: README, end-to-end backend test, final check

**Files:** Create `README.md` (endpoints, events, env vars, single-process note, Nginx SSE block from impl §13), `tests/test_e2e.py`.

- [ ] **Step 1: Failing test:** with `SPY_HUNT_FAKE_LLM=1`, drive HTTP only: two guests create/join, start, play to game over using the stream; assert `game_over` is the first event containing roles and words, and that a zh-Hans viewer got a `translation` event for an en statement.
- [ ] **Step 2–3:** run (FAIL), fix gaps; run the entire suite `pytest ai_svc/spy_hunt/tests -v` (PASS) and `python -c "import app"`.
- [ ] **Step 4: Commit** `docs(spy-hunt): README and e2e`.
