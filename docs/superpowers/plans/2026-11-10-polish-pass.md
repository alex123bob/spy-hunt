# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the small known gaps in the bot card, rule cards and daily puzzle before the next feature slice.

**Architecture:** Four independent, small tasks: rule/quirk tweaks in `bots.py`/`rules.py`/`outfits.py`; rematch cleanup in `game.py`; stricter puzzle gates in `puzzle_gen.py`; frontend error translation, lobby hint and colour names.

**Tech Stack:** Python 3 / Flask / SQLite / pytest with `fake_llm`; React 19 / TypeScript / vitest / Playwright.

**Spec:** none of its own: this pass implements the "Minor items" and "deferred" lists from `docs/superpowers/specs/2026-11-10-bot-dressup-design.md`, `2026-11-10-rule-cards-design.md` and `2026-11-09-daily-puzzle-design.md` §11 (all in `spy-hunt`). Read the sections named in each task.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `polish-pass` from `main`. Paths relative to `ai_svc/spy_hunt/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (603 pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, new branch `polish-pass` from `main`. Tests: `yarn test` (189 pass today), `yarn build`, e2e: `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; BACKEND_DIR=../PP-AI-Service yarn playwright test` (3 pass today).

## Global Constraints

- Behaviour changes are limited to what each task states; existing tests keep passing (update only assertions the task changes).
- New UI copy in **en and zh-Hans**. Code comments only where behaviour is not obvious.
- The information firewall and the per-room model-call budget are unchanged.

## Review Focus

1. **Accused across a re-vote:** a bot voted against only in stage 0 (then a re-vote spared it) counts as accused next round; a bot never voted against does not; older rounds' reveals never count. Task Q1.
2. **Rematch:** a custom bot whose owner is still in the room stays; one whose owner left is removed; built-in bots stay; the `rematch` event's player list matches the database. Task Q2.
3. **Puzzle gates with flaky solver output:** solver error on round 1, a missing `scores` list (old-style reply), a tie at the top. Task Q3.
4. **Error mapping:** an unknown error code falls back to the generic message; network errors keep their message; zh-Hans never shows English server text for the mapped codes. Task Q4.

---

## Task Q1: Bot rules and quirk tweaks

**Files:**
- Modify: `outfits.py` (the `number` quirk text), `rules.py` (`context`), `bots.py` (parse the outfit once)
- Test: `tests/test_outfits.py`, `tests/test_rules.py`, `tests/test_bots.py`
- Docs: `/Users/jiali/personal_github_repos/spy-hunt/docs/superpowers/specs/2026-11-10-rule-cards-design.md` (the `accused` row) and `README.md` (backend) if it quotes the condition.

**Interfaces:**
- `QUIRKS["number"]` becomes: `"Include at least one number written with digits (for example 3) in every statement, applied in the language of the statement."` (still contains "language of the statement").
- `rules.context(view)`: `accusers` is now the sorted unique voters against `my_seat` across **all** `reveal_history` entries whose `round` equals the latest entry's `round` (stage 0 and stage 1 both count; entries missing `round` count as their own round `None` and are only used if they are the latest). `leader` is unchanged (latest entry only). `alive_accusers` still filters `accusers` by `alive_seats`. The `accused` condition and `vote_accuser` use the widened `accusers`.
- `bots.py`: the outfit JSON of a custom bot row is parsed once per turn. Introduce `_outfit_of(me) -> dict | None` (the parsed dict, `None` for non-custom rows or invalid JSON); `_persona_of`, `_rules_of` and `_run_describe` use it and pass the dict to `compile_outfit` (which already accepts a dict). No behaviour change: the same fallbacks (broken JSON gives the cheerful persona and no rules).

- [ ] **Step 1: Write failing tests:**
  - `test_outfits.py::test_number_quirk_asks_for_digits`: `"digits" in QUIRKS["number"]` and `"language of the statement" in QUIRKS["number"]`.
  - `test_rules.py::test_accusers_include_the_stage_zero_votes_of_the_latest_round`: reveal_history `[{round: 1, stage: 0, votes: [{voter: 0, target: 1}], ...}, {round: 1, stage: 1, votes: [{voter: 2, target: 3}]}]`, `my_seat=1` gives `accusers == (0,)` and `leader == 3`.
  - `test_rules.py::test_accusers_ignore_older_rounds`: a round-1 reveal against me followed by a round-2 reveal not against me gives `accusers == ()`.
  - `test_rules.py::test_entries_without_round_still_work` (reveals lacking `round` do not raise; the latest entry alone is used).
  - `test_bots.py::test_outfit_is_parsed_once_per_turn`: monkeypatch `bots.json.loads` with a counting wrapper that delegates, run one custom-bot describe turn, assert the number of calls on that row's `outfit_json` string is 1.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_outfits.py ai_svc/spy_hunt/tests/test_rules.py ai_svc/spy_hunt/tests/test_bots.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the three changes and update the spec row (`accused`: "at least one vote against this bot in the latest voted round, including its re-vote").
- [ ] **Step 4: Run** the three files, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `fix(spy-hunt): accused counts the whole latest round, digit quirk, parse outfit once` (backend, branch `polish-pass`; the spec edit goes in the frontend repo's Q4 commit or its own `docs:` commit on the frontend `polish-pass` branch).

---

## Task Q2: Rematch drops bots whose owner left

**Files:**
- Modify: `game.py` (`rematch`)
- Test: `tests/test_custom_bots_room.py`

**Interfaces:**
- In `game.rematch`, before the `rematch` event is built: delete every player row with `bot_owner_id IS NOT NULL` whose `bot_owner_id` is not the `player_id` of a remaining human (`is_bot = 0`) row in the room. The event's `players` list (built after) reflects the deletion. Built-in bots and custom bots of present owners are untouched. Records and everything else are unchanged.

- [ ] **Step 1: Write failing tests** (`tests/test_custom_bots_room.py`, reuse its helpers; finish a game by setting the room to `finished` the way the existing rematch test does):
  - `test_rematch_removes_a_custom_bot_whose_owner_left`: two humans each with a custom bot; the second human leaves after the game finished... (a human leaving a finished room already deletes their own bot in `leave`, so build the orphan the other way: the owner left **mid-game** (seat becomes a built-in bot, custom bot stays), the game finishes, host rematches) → the orphan custom bot is gone from the `rematch` event and the DB; the former owner's converted built-in bot stays; the host's own custom bot stays.
  - `test_rematch_keeps_custom_bots_of_present_owners` (the existing test may already cover it: keep it green).
  - `test_rematch_event_players_match_the_database`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_custom_bots_room.py -q`. Expected: the new orphan test FAILS.
