# Living Bot (Daily Arena and Recaps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a day, custom bots play a bot-only arena match on paper with the real model, and their owners find a structured recap and a public match page on their next visit.

**Architecture:** Backend: a new `arena.py` plays a match on paper from the engine's pure functions and the bot code, stores it in two new tables, and updates a separate arena record; a cron script (`scripts/arena_night.py`) selects bots and runs the night; three new routes serve recaps and the match. Frontend: a `/match/:id` page, a "While you were away" section on `/bots`, a badge on the Landing card, an arena line on the bot card, and an opt-out checkbox in the form.

**Tech Stack:** Python 3 / Flask / SQLite / pytest with `fake_llm`; React 19 / TypeScript / vitest / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-living-bot-arena-design.md` (this repo). Read it first; section numbers refer to it.

**Repos and branches** (nothing is merged or pushed):
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `living-bot` from `main`. Paths below are relative to `ai_svc/spy_hunt/` unless they start with `src/` or `e2e/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (642 pass today).
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, new branch `living-bot` from `main`. Tests: `yarn test` (225 pass today), `yarn build`, e2e: `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; BACKEND_DIR=../PP-AI-Service yarn playwright test` (4 pass today).

## Global Constraints

- Named constants in `arena.py`: `ARENA_MATCHES_PER_DAY = 20`, `ARENA_SEATS = 5`, `ARENA_ACTIVE_DAYS = 14`, `ARENA_KEEP_DAYS = 14`.
- Arena games never touch `ranked_*` columns, `listed`, or the top-bots board.
- No owner information in any response (recaps are only visible to the owner; the match page is public and shows none).
- Information firewall: every arena bot view is built from public data only (its own word, statements, alive seats, reveal history without roles, round, phase). No other seat's word and no role ever enters a prompt.
- Model calls only from the script, only through `llm.call_json("bot", ...)` against a throwaway room id; never inside a request.
- Existing bots, rooms, ranked record, board and all existing tests keep working. Old rows read as `arena` on, record 0, `last_active` null (null counts as `created_at`).
- New UI copy in **en and zh-Hans**. Code comments only where behaviour is not obvious.

## Review Focus

1. **Firewall in the paper game:** a civilian's prompt never contains the spy's word; `reveal_history` has no `role`; a rule card (for example `vote_accuser`) works from the arena view. Task A2.
2. **Re-running the same day:** a second run plays nobody twice and double-counts nothing; a crash mid-match leaves no half-written rows. Task A3.
3. **Who plays:** opted-out, blocked, inactive (no `last_active` within 14 days, null falling back to `created_at`) and deleted bots do not play; zero eligible bots plays zero matches and the script says so. Task A3.
4. **Model down:** all actions fall back, so the match is discarded, nothing is stored, the script exits 0 with counts; a bot whose own actions half-fell back gets no entry, recap or record update. Tasks A2 and A3.
5. **Recap ownership and privacy:** another guest cannot see or mark my recaps; the match page for a pruned or unknown id is 404; no owner fields anywhere. Task A4.

---

## Task A1: Schema, arena fields on the card, opt-out and activity

**Files:**
- Modify: `db.py` (SCHEMA and the `custom_bots` column loop in `init_db`), `custombots.py`, `routes.py` (`create_bot` only)
- Test: `tests/test_custom_bots.py`, `tests/test_custom_bots_room.py` (migration test)

