# Rule Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A custom bot carries up to 3 rule cards (`when` condition + `do` action); the server checks conditions on public state, statement actions steer the prompt, vote actions pick the target.

**Architecture:** Backend: rules live inside the outfit (`outfit.rules`), stored in a new `custom_bots.rules_json` column and copied into `players.outfit_json`; a new pure module `rules.py` evaluates conditions and actions over the `bots.public_view` dict; `bots.py` calls it. Frontend: a rule-row editor in the bot form and a rules list in the card view.

**Tech Stack:** Python 3 / Flask / SQLite / pytest with `fake_llm`; React 19 / TypeScript / vitest / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-rule-cards-design.md` (in `spy-hunt`); it builds on the merged `2026-11-10-bot-dressup-design.md`. Read both first.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, branch `spy-hunt-rule-cards` (already created from `main`). Paths relative to `ai_svc/spy_hunt/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (553 pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, branch `rule-cards` (already created, holds the spec). Tests: `yarn test` (174 pass today), `yarn build`, e2e: `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; BACKEND_DIR=../PP-AI-Service yarn playwright test` (3 pass today).
- Do the backend tasks (R1, R2) before the frontend tasks (R3, R4).

## Global Constraints

- `when` ids, verbatim: `accused, first_to_speak, last_to_speak, after_elimination, late_game`. `do` ids, verbatim: `counter_accuse, copy_previous, go_vague, vote_accuser, vote_leader`. Statement actions: `counter_accuse, copy_previous, go_vague`; vote actions: `vote_accuser, vote_leader`.
- At most **3 rules** per outfit; each `{when, do}` with both ids known; the same `{when, do}` pair twice is refused. `rules` missing means `[]`. Violations are `400 bad_outfit`.
- An `outfit` sent on PATCH replaces the whole outfit including rules (missing `rules` clears them).
- Condition semantics (from `public_view` only):
  - `accused`: the latest entry of `reveal_history` has at least one vote whose `target` is this bot's seat.
  - `first_to_speak`: describe phase and no statement exists yet for the current round and stage.
  - `last_to_speak`: describe phase, stage 0 only, every other alive seat has a statement in this round and stage 0.
  - `after_elimination`: some entry of `reveal_history` has a non-null `eliminated`.
  - `late_game`: `round >= max_rounds - 1`, where `max_rounds` is a new `public_view` field from the room config.
  - Stage is 1 when the phase is `tiebreak_describe` or `revote`, else 0. In a vote phase `first_to_speak` and `last_to_speak` are never true.
- Action semantics:
  - `counter_accuse` (statement): applies only if the latest reveal has voters against this bot; adds one sentence naming those voters **by seat number only**, never by name: "The players at seats [<seats>] voted for you last round. Voice suspicion toward them in the language of the statement, without revealing your word."
  - `copy_previous` (statement): skipped when nobody has spoken in the current round and stage; adds "Stay as close as possible in meaning to the previous speaker's clue."
  - `go_vague` (statement): adds "Make this clue vaguer and safer than usual, naming no distinguishing detail."
  - `vote_accuser` (vote): a seat from the latest reveal's voters against this bot that is in `valid_targets`, chosen at random among them; none valid means the card is skipped.
  - `vote_leader` (vote): the single seat with the most votes in the latest reveal, if it is in `valid_targets` and is not this bot; a tie or no legal seat means the card is skipped.
- Evaluation: rules are tried in list order. All holding statement rules add their sentence (max 3). For votes the first applicable vote rule decides and the model is **not** called; if none applies, the normal model vote runs. A vote rule never produces an illegal target (self, dead, non-tied in a re-vote).
- Prompt order: existing compiled outfit text, then rule sentences, then the closing "rules and format win" sentence stays last. Player names never appear in rule text.
- Information firewall and model-call budget unchanged. Outfits without `rules`, built-in personalities and existing tests keep working. A stored outfit with a broken or unknown rule entry plays as if that rule were absent.
- New UI copy in **en and zh-Hans**. Code comments only where behaviour is not obvious.

## API shapes

- `GET /bots/catalog` adds `triggers: string[]` (the `when` ids in the order above), `actions: string[]` (the `do` ids in the order above), `max_rules: 3`.
- `outfit` everywhere (`POST/PATCH /bots`, `MyBot`, `GET /bots/<id>`) becomes `{voice, style, quirk, rules: {when: string, do: string}[]}`; a response always includes `rules` (possibly `[]`).

## Review Focus

1. **Stored/copy drift:** a bot created before this change (no `rules_json`, NULL) must read as `rules: []` in every API and room copy; an old `players.outfit_json` without `rules` must still play. Tasks R1, R2.
2. **Conditions on odd state:** first speaker of a round, a tiebreak stage, a re-vote with a narrowed target list, the bot being the only alive seat besides one other, `reveal_history` empty or with `null` votes (abstentions), a reveal whose voter is dead. Task R2.
3. **Illegal or leaking actions:** a vote rule whose target is self/dead/not tied must be skipped and the model vote used; no player name in any rule sentence; no role or other-seat word in the prompt. Task R2.
4. **Bad rule payloads:** 4 rules, duplicates, unknown ids, non-list, non-object entries, `null` rules. Task R1.
5. **Frontend:** adding past 3 rows is impossible; removing a row in the middle keeps the others; editing a bot with no rules (created earlier) works; the public card of a bot with no rules shows no empty rules block; long Chinese labels do not overflow. Tasks R3, R4.

---

## Task R1: Rules in the outfit, storage, API and room copy

**Files:**
- Modify: `outfits.py`, `db.py`, `custombots.py`, `game.py` (`_insert_bot`)
- Test: `tests/test_outfits.py`, `tests/test_custom_bots.py`, `tests/test_custom_bots_room.py`

**Interfaces:**
- Produces in `outfits.py`: `TRIGGERS: tuple[str, ...]` and `ACTIONS: tuple[str, ...]` (ids per Global Constraints, in that order), `MAX_RULES = 3`, `STATEMENT_ACTIONS: frozenset[str]`, `VOTE_ACTIONS: frozenset[str]`; `check_outfit(value) -> dict` now also returns `"rules": list[{"when","do"}]` (missing or `None` gives `[]`; `400 bad_outfit` for a non-list, a non-dict entry, an unknown id, more than 3, or a duplicate pair); `catalog()` adds `triggers`, `actions`, `max_rules`; new `clean_rules(value: Any) -> list[dict]` that never raises: it returns the valid `{when, do}` entries of whatever it is given (non-list gives `[]`, unknown or malformed entries are dropped, capped at 3, duplicates dropped). Used when reading stored data.
- Produces in `db.py`: `custom_bots` column `rules_json TEXT` in `SCHEMA` and added by `init_db()` to an existing table when missing (same idempotent `PRAGMA table_info` + `ALTER TABLE` approach as `players`).
- Produces in `custombots.py`: `_card` outfit gains `"rules": outfits.clean_rules(json.loads(row["rules_json"]))` (NULL or invalid JSON reads as `[]`); `create` and `update` store `json.dumps(out["rules"])` in `rules_json`.
- Produces in `game._insert_bot`: the copied `outfit_json` also contains `"rules"` (from the custom bot's `rules_json`, via `clean_rules`).

- [ ] **Step 1: Write failing tests:**
  - `tests/test_outfits.py`: `test_check_outfit_defaults_rules_to_empty` (no `rules` key and `rules: None` both give `[]`); `test_check_outfit_accepts_up_to_three_valid_rules`; `test_check_outfit_rejects_bad_rules` parametrised: 4 rules, the same pair twice, unknown `when`, unknown `do`, `rules: "x"`, `rules: [1]`, `rules: [{"when": "accused"}]` all raise `StoreError` code `bad_outfit`; `test_clean_rules_never_raises_and_drops_bad_entries` (`None`, `"x"`, `[1, {"when": "accused", "do": "go_vague"}, {"when": "nope", "do": "go_vague"}]` gives only the valid one; more than 3 valid ones are capped at 3); `test_catalog_has_triggers_actions_and_max_rules`; the action sets partition `ACTIONS`.
  - `tests/test_custom_bots.py`: `test_rules_roundtrip_through_create_list_update_public_card` (create with 2 rules, list and public card show them in order; PATCH with an outfit without `rules` clears them; PATCH with an outfit with new rules replaces them); `test_bot_without_rules_json_reads_as_empty_rules` (insert a row via SQL with `rules_json` NULL and read it through `GET /bots` and `GET /bots/<id>`: `rules == []`); `test_bad_rules_are_400_bad_outfit` through the HTTP routes; `test_catalog_endpoint_lists_triggers_and_actions`; `test_old_custom_bots_table_is_migrated` (create the table without `rules_json`, run `init_db()` twice: column exists, rows survive).
  - `tests/test_custom_bots_room.py`: `test_room_copy_carries_the_rules`: create a bot with rules, add it to a room, read `players.outfit_json` from the DB: its `rules` equal the bot's; editing the bot's rules afterwards leaves the room copy unchanged; the snapshot and `player_joined` event text contain no `rules` and no `outfit_json` key.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_outfits.py ai_svc/spy_hunt/tests/test_custom_bots.py ai_svc/spy_hunt/tests/test_custom_bots_room.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified. Keep `_check` for the three slots and add the rules validation beside it; `check_outfit`'s existing error codes are unchanged.
- [ ] **Step 4: Run** the three files, then the whole suite. Expected: all pass (553 + new).
- [ ] **Step 5: Commit** `feat(spy-hunt): rule cards in the outfit, storage and API` (backend repo, branch `spy-hunt-rule-cards`).

---

## Task R2: Rule engine and bot integration

**Files:**
- Create: `rules.py`, `tests/test_rules.py`
- Modify: `bots.py`
- Test: `tests/test_bots.py`

**Interfaces:**
- Consumes: `outfits.clean_rules`, `outfits.STATEMENT_ACTIONS`, `outfits.VOTE_ACTIONS`; the `public_view` dict (`my_seat`, `players`, `alive_seats`, `statements`, `reveal_history`, `round`, `phase`).
- Produces in `bots.py`: `public_view` gains `"max_rounds": int` (from the room's `config_json["max_rounds"]`, falling back to `round` when absent). Remove nothing from the view.
- Produces in `rules.py` (pure; no DB, no model; imports only `outfits`):
  - `@dataclass(frozen=True) class RuleContext: seat: int; stage: int; describing: bool; accusers: tuple[int, ...]; leader: int | None; spoken_in_stage: int; others_all_spoken: bool; eliminated: bool; late_game: bool`
  - `context(view: dict) -> RuleContext`. `accusers`: voters against `my_seat` in the latest `reveal_history` entry (sorted, unique; a voter that is not in `view["players"]` is still listed; `null` targets ignored). `leader`: the single seat with the most non-null votes in that entry, else `None`. `spoken_in_stage`: statements with `round == view["round"]` and the current stage. `others_all_spoken`: stage 0, describing, and every alive seat other than `my_seat` has a statement in this round and stage 0. `describing`: `view["phase"]` in `("describe", "tiebreak_describe")`. Never raises on missing keys (treat as empty).
  - `holds(when: str, ctx: RuleContext) -> bool` per Global Constraints (`first_to_speak`: `describing and spoken_in_stage == 0`; `last_to_speak`: `describing and stage == 0 and others_all_spoken`; unknown id gives `False`).
  - `statement_lines(rules: list[dict], ctx: RuleContext) -> list[str]`: for each rule in order with a statement action whose `when` holds, and whose action is applicable, the action's sentence (exact wording in Global Constraints; the seats list formatted like `[2, 3]`); at most 3 lines; unknown or vote actions ignored.
  - `vote_pick(rules: list[dict], ctx: RuleContext, valid_targets: list[int], rng) -> int | None`: first rule in order with a vote action whose `when` holds and that yields a legal seat per Global Constraints; `rng.choice` for `vote_accuser`; else `None`.
- Produces in `bots.py`: `_run_describe` appends `"\n".join(lines)` of `rules.statement_lines(...)` (when non-empty) to the persona text passed to `_prompt_describe` for that call, before the closing sentence (compile order: see Global Constraints; implement by having `compile_outfit` accept an optional `extra: list[str] = ()` argument whose lines are inserted before the closing sentence, so the closing sentence stays last). `_run_vote` calls `rules.vote_pick(...)` first; a non-`None` result is submitted through `_submit_vote_or_fallback` and **no model call is made**. The rules come from `outfits.clean_rules(json.loads(me["outfit_json"]).get("rules"))`, with any JSON error giving `[]`.

- [ ] **Step 1: Write failing tests:**
  - `tests/test_rules.py` (build `view` dicts by hand; a helper `view(**over)` with 4 players, `my_seat=1`, `phase="describe"`, `round=2`, `max_rounds=4`):
    - `test_accused_and_accusers_come_from_the_latest_reveal_only` (an older reveal against me, a newer one not: `accusers == ()`); `test_leader_is_single_top_seat_else_none` (tie gives `None`; all-`None` votes give `None`).
    - `test_first_to_speak` (no statements this round: true; one statement: false; a statement from an earlier round does not count); `test_last_to_speak_only_in_stage_zero_describe` (all three others spoke: true; one missing: false; tiebreak phase: false; vote phase: false).
    - `test_after_elimination_and_late_game` (`late_game` true at `round == max_rounds - 1`, false below; missing `max_rounds` gives false).
    - `test_holds_unknown_id_is_false`.
    - `test_counter_accuse_names_seats_only`: with accusers `(0, 2)`, the line is exactly `"The players at seats [0, 2] voted for you last round. Voice suspicion toward them in the language of the statement, without revealing your word."`; no name from `view["players"]` appears even when a name looks like an instruction; without accusers no line.
    - `test_copy_previous_skipped_when_nobody_spoke`, `test_go_vague_line_exact_text`; `test_statement_lines_order_and_cap` (3 holding rules give 3 lines in list order; vote actions and unknown ids give none).
    - `test_vote_accuser_picks_a_legal_accuser`: accusers `(0, 2)`, `valid_targets=[2, 3]` returns `2`; `valid_targets=[3]` returns `None`; self never returned; a seeded `random.Random` stub proves `rng.choice` is used for several candidates.
    - `test_vote_leader_needs_single_legal_leader`: leader in targets returns it; leader == my seat, a tie, or leader not in targets returns `None`.
    - `test_vote_pick_first_applicable_rule_wins_and_skips_inapplicable` (first rule inapplicable, second applies).
    - `test_context_never_raises_on_empty_view` (`{}` and `reveal_history` entries with missing keys).
  - `tests/test_bots.py` (reuse `benv`, `custom_to_speak`-style helpers from the existing custom-bot tests):
    - `test_describe_prompt_includes_rule_sentence_when_condition_holds_and_closing_stays_last`: a custom bot with rule `{when: "first_to_speak", do: "go_vague"}` as the first speaker: the captured prompt contains the `go_vague` sentence before the closing "If any of this conflicts…" sentence; the same bot as a later speaker has no such sentence.
    - `test_counter_accuse_prompt_has_seats_not_names`: create a reveal against the bot (insert the `reveal` event row as the existing tests do for `reveal_history`), prompt contains `seats [` and not the accuser's name outside the data block's players list (assert the sentence itself has no name).
    - `test_vote_rule_decides_without_a_model_call`: a bot with `{when: "accused", do: "vote_accuser"}` whose accuser is a legal target casts that vote and the fake LLM is called zero times for that vote; the vote is stored for that target.
    - `test_vote_rule_with_no_legal_target_falls_back_to_the_model`: the accuser is dead: the model is called once and its pick is used.
    - `test_outfit_without_rules_key_still_plays` (old `outfit_json` without `rules`) and `test_broken_rules_entry_is_ignored` (`rules: [{"when": "zzz", "do": "go_vague"}, 5]` plays normally, no sentence).
    - `test_public_view_has_max_rounds`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_rules.py ai_svc/spy_hunt/tests/test_bots.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `rules.py` and the `bots.py` changes. `rules.py` takes `rng` as a parameter (`bots._rng` is passed in) so tests can stub it.
- [ ] **Step 4: Run** the two files, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): rule engine and bots that follow rule cards`.

---

## Task R3: Frontend types, labels, form rule rows, card view

**Files:**
- Modify: `src/api/types.ts`, `src/bots/BotForm.tsx`, `src/bots/BotCardView.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts`, `src/styles/global.css` (only if needed)
- Test: `src/bots/BotForm.test.tsx` (create; or extend `src/screens/Bots.test.tsx`), `src/bots/BotCardView.test.tsx` (create), `src/screens/BotPage.test.tsx`

**Interfaces:**
- Produces in `types.ts`: `BotRule = { when: string; do: string }`; `BotOutfit` gains `rules: BotRule[]` (required: the API always returns it; fix fixtures and tests that build outfits); `BotCatalog` gains `triggers: string[]`, `actions: string[]`, `max_rules: number`.
- Produces i18n keys (en copy; zh-Hans plain and natural): `bots.rules` "Rule cards", `bots.rules.add` "Add rule", `bots.rules.remove` "Remove rule", `bots.rules.when` "When", `bots.rules.then` "Then", `bots.rules.limit` "Up to 3 rules.", `bots.rules.line` "When {when} → {do}" (`{when}`, `{do}` are the labels below), `bots.when.accused` "I am accused", `bots.when.first_to_speak` "I speak first", `bots.when.last_to_speak` "I speak last", `bots.when.after_elimination` "someone is out", `bots.when.late_game` "it is late in the game"; `bots.do.counter_accuse` "counter-accuse", `bots.do.copy_previous` "copy the previous clue", `bots.do.go_vague` "go vague", `bots.do.vote_accuser` "vote for who voted for me", `bots.do.vote_leader` "vote with the leader".
- `BotForm`: below the three slot groups, a "Rule cards" section. Each rule is a row with two `<select>`s (labelled by `bots.rules.when` / `bots.rules.then`, options from `catalog.triggers` / `catalog.actions` labelled by the keys above) and a "Remove rule" button (accessible name `Remove rule`); an "Add rule" button, disabled at `catalog.max_rules` rows with the hint `bots.rules.limit`. New rows default to the first trigger and first action. `draft.outfit.rules` is what is saved; removing a middle row keeps the others in order; a duplicate pair is allowed in the UI but the server's `bad_outfit` error is shown via the existing error line. Editing a bot whose `outfit.rules` is missing or not an array (defensive) starts from `[]`.
- `BotCardView`: when `outfit.rules` has entries, a list of lines `bots.rules.line`, inside the card; with no rules no heading and no empty block.

- [ ] **Step 1: Write failing tests:**
  - `BotForm` tests (mock `./api` like `Bots.test.tsx` does): `Add rule` appends a row with the first trigger/action selected; the button is disabled with the hint at 3 rows; changing the selects updates the live preview line `When I am accused → counter-accuse`; removing the middle of three rows leaves the first and third; Save calls `createBot` with `outfit.rules` equal to the rows in order; editing a bot whose outfit has `rules: [{when: 'late_game', do: 'go_vague'}]` shows one prefilled row and `updateBot` receives it; editing a bot whose outfit lacks `rules` (cast) works and saves `rules: []`; a `bad_outfit` rejection shows the alert.
  - `BotCardView` tests: lines render in order for a bot with 2 rules; no `Rule cards` text for `rules: []`; a long Chinese label renders (`setLang('zh-Hans')`) inside an element with the `wrap` class.
  - `BotPage.test.tsx`: the public page shows the rule lines for a bot with rules.
  - `i18n.test.ts`: every `triggers`/`actions` id has `bots.when.<id>` / `bots.do.<id>` in both languages.
  - Update fixtures: every existing test that builds a `BotOutfit` now includes `rules: []`.
- [ ] **Step 2: Run** `yarn test src/bots src/screens src/i18n`. Expected: new tests FAIL (and old ones fail to type-check until fixtures are updated).
- [ ] **Step 3: Implement** types, copy, form section and card view; add CSS only if the rows need layout (`.rule-row { display: flex; gap: 8px; flex-wrap: wrap }`, selects at least 44px tall like other inputs).
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass (174 + new).
- [ ] **Step 5: Commit** `feat: rule cards in the bot form and card` (frontend repo, branch `rule-cards`).

---

## Task R4: End-to-end check and docs

**Files:**
- Modify: `e2e/bots.spec.ts`, `README.md` (frontend), `ai_svc/spy_hunt/README.md` (backend)

- [ ] **Step 1: Extend the e2e test** `e2e/bots.spec.ts`: after choosing the slots, click `Add rule`, pick `I am accused` / `vote for who voted for me`, save; the card shows `When I am accused → vote for who voted for me`; the public page (fresh context) shows the same line; the bot still joins a room and the game starts to the table. Use the labels from R3.
- [ ] **Step 2: Run** the e2e suite (command in "Repos and branches"). Expected: 3 pass.
- [ ] **Step 3: Docs.** Frontend `README.md`: one sentence on rule cards in the bots paragraph. Backend `ai_svc/spy_hunt/README.md` "Custom bots" section: the `rules` field in `outfit`, the five conditions and five actions, that conditions use public state only, that vote rules skip the model call, and that rule text names players by seat only.
- [ ] **Step 4: Run** `yarn test && yarn build` and the backend suite. Expected: all pass.
- [ ] **Step 5: Commit** `test: e2e for rule cards; docs` in each repo that changed (frontend `e2e` + README; backend README as `docs(spy-hunt): rule cards`).