- [ ] **Step 3: Implement** the deletion in `rematch` (inside its existing transaction).
- [ ] **Step 4: Run** the file, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `fix(spy-hunt): rematch drops custom bots whose owner left`.

---

## Task Q3: Stricter puzzle quality gates

**Files:**
- Modify: `puzzle_gen.py`
- Test: `tests/test_puzzle_gen.py` (read it first for the fake-LLM helpers)
- Docs: `/Users/jiali/personal_github_repos/spy-hunt/docs/superpowers/specs/2026-11-09-daily-puzzle-design.md` §11 (mark the three items done, move them out of "deferred").

**Interfaces:**
- `_statement`: build the prompt with `bots._prompt_describe(view, persona, lang)` (language instruction now comes from the bot prompt) plus only the length sentence `"\nKeep the statement under 150 characters."`. Accept a statement only when `translation.detect_local(text) == lang`, or when the text has no alphabetic character at all (then `detect_local` is `None` and the statement is accepted as before). A mixed or other-language statement is retried (`STATEMENT_ATTEMPTS`) then fails the candidate.
- `_SolveOut` gains `scores: List[int] = []` (optional); the `solve` prompt additionally asks for `"scores": [<0-100 suspicion per seat 0-4, five numbers>]`. `solve` returns a 3-tuple-compatible result: change its return to `Optional[Tuple[int, int, List[int]]]` = `(spy_seat, confidence, scores)` where `scores` is the cleaned list (clamped 0-100) when it has exactly 5 integers, else `[]`. Update both callers.
- Gate changes in `_passes_gate`: (a) a failed round-1 solve (`first is None`) rejects the candidate (before it was treated as a pass); (b) with `len(scores) == 5` on the full solve, reject when the top score minus the second-highest is below `MIN_SCORE_GAP = 10` (the spy is not distinguishable); with no scores the check is skipped.
- New constant `MIN_SCORE_GAP = 10`.

- [ ] **Step 1: Write failing tests** (`tests/test_puzzle_gen.py`, reuse its solver fakes):
  - `test_round_one_solver_error_rejects_the_candidate`: the full solve succeeds and is correct; the round-1 solve raises `LlmError` → `_passes_gate` returns `None`.
  - `test_equal_scores_reject`: scores `[50, 52, 51, 50, 49]` with the right spy → `None`; scores with a gap of 10 or more → difficulty returned; no `scores` key in the reply → difficulty returned (back-compat).
  - `test_solve_returns_cleaned_scores`: out-of-range values are clamped; a list of the wrong length gives `[]`.
  - `test_mixed_language_statement_is_retried_then_rejected`: a statement like `"It is a 很 big 东西 thing"` (mixed) twice → `_statement` returns `None`; an all-digits/emoji statement is accepted; a correct-language statement is accepted.
  - `test_statement_prompt_names_the_language_once`: the prompt contains `"Write the statement in Simplified Chinese."` exactly once for a zh-Hans puzzle and no `"must be written in"`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_puzzle_gen.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified; update the §11 text in the spec.