**Interfaces:**
- Produces (columns on `custom_bots`, in `SCHEMA` and the idempotent `init_db` loop): `arena INTEGER DEFAULT 1`, `last_active INTEGER`, `arena_games INTEGER DEFAULT 0`, `arena_wins INTEGER DEFAULT 0`, `arena_spy_games INTEGER DEFAULT 0`, `arena_spy_wins INTEGER DEFAULT 0`.
- Produces (new tables in `SCHEMA`, spec §4.2): `arena_matches(id TEXT PRIMARY KEY, day TEXT, lang TEXT, pair_id TEXT, log_json TEXT, created_at INTEGER)` and `arena_entries(match_id TEXT, bot_id TEXT, day TEXT, role TEXT, won INTEGER, accused INTEGER, out_round INTEGER, seen INTEGER DEFAULT 0, PRIMARY KEY(match_id, bot_id), UNIQUE(day, bot_id))`.
- Produces: `custombots.create(owner, name, avatar, outfit, remix_of=None, listed=True, arena=True) -> dict`; `custombots.update(owner, bot_id, body)` accepts `arena` (bool) as a valid key; `custombots.delete` also deletes the bot's `arena_entries`; `custombots.list_for(owner)` sets `last_active` to now for all the owner's bots; create and update set it for the bot touched.
- Produces (card, every response that returns one): `arena: bool` and `arena_record: {"games","wins","spy_games","spy_wins"}`.

- [ ] **Step 1: Write failing tests:**
  - `test_custom_bots_room.py`, next to the other migration tests: an old `custom_bots` table without the new columns gains them on `init_db()`, keeps its rows, and a second `init_db()` is harmless; the two new tables exist.
  - `test_custom_bots.py`:
    - `test_card_has_arena_fields_with_defaults`: `arena is True`, `arena_record == {"games": 0, "wins": 0, "spy_games": 0, "spy_wins": 0}`; the public card equals the owner's list entry.
    - `test_arena_roundtrip`: `POST` with `arena: False` gives `arena False`; `PATCH {"arena": True}` flips it and is not "Nothing to update"; `arena: "yes"` gives `400 bad_request`.
    - `test_last_active_is_set_by_owner_actions`: after create, `last_active` is not null; set it to 0 through `conn.execute`, then `GET /bots` as the owner brings it to now; a public `GET /bots/<id>` does not change it.
    - `test_delete_removes_arena_entries`: insert an `arena_matches` and an `arena_entries` row for a bot through `conn.execute`; deleting the bot removes the entry and keeps the match row.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_custom_bots.py ai_svc/spy_hunt/tests/test_custom_bots_room.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified. Reuse the `_check_listed` style for `arena` (strict `bool`, else `400 bad_request`). `routes.create_bot` passes `body.get("arena", True)`.
