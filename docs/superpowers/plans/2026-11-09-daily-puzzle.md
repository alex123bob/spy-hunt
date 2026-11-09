# Daily Spy Hunter Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 3 daily puzzle: a pre-generated, quality-gated bot-vs-bot transcript that every player solves once a day (tap the spy, optionally pick the spy's word), with server-side scoring, browser streaks and an emoji share card.

**Architecture:** Backend (Flask blueprint in `PP-AI-Service`) gets two SQLite tables, a `puzzles.py` module (queue, daily publish, play state machine, scoring), a `puzzle_gen.py` module (offline generator with a quality gate) and four `/daily` routes. A CLI keeps a queue of 14 ready puzzles. Frontend (`spy-hunt`, React) gets a `/daily` flow, a streak store in `localStorage` and a share-text builder. The generator does not use rooms, timers or votes.

**Tech Stack:** Python 3 / Flask / SQLite / pydantic / pytest with `fake_llm`; React 19 / TypeScript / vitest / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-daily-puzzle-design.md` (in `spy-hunt`). Read it first. Earlier context: `docs/specs/2026-11-06-spy-hunt-implementation-spec.md`.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `spy-hunt-daily-puzzle` created from `spy-hunt-backend`. All backend paths below are relative to `ai_svc/spy_hunt/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (388 tests pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, new branch `daily-puzzle` created from `frontend`. Tests: `yarn test` (50 pass today) and `yarn build`.

## Global Constraints

- Day boundary is the **UTC date**, string `YYYY-MM-DD`. One scored attempt per guest per day, no replays.
- Puzzle: **5 players, 2 rounds** (10 statements), speaking order = seat order `0..4`, exactly **1 spy**. The civilian word is shown to the player up front.
- Tries: **2** spy taps. Word guess: **4 options**, optional (skip allowed), no penalty for a wrong one.
- Score (max 140): spy found on try 1 = **100**, try 2 = **60**, not found = **0 total** (no bonuses). Time bonus up to **+20**: full (20) at elapsed <= 60 000 ms, 0 at >= 180 000 ms, linear between, rounded to an int. Word right = **+20**.
- Elapsed time is measured by the server: `finished_at - started_at`, where `started_at` is set by the guest's first `GET /daily` that day.
- The puzzle answer (spy seat, spy word, which option is right) is never present in `GET /daily` or in a wrong-guess response.
- Model-call budget: about 13 calls per puzzle (10 statements, 2 solver calls, 1 translation). All calls go through `llm.call_json`, never inside `store.tx`.
- Quality gate constants in `puzzle_gen.py`: `MIN_CONFIDENCE = 40`, `TOO_EASY_CONFIDENCE = 95`, `STATEMENT_ATTEMPTS = 2`, `ATTEMPTS_PER_PAIR = 3`, `QUEUE_TARGET = 14`. Difficulty from full-transcript solver confidence: `>= 85` -> 1, `60..84` -> 2, `< 60` -> 3.
- Languages are `en` and `zh-Hans` only. Puzzle origin language alternates by queue count (`LANGS[ready_or_total % 2]`); all 10 statements are in the origin language and translated in one batch call into the other.
- Share card never contains words, names or the spy seat.
- Decision deviating from the spec (simplification): **all `/daily` routes require a guest token** (the spec allowed anonymous reads). The client already creates a guest silently via `ensureGuest()`. The open questions in the spec are closed as: UTC day, one scored attempt.
- Code comments only where behavior is not obvious. Match surrounding style.

## Review Focus

1. **Answer leakage:** `GET /daily` and wrong-guess responses must contain no spy seat, spy word or correct option index. Task 3 scans the JSON.
2. **Double submit / races:** two quick `POST /daily/guess` calls must not grant a third try, and two guests' first requests on a new day must assign exactly one puzzle to that day. Tasks 1 and 2.
3. **Empty queue and day rollover:** no ready puzzle gives a clean `503 no_puzzle`, not a 500; a guest's attempt from yesterday does not affect today. Tasks 1 and 3.
4. **Streak edge cases:** a missed day resets to 1 on the next solve, an unsolved day resets to 0, playing the same day twice does not double count, corrupt or blocked `localStorage` does not crash. Task 7.
5. **Model misbehaviour in the generator:** a clue that names a secret word, a wrong-length translation list, and a model error mid-puzzle must reject the candidate, never publish it. Tasks 4 and 5.

---

## Task 1: Schema, queue and daily publish (backend)

**Files:**
- Create: `puzzles.py`, `tests/puzzle_fixtures.py`, `tests/test_puzzles.py`
- Modify: `db.py` (schema)

**Interfaces:**
- Produces (used by every later task):
  - Tables `puzzles(id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NULL, day TEXT UNIQUE NULL, status TEXT, pair_id TEXT, difficulty INTEGER, public_json TEXT, answer_json TEXT, created_at INTEGER)` with status in `ready | published | vetoed`; `puzzle_results(day TEXT, player_id TEXT, stage TEXT, tries INTEGER, solved INTEGER, word_correct INTEGER NULL, started_at INTEGER, finished_at INTEGER NULL, score INTEGER NULL, PRIMARY KEY(day, player_id))` with stage in `spy | word | done`.
  - `puzzles.utc_day(now_ms: int | None = None) -> str`
  - `puzzles.insert_ready(public: dict, answer: dict, difficulty: int, pair_id: str) -> int` (puzzle id)
  - `puzzles.ready_count() -> int`
  - `puzzles.list_ready() -> list[dict]` (keys `id, pair_id, difficulty, created_at`)
  - `puzzles.veto(puzzle_id: int) -> bool` (only a `ready` puzzle can be vetoed)
  - `puzzles.publish_today(day: str) -> sqlite3.Row | None` (existing puzzle for `day`, else atomically assigns the oldest `ready` one with `number = MAX(number)+1`, else `None`)
  - `puzzles.public_payload(row) -> dict`: `{"number","day","difficulty","origin_lang","civilian_word","players","statements","options"}`, copied from `public_json` plus the row columns, never the answer.
  - `puzzles._now_ms()` is the only clock the module uses, so tests can monkeypatch it.
  - `tests/puzzle_fixtures.py`: `sample_puzzle(spy_seat: int = 2) -> tuple[dict, dict]` returning `(public, answer)`. Public shape: `origin_lang`, `civilian_word {en, zh-Hans}`, `players [{seat, name}]` x5, `statements` x10 as message-shaped dicts `{id, round, stage:0, seat, kind:"statement", text, lang, translations:{other_lang: text}, created_at:0}`, `options` x4 of `{en, zh-Hans}` where option 0 is the spy word. Answer shape: `{"spy_seat", "spy_word": {en, zh-Hans}, "civilian_word": {en, zh-Hans}, "option_index": 0}`.

- [ ] **Step 1: Branches.** In both repos create the branches named above from the current branch.

- [ ] **Step 2: Write failing tests in `tests/test_puzzles.py`** (use the `temp_db` fixture, call `db.init_db()` is already done by it):
  - `test_schema_has_puzzle_tables`: both tables exist.
  - `test_utc_day_formats_the_date`: `utc_day(1794211514302)` returns the UTC `YYYY-MM-DD` of that timestamp.
  - `test_publish_assigns_oldest_ready_puzzle_once`: insert two ready puzzles A then B; `publish_today("2026-11-10")` returns A with `number == 1`, calling it again returns the same row and does not consume B; `publish_today("2026-11-11")` returns B with `number == 2`.
  - `test_publish_returns_none_when_queue_empty`.
  - `test_publish_skips_vetoed`: veto A; publish returns B.
  - `test_veto_only_ready`: veto of a published puzzle returns `False`.
  - `test_public_payload_has_no_answer`: `json.dumps(payload)` contains neither `"spy_seat"` nor `"option_index"` nor `"spy_word"`.
  - `test_concurrent_first_publish_assigns_one_puzzle`: 8 threads call `publish_today` for the same new day with 3 ready puzzles; all get the same id and exactly one puzzle row has that day.

- [ ] **Step 3: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_puzzles.py -q`. Expected: FAIL (module missing).

- [ ] **Step 4: Implement** the two tables in `db.py` `SCHEMA` and `puzzles.py` with the signatures above. Write transactions with `BEGIN IMMEDIATE` on `db.get_conn()` like `store.tx`, commit or roll back, no model calls. `publish_today` runs a single transaction: select by day, else pick-and-update.

- [ ] **Step 5: Run** the new tests and then the whole backend suite. Expected: all pass.

- [ ] **Step 6: Commit** `feat(spy-hunt): puzzle tables, queue and daily publish`.

## Task 2: Play flow and scoring (backend)

**Files:**
- Modify: `puzzles.py`
- Test: `tests/test_puzzles_play.py`

**Interfaces:**
- Consumes: everything from Task 1, `store.StoreError(status, code, message)`.
- Produces:
  - `puzzles.score(solved_try: int | None, elapsed_ms: int, word_correct: bool) -> int`
  - `puzzles.get_today(player_id: str, day: str | None = None) -> dict`: `{"puzzle": public_payload, "me": {"stage": "spy"|"word"|"done", "tries": int, "tries_left": int}}`. Creates the guest's attempt row with `started_at = _now_ms()` on first call that day. Raises `StoreError(503, "no_puzzle", ...)` when `publish_today` returns `None`.
  - `puzzles.guess_spy(player_id: str, spy_seat: int, day: str | None = None) -> dict`: `{"correct": bool, "stage": str, "tries": int, "tries_left": int}`. Raises `StoreError(409, "wrong_stage", ...)` unless stage is `spy`, `StoreError(400, "bad_seat", ...)` for a seat not in `0..4` or a non-int (bools rejected), `StoreError(404, "no_attempt", ...)` if `get_today` was never called.
  - `puzzles.guess_word(player_id: str, option: int | None, day: str | None = None) -> dict`: `{"correct": bool | None, "stage": "done"}` (`None` when skipped). `StoreError(409, "wrong_stage")` unless stage is `word`; `StoreError(400, "bad_option")` for a value outside `0..3` or non-int.
  - `puzzles.result(player_id: str, day: str | None = None) -> dict`: `{"solved": bool, "tries": int, "word_correct": bool | None, "elapsed_ms": int, "score": int, "answer": {"spy_seat", "spy_word", "civilian_word"}, "stats": {"players": int, "solved_pct": int}}`. `StoreError(409, "not_finished")` unless stage is `done`. `solved_pct` is the rounded percentage of finished attempts that day with `solved = 1` (0 when none).
  - `day=None` means `utc_day()`.

- [ ] **Step 1: Write failing tests** (monkeypatch `puzzles._now_ms` with a mutable clock):
  - `test_score_table` parametrized: `(1, 0, True) == 140`, `(1, 60000, False) == 120`, `(1, 180000, False) == 100`, `(1, 120000, False) == 110`, `(2, 60000, True) == 100`, `(None, 1000, True) == 0`.
  - `test_get_today_creates_attempt_and_hides_answer`: stage `spy`, `tries_left == 2`; a second call keeps the same `started_at` (advance the clock, then check elapsed later).
  - `test_get_today_no_puzzle_is_503`.
  - `test_correct_first_guess_moves_to_word_stage`: returns `correct True`, `stage "word"`; the response does not contain the spy word.
  - `test_wrong_then_wrong_ends_unsolved`: after the second wrong guess stage is `done`; `result` gives `solved False`, `score 0`, answer present.
  - `test_wrong_then_correct_scores_try_two`: try 2 correct, skip word, elapsed 60 s: `score == 80` (60 + time bonus 20) and `word_correct is None`.
  - `test_word_guess_correct_adds_20` and `test_word_guess_wrong_adds_nothing` and `test_word_skip_is_none`.
  - `test_elapsed_is_server_measured`: clock set so finish - start is 90 000 ms; `result["elapsed_ms"] == 90000` and the time bonus is 15.
  - `test_cannot_guess_after_done` and `test_cannot_guess_word_in_spy_stage`: 409 `wrong_stage`.
  - `test_bad_seat_and_bad_option_rejected`: `True`, `"2"`, `5`, `-1` all 400.
  - `test_two_parallel_guesses_use_at_most_two_tries` (Review Focus 2): 4 threads each call `guess_spy` with a wrong seat; afterwards `tries == 2` and the stage is `done`; the extra calls raised `wrong_stage`.
  - `test_stats_count_finished_attempts_only`: two guests, one solved and one unsolved -> `solved_pct == 50`, `players == 2`; a third unfinished guest is not counted.
  - `test_yesterdays_attempt_does_not_affect_today` (Review Focus 3): attempt a finished day D, then `get_today(player, day=D+1)` with another ready puzzle gives stage `spy` and `tries 0`.

- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_puzzles_play.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement** the five functions in `puzzles.py`. Each mutation runs in one `BEGIN IMMEDIATE` transaction that re-reads the attempt row, so parallel calls serialise. `score` rounds with `round()`.

- [ ] **Step 4: Run** the new tests and the full suite. Expected: pass.

- [ ] **Step 5: Commit** `feat(spy-hunt): daily puzzle play flow and scoring`.

## Task 3: `/daily` routes (backend)

**Files:**
- Modify: `routes.py`
- Test: `tests/test_daily_routes.py`

**Interfaces:**
- Consumes: `puzzles.get_today / guess_spy / guess_word / result`, `auth.require_guest`, `ratelimits.limit`, existing `_json_body()` and `StoreError` handler in `routes.py`.
- Produces (HTTP, under `/api/spy-hunt`, all need the Bearer guest token):
  - `GET /daily` -> `puzzles.get_today(g.player_id)` as JSON, decorators `flood`, `require_guest`, `read`.
  - `POST /daily/guess` body `{"spy_seat": int}` -> `guess_spy`. Missing key is `400 bad_seat`. Decorators `flood`, `require_guest`, `action`.
  - `POST /daily/word` body `{"option": int | null}` -> `guess_word`. Missing key is `400 bad_option`.
  - `GET /daily/result` -> `result`.

- [ ] **Step 1: Write failing tests** using the `client` fixture, a helper that creates a guest via `POST /guests`, and `insert_ready(*sample_puzzle(), 2, "p-x")`:
  - `test_daily_requires_guest_token`: all four endpoints 401 without a token.
  - `test_get_daily_returns_puzzle_without_answer` (Review Focus 1): response JSON text contains none of `spy_seat`, `spy_word`, `option_index`, and not the spy's English word `organ` outside the `options` list (assert by removing `options` from the dict first, then scanning).
  - `test_wrong_guess_response_has_no_answer`: scan the response body for `organ`, `风琴` and `option_index`.
  - `test_full_happy_path`: get, correct guess `2`, word `0`, result `solved True`, `word_correct True`, `score >= 120`.
  - `test_no_ready_puzzle_is_503_with_error_code`: body `{"error": "no_puzzle", ...}`.
  - `test_guess_with_missing_key_is_400` for guess and word.
  - `test_result_before_finish_is_409`.

- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_daily_routes.py -q`. Expected: FAIL (404).

- [ ] **Step 3: Implement** the four routes in `routes.py`, importing `puzzles`. Update the endpoint table in `README.md` (Task 6 finishes the README; add the four rows now).

- [ ] **Step 4: Run** the new tests and the full suite. Expected: pass.

- [ ] **Step 5: Commit** `feat(spy-hunt): /daily routes`.

## Task 4: Generator, part 1: candidate transcript (backend)

**Files:**
- Create: `puzzle_gen.py`, `tests/test_puzzle_gen.py`
- Modify: `llm.py` (`TASK_TIMEOUTS`)

**Interfaces:**
- Consumes: `bots._prompt_describe(view, persona)`, `bots._StatementOut`, `bots.PERSONAS`, `config.BOT_NAMES`, `config.LANGS`, `engine.contains_own_word(text, words)`, `prompts.TRANSLATE_RULE`, `prompts.data_block`, `llm.call_json(task, prompt, schema, room_id, max_tokens, timeout)`, `game.Pair(id, words)` where `words = {"en": {"a","b"}, "zh-Hans": {"a","b"}}`.
- Produces:
  - `llm.TASK_TIMEOUTS` gains `"puzzle_statement": 8.0`, `"puzzle_solve": 15.0`, `"puzzle_translate": 20.0`.
  - Constants listed in Global Constraints.
  - `puzzle_gen.build_candidate(room_id: str, pair: game.Pair, origin_lang: str, rng: random.Random) -> dict | None`: returns `{"public": dict, "answer": dict}` in the shapes of `tests/puzzle_fixtures.py` (options not yet filled: `public["options"]` and `answer["option_index"]` are set in Task 5 by `pick_options`, so here they are `[]` and `None`), or `None` when any model call fails, a statement still names a secret word after `STATEMENT_ATTEMPTS` tries, or the translation is unusable.
  - Internal helpers (tested through `build_candidate`): `_statement(room_id, view, persona, words, lang)`, `_translate(room_id, texts, target_lang, forbidden)`.
  - Rules: the civilian gets `pair.words[origin][civ_key]`, the spy the other key (`civ_key` random via `rng`); spy seat random via `rng`; names a random sample of 5 from `BOT_NAMES`; personas shuffled from `PERSONAS`. Statement view passed to the bots prompt: `{"my_word": <word>, "round": r, "players": [names], "statements": [{"name", "text"}...so far]}`. Statements are whitespace-collapsed, capped at `GameConfig().statement_max_chars`, and rejected (retry up to `STATEMENT_ATTEMPTS`) when empty or when `engine.contains_own_word` finds any of the four secret strings (both words in both languages). `_translate` makes one call, schema `{"translations": [str, ...]}`, must return exactly 10 non-empty strings none of which contain a secret word, else `None`. Statement message ids are `1..10`; `translations = {target_lang: text}`.

- [ ] **Step 1: Write failing tests** with `fake_llm.register`, a builder room via `store.create_room("builder", "builder", "en")`, and a seeded `random.Random(1)`:
  - `test_candidate_has_five_players_ten_statements_in_speaking_order`: seats `0..4` twice, rounds 1 then 2.
  - `test_spy_word_given_only_to_the_spy`: capture prompts via the fake factory; the prompt for the spy's seat contains the spy word and not the civilian word, and vice versa.
  - `test_round_two_prompts_include_earlier_statements`.
  - `test_statement_naming_a_secret_word_is_retried_then_rejected` (Review Focus 5): factory first returns text containing the civilian word then a clean one -> candidate built, the leak was not stored; if it always leaks -> `None`.
  - `test_llm_error_rejects_candidate`: the statement factory raises `LlmError` -> `None`.
  - `test_translation_wrong_length_rejects` (Review Focus 5) and `test_translation_naming_a_secret_word_rejects`.
  - `test_translation_goes_into_the_other_language`: origin `zh-Hans` -> statements have `lang "zh-Hans"` and `translations["en"]`.
  - `test_candidate_public_has_no_answer_keys`: `public` has no `spy_seat`.

- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_puzzle_gen.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement** `build_candidate` and helpers in `puzzle_gen.py`, and add the three timeouts. Reuse the bot prompt, do not copy it. Never call the model inside a transaction.

- [ ] **Step 4: Run** the new tests and the full suite. Expected: pass.

- [ ] **Step 5: Commit** `feat(spy-hunt): puzzle generator candidate transcripts`.

## Task 5: Generator, part 2: options, quality gate, queue (backend)

**Files:**
- Modify: `puzzle_gen.py`
- Test: `tests/test_puzzle_gen.py` (append)

**Interfaces:**
- Consumes: Task 4 `build_candidate`, Task 1 `puzzles.insert_ready / ready_count`, `words` pool table `pairs(id, theme, words_json, active)`.
- Produces:
  - `puzzle_gen.pick_options(pair: game.Pair, spy_key: str, theme: str | None, rng: random.Random) -> tuple[list[dict], int]`: 4 options `{en, zh-Hans}` shuffled and the index of the spy word. Distractors come from other active pairs (either word, both languages as one unit), prefer the same `theme`, never equal (case-insensitive, either language) to either word of this pair, no duplicates. Raises `LookupError` when the pool cannot supply 3.
  - `puzzle_gen.solve(room_id: str, public: dict, rounds: int | None = None) -> tuple[int, int] | None`: one call (task `puzzle_solve`, schema `{"spy_seat": int, "confidence": int}`), prompt shows the civilian word in the origin language and the first `rounds` rounds of statements (all if `None`); returns `(seat, confidence 0..100)` or `None` on error or an out-of-range seat.
  - `puzzle_gen.difficulty_of(confidence: int) -> int`.
  - `puzzle_gen.generate_puzzle(room_id: str, pair: game.Pair, origin_lang: str, rng: random.Random) -> dict | None`: up to `ATTEMPTS_PER_PAIR` candidates; each runs `build_candidate`, fills options, then the gate: reject when the full-transcript `solve` is `None`, picks a wrong seat, or has confidence `< MIN_CONFIDENCE`, or when `solve(rounds=1)` picks the right seat with confidence `>= TOO_EASY_CONFIDENCE`. Returns `{"public","answer","difficulty","pair_id"}` or `None`.
  - `puzzle_gen.fill_queue(target: int = QUEUE_TARGET, rng: random.Random | None = None, log=print) -> int`: creates one builder room, loops until `ready_count() >= target` or `3 * target` pair attempts were made, picking pairs not already in `puzzles.pair_id` (fallback: any active pair), resetting the room's `ai_calls` to 0 before each pair, origin language `LANGS[ready_count() % 2]`; inserts via `puzzles.insert_ready`; returns the number inserted.

- [ ] **Step 1: Write failing tests**:
  - `test_pick_options_returns_four_distinct_options_with_spy_word_at_index`.
  - `test_pick_options_prefers_same_theme`: pool with 3 same-theme pairs plus others -> all distractors share the theme.
  - `test_pick_options_never_repeats_pair_words`: no distractor equals either word of the pair in either language.
  - `test_pick_options_raises_on_tiny_pool`.
  - `test_gate_accepts_solvable_puzzle`: solver factory returns the true seat with confidence 80 for the full transcript and a wrong seat for round 1 only -> result has `difficulty == 2`.
  - `test_gate_rejects_wrong_solver_answer`, `test_gate_rejects_low_confidence` (confidence 30), `test_gate_rejects_too_easy_round_one` (round-1 solver right at 98), `test_gate_rejects_when_solver_errors`.
  - `test_difficulty_boundaries`: 85 -> 1, 84 -> 2, 60 -> 2, 59 -> 3.
  - `test_generate_retries_with_a_new_candidate`: first candidate rejected by the gate, second accepted; `generate_puzzle` returns it.
  - `test_fill_queue_inserts_until_target_and_alternates_language`: target 2 with the fake LLM returns 2 inserted puzzles, their `origin_lang` values differ.
  - `test_fill_queue_never_publishes_a_rejected_puzzle` (Review Focus 5): solver always wrong -> 0 inserted, `ready_count() == 0`, terminates.
  - `test_fill_queue_resets_budget_per_pair`: with `GameConfig.room_ai_budget` patched small, still fills.

- [ ] **Step 2: Run** the new tests. Expected: FAIL.

- [ ] **Step 3: Implement** the four functions plus `fill_queue`. The solver prompt wraps transcript text with `prompts.data_block` and asks for ONLY JSON.

- [ ] **Step 4: Run** the new tests and the full suite. Expected: pass.

- [ ] **Step 5: Commit** `feat(spy-hunt): puzzle quality gate, options and queue filler`.

## Task 6: CLI, review tooling and docs (backend)

**Files:**
- Create: `scripts/build_puzzles.py`
- Modify: `README.md`
- Test: `tests/test_build_puzzles.py`

**Interfaces:**
- Consumes: `puzzle_gen.fill_queue`, `puzzles.list_ready`, `puzzles.veto`, `puzzles.ready_count`.
- Produces: `python -m ai_svc.spy_hunt.scripts.build_puzzles [--count N] [--review] [--veto ID]`. `main(argv: list[str] | None = None) -> int`. `--count` fills the queue to N (default `QUEUE_TARGET`) using the real database (`db.DB_PATH`, not a throwaway one) and prints how many were added. `--review` prints one line per ready puzzle: id, difficulty, origin language, civilian word (both languages), and the 10 statements indented. `--veto ID` vetoes and prints the outcome. Exit code 0 on success, 1 if a veto target is not ready.

- [ ] **Step 1: Write failing tests** calling `main([...])` with `capsys`: `test_review_lists_ready_puzzles_with_statements`, `test_veto_removes_from_queue_and_reports`, `test_veto_unknown_id_exits_1`, `test_count_fills_queue_with_fake_llm` (fake LLM registered as in Task 5 tests, `--count 1`).

- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_build_puzzles.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement** the CLI. In `README.md` add a "Daily puzzle" section: how the queue works, the three CLI commands, the cron line `0 3 * * * cd <repo> && venv/bin/python -m ai_svc.spy_hunt.scripts.build_puzzles --count 14` (keeps 14 ready), the `/daily` endpoint table rows (finish what Task 3 started), and the UTC-day rule.

- [ ] **Step 4: Run** the full suite. Expected: pass.

- [ ] **Step 5: Live check with the real model** (needs `DEEPSEEK_API_KEY` in `.env`; this spends real model calls, about 13 per puzzle). Run `venv/bin/python -m ai_svc.spy_hunt.scripts.build_puzzles --count 3` against a throwaway DB (`SPY_HUNT_DB_PATH=/tmp/daily_live.db`), then `--review`. Read the three puzzles. Report: how many pairs were attempted per accepted puzzle, which gate rejected most, and whether the clues read well. Fix prompt wording only if puzzles are clearly bad, and say what you changed.

- [ ] **Step 6: Commit** `feat(spy-hunt): puzzle queue CLI and docs`.

## Task 7: Frontend library: API, streaks, share text

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/daily/api.ts`, `src/daily/streak.ts`, `src/daily/share.ts`
- Test: `src/daily/api.test.ts`, `src/daily/streak.test.ts`, `src/daily/share.test.ts`

**Interfaces:**
- Consumes: `request<T>(method, path, body?)` from `src/api/client.ts`, `ensureGuest()` from `src/state/session.ts`, `Message` and `Lang` types.
- Produces:
  - Types in `src/api/types.ts`: `DailyStage = 'spy' | 'word' | 'done'`; `WordPair = Record<Lang, string>`; `DailyPuzzle { number; day; difficulty: 1|2|3; origin_lang: Lang; civilian_word: WordPair; players: {seat:number; name:string}[]; statements: Message[]; options: WordPair[] }`; `DailyMe { stage: DailyStage; tries: number; tries_left: number }`; `DailyState { puzzle: DailyPuzzle; me: DailyMe }`; `GuessResult { correct: boolean; stage: DailyStage; tries: number; tries_left: number }`; `WordResult { correct: boolean | null; stage: 'done' }`; `DailyResult { solved; tries; word_correct: boolean | null; elapsed_ms; score; answer: { spy_seat:number; spy_word: WordPair; civilian_word: WordPair }; stats: { players:number; solved_pct:number } }`.
  - `src/daily/api.ts`: `getDaily(): Promise<DailyState>`, `guessSpy(seat: number): Promise<GuessResult>`, `guessWord(option: number | null): Promise<WordResult>`, `getResult(): Promise<DailyResult>`. Each calls `ensureGuest()` first, then `request` on `/daily`, `/daily/guess` (body `{spy_seat}`), `/daily/word` (body `{option}`), `/daily/result`.
  - `src/daily/streak.ts`: `StreakState { lastDay: string | null; lastSolvedDay: string | null; streak: number; best: number; history: Record<string, { solved: boolean; score: number }> }`; `loadStreak(): StreakState`; `recordResult(day: string, solved: boolean, score: number): StreakState` (persists and returns); `playedToday(day: string): boolean`; `previousDay(day: string): string` (UTC date arithmetic). Storage key `spy-hunt.daily`. Rules: solved and `lastSolvedDay === previousDay(day)` -> `streak + 1`, solved otherwise -> `1`, unsolved -> `0`; `best = max(best, streak)`; recording a day already in `history` changes nothing; corrupt JSON or blocked storage falls back to an in-memory default and never throws.
  - `src/daily/share.ts`: `shareText(r: { number: number; tries: number; solved: boolean; elapsedMs: number; wordCorrect: boolean | null; streak: number; url: string }): string` and `shareResult(text: string): Promise<'shared' | 'copied' | 'failed'>` (uses `navigator.share` if present, else `navigator.clipboard.writeText`).
  - Exact share text, with `m:ss` for elapsed and each line separated by `\n`:
    - line 1: `Spy Hunter #<number> 🕵️`
    - line 2: wrong taps as `🟥` repeated, then `🟩` if solved, then ` ⏱ <m:ss>`, then ` ✅ word` or ` ❌ word` when `wordCorrect` is not null (nothing when skipped). Wrong taps = `tries - 1` when solved, `tries` when not.
    - line 3: `Streak <n> 🔥 <url>`, but `<url>` only when `streak >= 1`; when `streak == 0` the line is `Streak 0 <url>`.

- [ ] **Step 1: Write failing tests**:
  - api: each function hits the right method, path and body (mock `request` and `ensureGuest`).
  - streak: `test_first_solve_starts_streak_at_1`; `test_consecutive_days_increment`; `test_missed_day_resets_to_1` (Review Focus 4); `test_unsolved_day_resets_to_0_and_keeps_best`; `test_same_day_twice_does_not_double_count`; `test_previous_day_handles_month_and_year_boundaries` (`2027-01-01` -> `2026-12-31`, `2026-03-01` -> `2026-02-28`); `test_corrupt_json_falls_back` and `test_blocked_storage_does_not_throw` (stub `localStorage.getItem/setItem` to throw); `test_playedToday`.
  - share: exact strings for `{number:12, tries:2, solved:true, elapsedMs:72000, wordCorrect:true, streak:4, url:'https://x/daily'}` -> `Spy Hunter #12 🕵️\n🟥🟩 ⏱ 1:12 ✅ word\nStreak 4 🔥 https://x/daily`; unsolved `tries:2` -> `🟥🟥 ⏱ ...`; `wordCorrect:null` -> no word suffix; matches the exact line formats above with a regex (so it can hold no word, name or seat); `shareResult` uses `navigator.share` when present, falls back to clipboard, returns `'failed'` when both throw.

- [ ] **Step 2: Run** `yarn test src/daily`. Expected: FAIL.

- [ ] **Step 3: Implement** the types and the three modules.

- [ ] **Step 4: Run** `yarn test` and `yarn build`. Expected: all pass.

- [ ] **Step 5: Commit** `feat: daily puzzle api, streak store and share text`.

## Task 8: Daily screens and route

**Files:**
- Create: `src/screens/Daily.tsx`, `src/screens/DailyPlay.tsx`, `src/screens/DailyWord.tsx`, `src/screens/DailyResult.tsx`
- Modify: `src/routes.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/styles/global.css`
- Test: `src/screens/Daily.test.tsx`

**Interfaces:**
- Consumes: Task 7 `getDaily / guessSpy / guessWord / getResult`, `recordResult`, `loadStreak`, `shareText / shareResult`; `StatementBubble`; `t`, `useLang`; fixtures in `src/test/fixtures.ts`.
- Produces: route `/daily` -> `<Daily />`. `Daily` loads state with `getDaily()` and shows by `me.stage`: `spy` -> `DailyPlay`, `word` -> `DailyWord`, `done` -> `DailyResult` (which calls `getResult()`). Props: `DailyPlay({ puzzle, me, onGuess })`, `DailyWord({ puzzle, onPick })`, `DailyResult({ puzzle, result })`.
- Behaviour:
  - `DailyPlay`: header "Puzzle #N" plus a difficulty label (Easy/Medium/Hard); the civilian word in the viewer's language in a banner ("The civilians' word is ..."); statements grouped by round using `StatementBubble` (viewer language from `useLang()`, speaker name from `puzzle.players`); a button per player to tap as the spy; tries left shown; after a wrong tap the tapped player is marked and disabled, with a message; the guess buttons are disabled while a request is in flight.
  - `DailyWord`: "What was the spy's word?" with 4 buttons showing the option in the viewer's language, plus "Skip". After picking or skipping, loads the result.
  - `DailyResult`: shows who the spy was (name), the spy's word, score, tries, time (`m:ss`), "x% of players found the spy", streak (calls `recordResult(puzzle.day, solved, score)` once on mount, guarded so remounting does not double count), the share text in a preview box, a "Share" button (`shareResult`; shows "Copied" or "Shared"), a "Play a real round" button to `/`.
  - Errors: `503 no_puzzle` shows "Today's puzzle is not ready yet. Come back soon." with a Home button; network error shows the generic error with Retry.
  - New i18n keys in both languages with the `daily.` prefix, written in a plain, direct voice.

- [ ] **Step 1: Write failing tests** in `Daily.test.tsx` mocking `../daily/api` and `../daily/streak`:
  - `test_shows_civilian_word_and_statements_in_viewer_language`: en puzzle viewed with `setLang('zh-Hans')` shows the translation and the Chinese civilian word.
  - `test_tapping_the_spy_moves_to_word_stage`.
  - `test_wrong_tap_marks_player_and_shows_one_try_left` and `test_second_wrong_tap_shows_result`.
  - `test_buttons_disabled_while_request_in_flight` (double tap sends one request).
  - `test_word_stage_lists_four_options_and_skip`.
  - `test_result_shows_score_stats_streak_and_share_preview` (checks `recordResult` was called exactly once even after a re-render).
  - `test_share_button_reports_copied`.
  - `test_no_puzzle_shows_come_back_message` (Review Focus 3).
  - `test_reload_in_done_stage_goes_straight_to_result`: `getDaily` returns `stage: 'done'` -> `getResult` called, no guess buttons.

- [ ] **Step 2: Run** `yarn test src/screens/Daily.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** the four components, route, i18n keys and styles (reuse existing classes `screen`, `panel`, `btn`, `bubble`; add a small `.daily` block to `global.css`).

- [ ] **Step 4: Run** `yarn test` and `yarn build`. Expected: all pass.

- [ ] **Step 5: Commit** `feat: daily puzzle screens`.

## Task 9: Landing entry, e2e, README

**Files:**
- Modify: `src/screens/Landing.tsx`, `src/screens/Landing.test.tsx`, `src/i18n/*.json`, `e2e/backend.py`, `README.md`
- Create: `e2e/daily.spec.ts`

**Interfaces:**
- Consumes: `loadStreak`, `playedToday` (Task 7), the backend `puzzles.insert_ready` and `tests/puzzle_fixtures.sample_puzzle` (Task 1) via the backend directory.
- Produces: a "Daily Spy Hunter" card at the top of the Landing screen linking to `/daily`, showing the current streak (`Streak N 🔥`) when `streak >= 1`, and "Done today ✅" instead of the call to action when `playedToday(today UTC)`. `e2e/backend.py` seeds one ready puzzle at startup (the sample puzzle) so the e2e run has a puzzle.

- [ ] **Step 1: Write failing tests** in `Landing.test.tsx` (mock `../daily/streak`): card links to `/daily`; shows the streak; shows "Done today" when played; hides the streak line at 0.

- [ ] **Step 2: Run** `yarn test src/screens/Landing.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** the card and keys. In `e2e/backend.py`, after `init_db()`, import `puzzles` and `tests.puzzle_fixtures` from `BACKEND_DIR/ai_svc/spy_hunt` and insert the sample puzzle (the e2e backend runs from `BACKEND_DIR`, so `ai_svc.spy_hunt.tests.puzzle_fixtures` is importable).

- [ ] **Step 4: Write `e2e/daily.spec.ts`**: opens `/`, clicks "Daily Spy Hunter", sees the civilian word, taps the wrong player once and sees one try left, taps the spy (`Player` button named by the sample puzzle's spy name), picks the correct option, sees "Share" and a score, reloads and still sees the result, goes back to `/` and sees "Done today". Run with the Chromium command from the `README.md` e2e section. Expected: pass alongside the existing smoke test.

- [ ] **Step 5: Run** `yarn test`, `yarn build` and the e2e suite. Expected: all pass.

- [ ] **Step 6: Update `README.md`** with a short Daily puzzle section (what it is, the `/daily` route, how streaks are stored, how to refill the backend queue).

- [ ] **Step 7: Commit** `feat: daily entry on landing, e2e and docs`.

## Final check (owner of the plan)

- [ ] Run both full suites and the e2e. Expected: all pass.
- [ ] Re-read the spec sections 2 to 7 against the code: scoring table, tries, share format, 14-puzzle queue, veto, server-side timer, no answer leakage.
- [ ] Report anything intentionally different from the spec (the "all routes require a guest token" simplification is listed above).