- [ ] **Step 4: Run** the file, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): stricter puzzle gates (solver errors, score gap, language)`.

---

## Task Q4: Frontend error text, lobby hint, colour names

**Files:**
- Create: `src/api/errors.ts`, `src/api/errors.test.ts`
- Modify: `src/bots/BotForm.tsx`, `src/screens/Bots.tsx`, `src/screens/Lobby.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts`; tests `src/screens/Lobby.test.tsx`, `src/bots/BotForm.test.tsx`, `src/screens/Bots.test.tsx`

**Interfaces:**
- Produces `errorText(e: unknown): string` in `src/api/errors.ts`: for an `ApiError` with status `0` (network) returns `t('error.network')`; if the dictionary has `error.code.<code>` returns that text; otherwise `t('error.generic')`. Never returns the raw server `message`. (`t` returns the key itself when missing, so check by `t(key) !== key`.)
- New keys (en; zh-Hans plain and natural): `error.code.bad_name` "That name is not valid.", `error.code.bad_avatar` "That avatar is not valid.", `error.code.bad_outfit` "That outfit is not valid.", `error.code.bot_limit` "You can have up to 3 bots.", `error.code.not_found` "That could not be found.", `error.code.bot_in_room` "You already have a bot in this room.", `error.code.room_full` "The room is full.", `error.code.not_lobby` "That is only possible in the lobby.", `error.code.not_allowed` "You are not allowed to do that.", `error.code.not_host` "Only the host can do that.", `error.code.not_member` "You are not in this room.", `error.code.need_players` "More players are needed to start.", `error.code.rate_limited` "Too many requests, slow down.", `error.code.unauthorized` "Please reload the page.".
- Use `errorText` for the error line in `BotForm` (replacing the `bot_limit`/`bad_outfit`/message branching but keeping the existing duplicate-rule message and the translated `bots.saveError` for non-API failures), `Bots` (load/delete errors) and the Lobby `call` helper. Existing tests that assert server text (e.g. a rejected `ApiError(…, 'x', 'Server said no')` showing that message) change to assert the mapped or generic text.
- Lobby hint: a muted line (`lobby.fillHint`, en `"At least {min} players are needed. {n} bot(s) will be added when you start."`, `n` is `min_players - players.length`) shown only when `state.config.bot_fill` is true and `players.length < state.config.min_players`, below the players list; with `bot_fill` false and too few players, show `lobby.needMore` (en `"At least {min} players are needed to start."`) instead; nothing otherwise.
- Colour names: `bots.color.<hex without #>` keys for the six colours (`ff6b6b` "Red", `ffa94d` "Orange", `4cd08a` "Green", `38c9d6` "Teal", `5b8cff` "Blue", `b07cff` "Purple"); the colour swatch buttons in `BotForm` use that label as accessible name (fall back to the hex when a colour has no key).

- [ ] **Step 1: Write failing tests:**
  - `errors.test.ts`: network error → network text; `bot_in_room` → mapped text; unknown code `weird` → generic; the raw server message never appears; non-`ApiError` values → generic; zh-Hans mapped text differs from English (`setLang('zh-Hans')`).
  - `Lobby.test.tsx`: with 3 players, `min_players` 4, `bot_fill` true → hint `"At least 4 players are needed. 1 bot(s) will be added when you start."`; with `bot_fill` false → needMore text; with 4 players no hint; a failing add posts and shows the mapped text (e.g. `ApiError(409, 'bot_in_room', 'English server text')` shows `"You already have a bot in this room."` and not the server text).
  - `BotForm.test.tsx`: swatch buttons are found by name `Red`, `Blue`, etc.; a rejected save with `ApiError(400, 'bad_name', 'raw')` shows `"That name is not valid."`; a network failure shows the network text.
  - `Bots.test.tsx`: update the error assertions to the mapped/generic text.
  - `i18n.test.ts`: every key listed above exists in both languages.
- [ ] **Step 2: Run** `yarn test src/api src/bots src/screens src/i18n`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the helper, copy, hint, colour names and the call-site changes.
- [ ] **Step 4: Run** `yarn test && yarn build`, then the e2e suite (if a test relies on a hex label, update it). Expected: all pass (189 + new; e2e 3 pass).
- [ ] **Step 5: Commit** `feat: translated error text, lobby fill hint, colour names` (frontend, branch `polish-pass`; include the rule-cards spec edit from Q1 as a separate `docs:` commit).