- [ ] **Step 4: Run** the two files, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): arena fields, opt-out and activity on bots` (backend repo, branch `living-bot`).

## Task A2: The paper game

**Files:**
- Create: `arena.py`
- Test: `tests/test_arena_play.py`

**Interfaces:**
- Consumes: `engine.assign_roles`, `engine.eligible_voters`, `engine.eligible_targets`, `engine.resolve_vote`, `engine.check_win`, `engine.next_speaker`, `engine.contains_own_word`; `bots.compile_outfit`, `bots.PERSONAS`, `bots._prompt_describe`, `bots._prompt_vote`, `bots._StatementOut`, `bots._VoteOut`, `bots._canned_statement`, `bots.STATEMENT_MAX_TOKENS`, `bots.VOTE_MAX_TOKENS`; `rules.context`, `rules.statement_lines`, `rules.vote_pick`; `outfits.clean_rules`; `llm.call_json`, `llm.TASK_TIMEOUTS["bot"]`; `game.Pair`; `GameConfig().max_rounds(5, 1)` and `statement_max_chars`.
- Produces: `@dataclass ArenaSeat: name: str; bot_id: Optional[str]; avatar: Optional[dict]; outfit: Optional[dict]; persona_key: Optional[str]` (a custom bot has `outfit` with `rules`, a built-in one has `persona_key` from `config.BOT_PERSONA_KEYS`).
- Produces: `play_match(room_id: str, pair: game.Pair, lang: str, seats: List[ArenaSeat], rng: random.Random) -> Optional[dict]`. Plays 1 spy, roles by `assign_roles`, civilians share `pair.words[lang]` one key, the spy the other. Flow per round, mirroring `game._resolve_vote`: everyone alive describes in seat order; vote stage 0; `resolve_vote`; on `tiebreak` the tied seats describe again (stage 1, phase `tiebreak_describe`) and a stage-1 re-vote (phase `revote`) follows; a second tie means nobody is out; then `check_win(seats, round, max_rounds)`. Each bot's view is a dict with the same keys as `bots._public_view` returns (`my_seat, max_rounds, my_word, persona, alive_seats, players, statements, reveal_history, round, phase, status`), `reveal_history` entries without `role`; `phase` uses the exact strings `describe`, `tiebreak_describe`, `vote`, `revote` that `rules.context` reads. Custom bots add `rules.statement_lines(...)` to their persona and try `rules.vote_pick` before the model, exactly as `bots._run_describe` and `bots._run_vote` do. Statement checks: non-empty, at most `statement_max_chars` characters, not containing the seat's own word (`contains_own_word` with `{lang: own_word}`); otherwise the canned statement and a counted fallback. A vote that is a model failure or an invalid target becomes a random legal target and a counted fallback; a rule vote is not a fallback. Returns `None` when more than a third of all actions were fallbacks, else:
  `{"log": {"players": [{"seat","name","avatar","bot_id","role"}], "rounds": [{"round": int, "statements": [{"seat","stage","text"}], "votes": [{"voter","target","stage"}], "eliminated": Optional[int]}], "words": {"civilian": str, "spy": str}, "winner": "spies"|"civilians"}, "entries": [{"seat","bot_id","role","won": bool,"accused": int,"out_round": Optional[int],"quote": Optional[str],"fallback_share": float}]}` with one entry per seat that has a `bot_id`; `accused` counts all votes against that seat; `out_round` is the round it was eliminated or `None`; `quote` is that seat's first statement; `fallback_share` is the fraction of that seat's own actions that were fallbacks.

- [ ] **Step 1: Write failing tests** (register a fake `bot` task with `fake_llm.register`; set `SPY_HUNT_FAKE_LLM=1` as `test_puzzle_gen.py` does; make a throwaway room with `store.create_room("arena", "builder", "en")["id"]`; seed `rng = random.Random(3)`; the fake returns a statement for describe prompts and `{"vote_for": <first listed seat>}` for vote prompts, telling them apart by whether the prompt contains `"vote_for"`):
  - `test_match_plays_to_a_winner`: the result has a `winner`, every alive seat spoke each round, `rounds` are consecutive from 1, `eliminated` seats never speak again, and entries exist only for seats with a `bot_id`.
  - `test_civilian_prompt_never_contains_the_spy_word`: capture every prompt in the fake; for each prompt sent to a civilian seat the spy's word is absent, and no prompt contains `"role"` as a JSON key.
  - `test_reveal_history_has_no_role`: capture the view JSON inside vote prompts of round 2 and assert no `role` key.
  - `test_rule_vote_skips_the_model`: script the fake's votes so that in round 1 the rule bot (a custom seat with `{"when": "accused", "do": "vote_accuser"}`) receives exactly one vote and a different seat is eliminated; in round 2 the rule bot votes for that accuser without a model call (count vote prompts per seat: none for the rule bot in round 2).
  - `test_own_word_statement_falls_back_to_canned`: a fake that returns a statement containing the seat's own word makes that action a canned fallback and `fallback_share > 0` for that seat.
  - `test_tie_triggers_tiebreak_then_nobody`: a fake where every seat votes for the next seat (a full cycle) yields a stage-0 tie of everyone: nobody is out and the next round starts; a fake that creates a partial tie yields a stage-1 re-vote restricted to the tied seats.
  - `test_model_down_discards_the_match`: a fake that raises `LlmError` for everything makes `play_match` return `None`.
  - `test_half_fallbacks_for_one_bot_is_reported`: one seat's statements always contain its own word while the rest are fine: the match is returned and that seat's `fallback_share >= 0.5`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_arena_play.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `arena.py` with the signature above. Keep storage out of this task: no database writes except the model-call budget counter that `llm.call_json` itself updates on the room you pass.
- [ ] **Step 4: Run** the file, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): arena paper game`.

## Task A3: Selection, storage, the night run and the script

**Files:**
- Modify: `arena.py`
- Create: `scripts/arena_night.py`
- Test: `tests/test_arena_night.py`

