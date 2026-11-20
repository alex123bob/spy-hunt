# Bot Voting Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a custom bot pick a voting strategy, and give every built-in bot a randomly chosen but stable one.

**Architecture:** A new `vote` field joins the Mind settings (`outfits.MIND_DEFAULTS`, stored in `custom_bots.mind_json`, copied into the room's `outfit_json`). Pure functions decide each strategy from public last-round vote data already in `rules.RuleContext`; `bots._run_vote` applies them between the rule-card pick and the model call. Built-in bots derive a strategy from a hash of their player id.

**Tech Stack:** Python/Flask/SQLite/pydantic (backend repo PP-AI-Service, `ai_svc/spy_hunt`, venv `/tmp/ppvenv`, `pytest`), React + TypeScript + vitest (frontend repo spy-hunt, `src/`).

**Spec:** `docs/superpowers/specs/2026-11-20-bot-voting-strategy-design.md` (in the spy-hunt repo)

## Global Constraints

- Field name `vote`; ids exactly: `evidence` (default), `follow_last`, `grudge`, `odd_one_out`, `independent`, `cover`. Missing or unknown stored value means `evidence`; an unknown value in a request gives `400 bad_outfit`.
- Inputs come only from `bots.public_view` (last reveal's votes, alive seats, statements). Current-round votes are hidden and must never be read.
- Order in `bots._run_vote`: rule-card pick, then server-picked strategies (`follow_last`, `grudge`), then the model path. Existing validity check and random fallback stay.
- `follow_last`: vote the single last-reveal leader if it is in `valid_targets` and is not this bot; `grudge`: a random seat from `ctx.accusers` that is in `valid_targets` and is not this bot. Both fall back to the normal model vote when they find nothing. Neither makes a model call.
- `independent`: remove the last-reveal leader from the seats shown to the model only when at least 2 other seats would remain; the model's pick is still validated against the full `valid_targets`.
- `odd_one_out` adds one instruction line (vote for the player whose statements fit least with the others'). `cover` adds one conditional line only when a last-reveal leader exists: if you suspect you may be the spy because your word does not fit the others' statements, vote for seat N (the leader). Lines refer to seats by number only.
- Built-in weights by `sha256(player_id)` (like `bot_temperature`): evidence 50, follow_last 15, grudge 10, odd_one_out 10, independent 5, cover 10. Stable per player id.
- Arena (`arena.py`) and `puzzle_gen.py` must not change.
- A stored outfit or `mind_json` without `vote` plays as `evidence`, byte-identical vote prompt to today's.
- zh-Hans and en text for every new label, help and description.

## Review Focus

- A strategy with nothing to act on (no last round, no accusers, leader is this bot, leader is not a legal target in a re-vote) votes via the normal model path and still submits.
- A rule-card vote that fires still wins over the strategy.
- `independent` with only 1 or 2 candidates left never shows the model an empty list.
- No prompt contains a current-round vote, a role, or another seat's word.
- Built-in assignment is deterministic for a player id and the weights roughly hold over many ids.

---

### Task 1: Field, validation, catalog, storage

**Files:**
- Modify: `ai_svc/spy_hunt/outfits.py`, `ai_svc/spy_hunt/custombots.py` only if `mind_json` handling needs the new key (it iterates `MIND_DEFAULTS`, so verify), tests
- Test: `ai_svc/spy_hunt/tests/test_outfits.py`, `ai_svc/spy_hunt/tests/test_custom_bots.py`

**Interfaces:**
- Produces: `outfits.VOTES = ("evidence","follow_last","grudge","odd_one_out","independent","cover")`; `MIND_DEFAULTS["vote"] == "evidence"`; `check_mind`/`clean_mind`/`check_outfit` handle `vote`; `catalog()` gains `"votes": list(VOTES)`.

- [ ] **Step 1: Write failing tests:** `test_vote_defaults_and_choices` (legacy outfit gives `vote=="evidence"`, each id accepted), `test_bad_vote_rejected` (parametrize `"x"`, `3`, `None` each raises `StoreError` code `bad_outfit` through `check_outfit`), `test_clean_mind_drops_unknown_vote`, `test_catalog_lists_votes`; in `test_custom_bots.py`: `test_vote_stored_and_returned_in_card` and `test_changing_vote_resets_ranked_record`.
- [ ] **Step 2:** Run `/tmp/ppvenv/bin/python -m pytest ai_svc/spy_hunt/tests/test_outfits.py ai_svc/spy_hunt/tests/test_custom_bots.py -v`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement `VOTES`, extend `MIND_DEFAULTS` and `_MIND_CHOICES`, `catalog()`. Check `custombots.py` (`create`, `update`, `_card`, `_same_outfit`, `stored_mind`) and `game._insert_bot` pick the key up through `MIND_DEFAULTS`; add it only where a literal key list exists.
- [ ] **Step 4:** Run the same command plus `test_custom_bots_room.py`. Expected: PASS (update any test asserting the exact mind dict to include `vote`).
- [ ] **Step 5: Commit** `git commit -m "feat: add the vote strategy field to bot minds"`

### Task 2: Pure strategy functions

**Files:**
- Create: `ai_svc/spy_hunt/votes.py`
- Test: `ai_svc/spy_hunt/tests/test_votes.py`

**Interfaces:**
- Consumes: `rules.RuleContext` (fields `seat`, `accusers`, `leader`), `outfits.VOTES`.
- Produces:
  - `pick(strategy: str, ctx: RuleContext, valid_targets: list[int], rng) -> Optional[int]` (only `follow_last` and `grudge` ever return a seat; everything else returns None)
  - `line(strategy: str, ctx: RuleContext) -> str` (`odd_one_out` always; `cover` only when `ctx.leader` is an int and not `ctx.seat`; else empty string)
  - `targets_for_prompt(strategy: str, ctx: RuleContext, valid_targets: list[int]) -> list[int]` (`independent` removes `ctx.leader` when at least 2 seats remain; all others return `valid_targets` unchanged)
  - `BUILTIN_WEIGHTS: tuple[tuple[str, int], ...]` and `builtin_strategy(player_id: str) -> str` (sha256 of the id picks by cumulative weight)

- [ ] **Step 1: Write failing tests:** `pick` cases (`follow_last` with leader 3 legal gives 3; leader is self, leader not legal, leader None each give None; `grudge` picks only from accusers that are legal and not self, returns None with no accusers; other strategies return None), `line` cases (`cover` empty when no leader or leader is self, contains the seat number when it applies; `odd_one_out` non-empty; `evidence` empty; no line contains the word "role"), `targets_for_prompt` cases (`independent` removes the leader with 3 candidates, keeps both with 2 candidates after removal would leave 1, leaves the list alone when the leader is None; other strategies unchanged), `test_builtin_strategy_is_deterministic_and_known`, `test_builtin_weights_roughly_hold` (5000 ids: evidence between 45% and 55%, and every id of `VOTES` appears).
- [ ] **Step 2:** Run `/tmp/ppvenv/bin/python -m pytest ai_svc/spy_hunt/tests/test_votes.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the module. Wording of the two lines is the builder's; both end "in the language of the statement" is not needed (votes are not text), refer to seats by number only.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: pure voting strategy functions"`

### Task 3: Wire into `_run_vote`

**Files:**
- Modify: `ai_svc/spy_hunt/bots.py` (`_run_vote`, `_prompt_vote`)
- Test: `ai_svc/spy_hunt/tests/test_bots.py`

**Interfaces:**
- Consumes: `votes.pick`, `votes.line`, `votes.targets_for_prompt`, `votes.builtin_strategy`, `minds.clean_mind` via `outfits.clean_mind`.
- Produces: `_prompt_vote(view, persona, valid_targets, suspects=(), strategy_line: str = "")` (empty line leaves the prompt byte-identical to today's); `_vote_strategy_of(me, outfit) -> str` (custom bot: `clean_mind(outfit)["vote"]`; built-in: `votes.builtin_strategy(me["player_id"])`; corrupt custom outfit: `"evidence"`).

- [ ] **Step 1: Write failing tests** with the fake LLM in `test_bots.py`: `follow_last_votes_the_last_leader_without_a_model_call` (zero `call_json` calls, vote equals the leader), `grudge_votes_an_accuser_without_a_model_call`, `rule_card_vote_beats_strategy` (a `vote_leader` rule and `grudge` strategy: the rule's seat wins), `strategy_with_nothing_to_act_on_uses_the_model` (first round, no reveal history: one model call, vote submitted), `cover_line_in_prompt_only_when_leader_exists`, `odd_one_out_line_in_prompt`, `independent_hides_the_leader_from_the_prompt_seat_list_but_a_leader_pick_is_still_accepted`, `evidence_prompt_is_byte_identical_to_today`, `builtin_bot_gets_a_strategy_by_player_id` (monkeypatch `votes.builtin_strategy` to return `"grudge"` and assert the grudge path runs for a non-custom bot), `corrupt_outfit_custom_bot_votes_as_evidence`, and `no_current_round_votes_in_any_vote_prompt` (build a room with current-round votes present in the table, assert their voter/target pairs are absent from the prompt).
- [ ] **Step 2:** Run `/tmp/ppvenv/bin/python -m pytest ai_svc/spy_hunt/tests/test_bots.py -v -k "vote or strategy or grudge or follow or cover or independent"`. Expected: FAIL.
- [ ] **Step 3:** Implement in `_run_vote`: after the rule-card pick and before the `deep` analysis, compute the strategy; for `follow_last`/`grudge` call `votes.pick(...)` and submit through `_submit_vote_or_fallback` when it returns a seat; otherwise build the model prompt with `votes.targets_for_prompt(...)` as the shown seats and `votes.line(...)` as the strategy line. The validity check still uses the full `valid_targets`.
- [ ] **Step 4:** Run the whole backend suite `/tmp/ppvenv/bin/python -m pytest ai_svc/spy_hunt/tests -q`. Expected: all PASS except the known unrelated `test_clans_seasons::test_members_sorted_by_this_week_points`.
- [ ] **Step 5: Commit** `git commit -m "feat: apply bot voting strategies in the vote path"`

### Task 4: Frontend picker, card line, i18n

**Files:**
- Modify (repo spy-hunt): `src/api/types.ts` (`BotOutfit.vote?: string`, `BotCatalog.votes: string[]`), `src/bots/mind.ts` (`MIND_DEFAULTS.vote = 'evidence'`, `withMind` fills it), `src/bots/BotForm.tsx` (a "Voting" picker under Mind, using the existing `picker` helper, help bubble and description), `src/bots/BotCardView.tsx` (a card line), `src/i18n/en.json`, `src/i18n/zh-Hans.json`, fixtures that build a `BotCatalog`
- Test: `src/bots/BotForm.test.tsx`, `src/bots/BotCardView.test.tsx`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: backend catalog `votes` and card `outfit.vote` from Task 1.

- [ ] **Step 1: Write failing tests:** `BotForm` shows a "Voting" radio group with the catalog's ids; picking one sends `outfit.vote` in the `createBot` body; an old bot without `vote` shows "Follow the evidence" selected and saves it; the info button "About Voting" opens a bubble and the chosen option's description shows; `BotCardView` shows the voting line in en and zh-Hans; the i18n test extends the "every bot option has a label and help in both languages" check with `vote: [evidence, follow_last, grudge, odd_one_out, independent, cover]` (keys `bots.vote`, `bots.vote.<id>`, `bots.vote.<id>.desc`, `bots.help.vote`).
- [ ] **Step 2:** Run `yarn vitest run src/bots src/i18n`. Expected: FAIL.
- [ ] **Step 3:** Implement. Labels (en): Follow the evidence, Follow the table, Hold a grudge, Odd one out, Think independently, Cover story; write natural zh-Hans, and a one-line description per option plus a `bots.help.vote` bubble text, matching the spec's table.
- [ ] **Step 4:** Run `yarn vitest run` and `yarn tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git commit -m "feat: voting strategy picker on the bot form"`

### Task 5: Whole-suite check

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-bot-voting-strategy-design.md` only if the build differs from it

- [ ] **Step 1:** Run the backend suite and `yarn vitest run`. Expected: all PASS apart from the known unrelated backend failure.
- [ ] **Step 2:** Run `yarn playwright test e2e/bots.spec.ts e2e/smoke.spec.ts`. Expected: PASS; report failures instead of editing tests.
- [ ] **Step 3:** Commit any spec update with `git commit -m "docs: voting strategy spec matches the build"`.