**Interfaces:**
- Consumes: `ArenaSeat`, `play_match` (Task A2); Task A1 columns and tables.
- Produces (in `arena.py`):
  - `eligible_bots(conn, day: str, now_ms: int) -> List[sqlite3.Row]`: custom bots with `COALESCE(arena, 1) != 0`, `COALESCE(blocked, 0) = 0`, `COALESCE(last_active, created_at) >= now_ms - ARENA_ACTIVE_DAYS * 86_400_000`, and no `arena_entries` row for `day`.
  - `make_groups(bots: list, matches: int, rng) -> List[list]`: shuffle, chunk into groups of at most `ARENA_SEATS`, keep at most `matches` groups.
  - `build_seats(group: list, rng) -> List[ArenaSeat]`: custom seats from the rows (`outfit` from the stored slots and `stored_rules`), topped up to `ARENA_SEATS` with built-in bots (names from `config.BOT_NAMES`, persona from `config.BOT_PERSONA_KEYS`), names unique within the match, seat order shuffled.
  - `store_match(conn, day: str, lang: str, pair_id: str, result: dict) -> str`: in one transaction writes the `arena_matches` row (`log_json` = `result["log"]`, id `secrets.token_urlsafe(6)`), one `arena_entries` row for every entry with `fallback_share < 0.5` whose bot still exists, and the `arena_*` record updates (`arena_games +1`, `arena_wins +won`, `arena_spy_games +spy`, `arena_spy_wins +spy and won`); returns the match id. A bot that no longer exists is skipped without error.
  - `prune(conn, today: str) -> int`: deletes matches with `day` older than `ARENA_KEEP_DAYS` days before `today` and their entries; returns the match count.
  - `run_night(matches: int = ARENA_MATCHES_PER_DAY, rng=None, log=print, today: Optional[str] = None, dry_run: bool = False) -> Dict[str, int]` returning `{"played","discarded","skipped"}` (`skipped` = eligible bots left without a match). Language alternates `LANGS[i % 2]` by match index; the pair is a random row of `pairs WHERE active=1` (as `puzzle_gen._next_pair` picks, without the puzzle exclusion); each match uses the throwaway room `store.create_room("arena", "builder", "en")["id"]` with `UPDATE rooms SET ai_calls=0` before it; `dry_run` prints the planned groups and makes no model call or write. The function logs one line per match and a summary; with zero eligible bots it logs "no eligible bots" and returns zeros. Calls `prune` at the end of a real run.
- Produces: `scripts/arena_night.py` with `main(argv=None) -> int` taking `--matches N` and `--dry-run`, structured like `scripts/build_puzzles.py` (`db.init_db()` first), printing the summary, returning 0.

- [ ] **Step 1: Write failing tests** (reuse the fake `bot` task; seed the pair pool as `test_puzzle_gen.register_world` does; create bots through the API or `custombots.create` and set `last_active` through `conn.execute`):
  - `test_eligibility`: opted-out, blocked, `last_active` 15 days ago, and a bot with null `last_active` but `created_at` 15 days ago are excluded; a bot with null `last_active` and recent `created_at`, and one active 13 days ago, are included; a bot with today's entry is excluded.
  - `test_groups_and_seats`: 7 bots give groups of 5 and 2 with `matches=2`, one group with `matches=1`; `build_seats` returns exactly 5 seats, custom seats keep their `bot_id`, built-in names are unique and differ from custom names.
  - `test_store_match_is_atomic_and_updates_the_record`: a result with a spy bot that won stores one match and one entry and sets `arena_games=1, arena_wins=1, arena_spy_games=1, arena_spy_wins=1`; an entry with `fallback_share=0.5` gets no entry and no record update; a deleted bot id is skipped; forcing an error part-way (for example a duplicate `(day, bot_id)`) leaves no `arena_matches` row.
  - `test_run_night_twice_does_not_double_play`: after one run, a second run on the same `today` plays zero matches and the record is unchanged.
  - `test_run_night_with_no_bots_and_with_model_down`: no eligible bots returns zeros; with every model call failing the result has `played == 0` and `discarded >= 1` and nothing is stored.
  - `test_prune_keeps_totals`: a match 15 days old is deleted with its entries, a 13-day-old one stays, and the bot's `arena_games` is unchanged.
  - `test_dry_run_makes_no_model_call`: a fake that records calls sees none, and no rows are written.
  - `test_arena_night_script_main`: `arena_night.main(["--matches", "1"])` returns 0 and prints a summary line containing `played`.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_arena_night.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the script. Use `custombots._tx` style `BEGIN IMMEDIATE` for `store_match` so the three writes commit together.
- [ ] **Step 4: Run** the file, then the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): arena night run, storage and script`.

## Task A4: Recap and match routes, backend docs

**Files:**
- Modify: `arena.py`, `routes.py`, `README.md` (backend `ai_svc/spy_hunt/README.md`)
- Test: `tests/test_arena_api.py`

**Interfaces:**
- Consumes: Task A1 and A3 tables and `store_match`.
- Produces (in `arena.py`): `recaps_for(owner: str, limit: int = 10) -> Dict[str, Any]` returning `{"recaps": [...], "unseen": int}`, newest first by match `created_at`, only entries of bots whose `owner_player_id == owner`; a recap is `{match_id, bot_id, bot_name, avatar: {emoji, color}, day, lang, role, won: bool, accused, out_round, quote, seen: bool}` (`quote` is that bot's first statement, read from the match `log_json` by `bot_id`; `None` if absent); `unseen` counts all unseen entries of the owner's bots, not just the page. `mark_seen(owner: str) -> None`. `match_view(match_id: str) -> Optional[Dict[str, Any]]` returning `{"id", "day", "lang", "players": [{"seat","name","avatar","bot_id","role","is_custom"}], "rounds": [...as stored...], "words", "winner"}` or `None`.
- Produces (routes, under `/api/spy-hunt`, declared before `GET /bots/<bot_id>` where needed): `GET /bots/recaps` (`@ratelimits.limit("flood")`, `@auth.require_guest`, `@ratelimits.limit("read")`); `POST /bots/recaps/seen` (`flood`, `require_guest`, `action`) returns `{"ok": true}`; `GET /arena/matches/<match_id>` (`flood` only, no token; unknown id `404 not_found`).

- [ ] **Step 1: Write failing tests** (insert a finished match and entries with `arena.store_match`, using a hand-built `result` dict):
  - `test_recaps_for_the_owner_only`: guest A's bot is in the match; A sees one recap with the exact fields and `unseen == 1`; guest B sees `{"recaps": [], "unseen": 0}`; no token gives `401`.
  - `test_recap_fields_come_from_the_log`: `role`, `won`, `accused`, `out_round` and `quote` equal the stored values.
  - `test_mark_seen_is_per_owner`: A marking seen makes `unseen == 0` for A and does not change B's entries; the recap's `seen` is `True`.
  - `test_recaps_limit_and_order`: 12 entries on different days give 10 recaps, newest first, `unseen == 12`.
  - `test_match_page_is_public_and_has_no_owner`: `GET /arena/matches/<id>` with no token returns the players with roles, rounds, words and winner; the body text contains none of `owner`, `owner_player_id`, `player_id`; a custom player has `is_custom: true` and its `bot_id`, a built-in one `bot_id: null`.
  - `test_unknown_or_pruned_match_is_404`.
  - `test_recaps_route_is_not_shadowed_by_bot_id`: `GET /bots/recaps` returns the recap shape, not a 404 card.
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_arena_api.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and routes (`StoreError(404, "not_found", ...)` for an unknown match).
- [ ] **Step 4: Docs.** Backend `README.md`: a "Living bot (arena)" section with the three routes, the new card fields, `arena` on `POST`/`PATCH /bots`, the cron line (`python -m ai_svc.spy_hunt.scripts.arena_night`, once a day, about 24 model calls per match and about 480 a day at the defaults), `--matches` and `--dry-run`, and the rules in spec §4.1 (who plays, once a day, discard rule, 14-day prune).
- [ ] **Step 5: Run** the whole suite. Expected: all pass.
- [ ] **Step 6: Commit** `feat(spy-hunt): arena recaps and match page routes; docs`.

## Task F1: Types, API client, arena line and the opt-out checkbox

**Files:**
- Modify: `src/api/types.ts`, `src/bots/api.ts`, `src/bots/BotCardView.tsx`, `src/bots/BotForm.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, and every fixture that builds a `BotCard` (`grep -rn "spy_wins" src`)
- Test: `src/bots/api.test.ts`, `src/bots/BotCardView.test.tsx`, `src/bots/BotForm.test.tsx`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Produces (types): `BotCard` gains `arena: boolean` and `arena_record: BotRanked`; `BotDraft` gains `arena?: boolean`; `Recap = { match_id: string; bot_id: string; bot_name: string; avatar: Avatar; day: string; lang: Lang; role: 'spy' | 'civilian'; won: boolean; accused: number; out_round: number | null; quote: string | null; seen: boolean }`; `MatchPlayer = { seat: number; name: string; avatar: Avatar | null; bot_id: string | null; role: 'spy' | 'civilian'; is_custom: boolean }`; `MatchRound = { round: number; statements: { seat: number; stage: number; text: string }[]; votes: { voter: number; target: number | null; stage: number }[]; eliminated: number | null }`; `MatchView = { id: string; day: string; lang: Lang; players: MatchPlayer[]; rounds: MatchRound[]; words: { civilian: string; spy: string }; winner: 'spies' | 'civilians' }`.
- Produces (api): `getRecaps(): Promise<{ recaps: Recap[]; unseen: number }>` (guest required; returns `{recaps: [], unseen: 0}` for a body without them), `markRecapsSeen(): Promise<void>` (`POST /bots/recaps/seen`), `getMatch(id: string): Promise<MatchView>` (`GET /arena/matches/<id>`, no guest). `createBot`/`updateBot` already pass the draft through.
- Produces (view): `BotCardView` shows `Arena: {games} games · {wins} wins` when `arena_record.games > 0` (`BotDraftPreview` gains optional `arena_record?: BotRanked`). `BotForm` shows a checkbox `arena.opt` bound to `draft.arena` (default true; an edited bot starts from `initial.arena`; `arena` is sent on every save, like `listed`).
- Copy keys (en / zh-Hans): `arena.opt` "Let my bot play in the daily arena" / "让我的机器人参加每日竞技场"; `arena.record` "Arena: {games} games · {wins} wins" / "竞技场：{games} 局 · {wins} 胜"; `arena.title` "While you were away" / "你不在的时候"; `arena.new` "{n} new" / "{n} 条新战报"; `arena.see` "See the match" / "查看对局"; `arena.role.spy` "Spy" / "卧底"; `arena.role.civilian` "Civilian" / "平民"; `arena.recap.spy` "{name} was the spy in a 5-bot match" / "{name} 在一场 5 机器人对局中是卧底"; `arena.recap.civilian` "{name} was a civilian in a 5-bot match" / "{name} 在一场 5 机器人对局中是平民"; `arena.recap.accused` "accused {n} times" / "被投票指认 {n} 次"; `arena.recap.survived` "survived" / "活到了最后"; `arena.recap.out` "voted out in round {n}" / "第 {n} 轮被投出"; `arena.recap.fooled` "fooled the table" / "骗过了全桌"; `arena.recap.won` "won" / "获胜"; `arena.recap.lost` "lost" / "失败"; `arena.sep` ", " / "，"; `arena.end` "." / "。"; `arena.match.title` "Arena match" / "竞技场对局"; `arena.match.round` "Round {n}" / "第 {n} 轮"; `arena.match.tiebreak` "Tiebreak" / "加赛"; `arena.match.vote` "{voter} voted for {target}" / "{voter} 投给了 {target}"; `arena.match.abstain` "{voter} did not vote" / "{voter} 弃票"; `arena.match.out` "{name} was voted out." / "{name} 被投出。"; `arena.match.nobody` "Nobody was voted out." / "没有人被投出。"; `arena.match.reveal` "Reveal" / "揭晓"; `arena.match.words` "Civilians: {civilian} · Spy: {spy}" / "平民词：{civilian} · 卧底词：{spy}"; `arena.match.winner.spies` "The spies won." / "卧底获胜。"; `arena.match.winner.civilians` "The civilians won." / "平民获胜。"; `arena.match.notFound` "Match not found" / "找不到这场对局"; `arena.match.notFoundBody` "It may have been cleared after 14 days." / "它可能在 14 天后已被清理。"; `arena.match.error` "Could not load this match." / "无法加载这场对局。"; `arena.recapsError` "Could not load your recaps." / "无法加载你的战报。".

- [ ] **Step 1: Write failing tests:** `getRecaps` and `getMatch` call the right paths (`/bots/recaps`, `/arena/matches/<id>`), `getRecaps` tolerates a body missing `recaps`, `markRecapsSeen` posts to `/bots/recaps/seen`; `BotCardView` shows the arena line for `games: 3, wins: 2` and not for `games: 0`; `BotForm` checkbox defaults checked, unchecking sends `arena: false`, editing a bot with `arena: false` shows it unchecked; the i18n test finds every new key in both languages.
- [ ] **Step 2: Run** `yarn test src/bots src/i18n`. Expected: new tests FAIL (old fixtures fail type-check until updated).
- [ ] **Step 3: Implement** types, api functions, view and form changes, copy; add the two new fields to every fixture.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: arena types, api and opt-out checkbox` (frontend repo, branch `living-bot`).

## Task F2: The match page

**Files:**
- Create: `src/screens/MatchPage.tsx`, `src/screens/MatchPage.test.tsx`
- Modify: `src/routes.tsx`

**Interfaces:**
- Consumes: `getMatch`, `MatchView` (Task F1).
- Produces: route `/match/:id`, component `MatchPage`. Loading text `bots.loading`; a 404 shows `arena.match.notFound` and `arena.match.notFoundBody`; any other failure shows `arena.match.error` with a Retry button (`room.retry`); both end with a Home link (`bots.home`). On success: the heading `arena.match.title`; the players as a row of `Avatar` (reuse `components/Avatar`; a player with no avatar shows only the name) where a custom bot's name links to `/bot/:bot_id`; then for each round `arena.match.round`, its statements as `name: text` in seat order (a stage-1 statement is preceded by the `arena.match.tiebreak` label once per round), each vote as `arena.match.vote` (a `null` target uses `arena.match.abstain`), and the outcome `arena.match.out` or `arena.match.nobody`; at the end a `arena.match.reveal` section with each player's role (`arena.role.*`), `arena.match.words` and `arena.match.winner.*`. Roles appear only in the reveal section. Seat numbers resolve to names through `players`.

- [ ] **Step 1: Write failing tests** (mock `../bots/api`): a two-round match renders players, statements, votes and outcomes in order and the reveal last (assert roles are absent before the reveal heading in document order); a custom bot's name links to `/bot/<id>`; a tiebreak round shows the tiebreak label once; an abstain vote shows the abstain text; a 404 shows the not-found text; a network failure shows the error with Retry and Retry reloads; zh-Hans renders the Chinese labels.
- [ ] **Step 2: Run** `yarn test src/screens`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the page and the route.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: arena match page`.

## Task F3: Recaps on My bots and the Landing badge

**Files:**
- Create: `src/bots/RecapList.tsx`, `src/bots/RecapList.test.tsx`
- Modify: `src/screens/Bots.tsx`, `src/screens/Landing.tsx`
- Test: `src/screens/Bots.test.tsx`, `src/screens/Landing.test.tsx`

**Interfaces:**
- Consumes: `getRecaps`, `markRecapsSeen`, `Recap` (Task F1).
- Produces: `RecapList({ recaps }: { recaps: Recap[] })` renders the section titled `arena.title` (nothing at all when the list is empty): each recap as `Avatar`, the sentence, an optional quote line, and a link `arena.see` to `/match/:match_id`. The sentence is: the role sentence (`arena.recap.spy` or `arena.recap.civilian` with `{name}`), then `arena.sep`, then these parts in order, skipping the ones marked optional, joined by `arena.sep`, then `arena.end`: `arena.recap.accused` (only when `accused > 0`); `arena.recap.out` with `{n: out_round}` when `out_round` is set, else `arena.recap.survived`; and the result, which is `arena.recap.fooled` for a spy that won, else `arena.recap.won` or `arena.recap.lost`. Unseen recaps are visually marked (a `New` marker is not required; use a CSS class `recap-new`).
- Produces: `Bots` fetches `getRecaps()` alongside the list (a failure shows `arena.recapsError` as a quiet message and does not block the bot list), shows `RecapList` above the bots, and calls `markRecapsSeen()` once after the recaps render when `unseen > 0` (errors ignored). `Landing` shows `arena.new` ({n} new) inside the "My bots" card when `getRecaps().unseen > 0`; the lookup runs only when `getSession().playerId` exists and its failure is silent.

- [ ] **Step 1: Write failing tests:**
  - `RecapList`: renders nothing for `[]`; a spy that won, accused 2, survived reads `Mochi was the spy in a 5-bot match, accused 2 times, survived, fooled the table.`; a civilian voted out in round 2 who lost reads `Mochi was a civilian in a 5-bot match, voted out in round 2, lost.` (accused 0 omits the accused part); each links to `/match/<id>`; the quote is shown when present; the zh-Hans sentence uses `，` and `。`.
  - `Bots`: recaps appear above the list; `markRecapsSeen` is called once when `unseen > 0` and not called when `unseen === 0`; `getRecaps` rejecting still shows the bots and the quiet error.
  - `Landing`: with a session and `unseen: 2` the My bots card shows `2 new`; with `unseen: 0` or no session it does not call `getRecaps` (no session) or shows nothing; a rejection shows nothing and no error.
- [ ] **Step 2: Run** `yarn test src/bots src/screens`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the component and the two screen changes.
- [ ] **Step 4: Run** `yarn test && yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: arena recaps on My bots and a badge on the landing card`.

## Task F4: End-to-end test and docs

**Files:**
- Modify: `e2e/backend.py`, `e2e/bots.spec.ts`, `README.md` (frontend)

- [ ] **Step 1: Add a test-only route** to `e2e/backend.py` (the harness that already serves the app with the fake model): `POST /e2e/arena-night` that seeds the word pool if needed, registers a fake `bot` task (statements, and votes for the first listed seat) and calls `arena.run_night(matches=1, today=<today>)`, returning its summary as JSON. Follow how the harness already registers fake tasks for the smoke test.
- [ ] **Step 2: Extend** `e2e/bots.spec.ts` with a test: the owner creates a bot "Mochi" (any outfit, arena checkbox left on), calls the test route (`request.post` to the backend through the app's origin or directly, as the harness allows), opens `/bots`, sees the section `While you were away` with a sentence starting `Mochi was` and a `See the match` link; clicks it, lands on `/match/<id>`, sees `Arena match`, a `Round 1` heading and, after it, `Civilians:` in the reveal; going back to Landing no longer shows the `new` badge (the recap was marked seen) and the bot card now shows `Arena: 1 games` text; a second owner context with an opted-out bot (checkbox unchecked) gets no recap after another call.
- [ ] **Step 3: Run** the e2e suite (command above). Expected: 5 pass.
- [ ] **Step 4: Docs.** Frontend `README.md` "Bots": two sentences on the daily arena (opt-out checkbox, recaps wait on your next visit, match pages are public and show no owner, arena games never count for the top bots board).
- [ ] **Step 5: Run** `yarn test && yarn build` and the backend suite. Expected: all pass.
- [ ] **Step 6: Commit** `test: e2e for the daily arena; docs` (frontend; the harness change belongs to this commit).
