# Phase 2, fourth slice: The living bot (daily arena and recaps): design

Status: draft for owner approval. Date: 2026-11-10. The owner delegated the design ("your call", "sure") and agreed to approach A in the conversation; every other choice is a **(call)**, so change any you disagree with. Builds on the bot card, rule cards and remix/top-bots slices (all merged to `main`). Product background: `docs/brainstorm/2026-11-06-brainstorm-record.md` section 5, loop 1: "Your bot plays async matches while you're away and sends a recap ('Mochi was accused twice, survived, fooled 3 humans')". The record calls loop 1 plus the daily puzzle the heartbeat of the game.

## 1. Intent

Today a bot only does something when its owner starts a room. This slice makes the bot **live**: once a day it plays a bot-only match in an "arena" while its owner is away, and the owner finds a recap waiting on their next visit ("Mochi was the spy, accused twice, survived, fooled the table"). The aim is a reason to come back tomorrow and a story to share, using the outfit and rule cards the player already built.

## 2. Goals, non-goals, anti-goals

Goals
- A script, run once a day by cron, plays a fixed number of bot-only matches on paper (no rooms or timers) with real model calls and stores each match.
- Custom bots whose owner has been active in the last 14 days, and who have not opted out, each play at most one match per day. Matches are topped up with built-in bots.
- Each bot's owner sees structured recaps on return: a "new" badge on the Landing "My bots" card, and a "While you were away" list on `/bots`, each linking to a read-only match page.
- A match page (`/match/:id`, public) shows the match with the roles revealed afterwards.
- An **arena record** per bot (games, wins, spy games, spy wins), shown on the bot card, kept separate from the ranked record.

Non-goals (this slice)
- Push, email or any message to someone who is not in the app. A recap waits for the next visit; accounts would change this.
- Bots playing in real rooms while the owner is away, bots that remember earlier matches (memory, grudges), a "send my bot to the arena now" button, clans, seasons, the scrollable highlight feed, arena standings or a board.
- Model-written recaps. Recaps are facts taken from the match log, not new text.
- Translating recap quotes. A quote is shown in the language the match was played in.

Anti-goals (a failure even if it technically works)
- Arena games touching the ranked record or the top-bots board in any way. The ranked rule needs 3 or more humans and arena games have none.
- Any owner information on the match page or in any public response.
- Abandoned bots using model calls every day.
- A recap that says something the match log does not support.
- A bot in the arena knowing more than a human at that seat would: the paper game builds each bot's view only from public data, with no roles and no other seat's word.

## 3. Approaches considered

- **A. Daily "bot night" with a recap waiting on return (chosen by the owner).** Fixed daily cost, no accounts needed, gives the "something happened while you were gone" feeling.
- B. A "send to arena" button that plays one match immediately. Instant payoff and a bounded cost through a rate limit, but nothing lives on its own and nothing brings the player back tomorrow; it can be added on top of A later.
- C. Bots playing in real rooms while their owners are away. Needs matchmaking and enough humans online; too heavy now.

## 4. Design

### 4.1 The arena script **(call)**

- `python -m ai_svc.spy_hunt.scripts.arena_night [--matches N] [--dry-run]`, run by cron once a day (like `build_puzzles`). Defaults come from named constants: `ARENA_MATCHES_PER_DAY = 20`, `ARENA_SEATS = 5`, `ARENA_ACTIVE_DAYS = 14`, `ARENA_KEEP_DAYS = 14`.
- **Who plays.** Eligible custom bots: `arena` flag on (default on), not blocked, `last_active` within 14 days. They are shuffled, grouped into matches of up to 5, and any seats short of 5 are filled with built-in bots (random names and the four built-in personalities). So with few players a match is one custom bot and four built-in ones. At most `--matches` matches run; bots left over wait for tomorrow. A bot plays at most once per UTC day (`UNIQUE(day, bot_id)` on its entry). Running the script twice in a day therefore does not double-play anyone.
- **Words and language.** Each match draws a word pair from the existing vetted pool and is played in one language, alternating `en` and `zh-Hans` by match number. Both players' words are in the pair as usual: 4 civilians share one word, 1 spy has the other.
- **The paper game** (new module `arena.py`, no database writes until a match is finished, no rooms, timers or transactions around model calls). It reuses the pure engine functions (`assign_roles`, `eligible_voters`, `eligible_targets`, `resolve_vote`, `check_win`, `next_speaker`) and the bot code (`compile_outfit`, `rules.context`, `rules.statement_lines`, `rules.vote_pick`, the describe and vote prompts, canned fallbacks). Each bot's view is built exactly as `bots.public_view` builds it: its own word only, statements, alive seats, reveal history without roles, round, phase, `max_rounds`. Rule cards therefore work in the arena as in a room. 1 spy, `max_rounds` from `GameConfig().max_rounds(5, 1)`, ties get a tiebreak description and a re-vote like a real room. The puzzle generator plays statements only (no votes or winner), so this module is new rather than a reuse.
- **Statement checks.** Same checks as live bots: non-empty, not its own word (`contains_own_word`), length cap; on failure the canned statement. Votes: a rule vote if one applies, else the model vote, else a random legal target.
- **Ties** follow the live rules (`resolve_vote` is pure): a tie gives the tied players a tiebreak description and a re-vote; if the re-vote is also tied, nobody is out that round and the next round starts.
- **Cost.** About 24 model calls per match (up to 12 statements and 12 votes, fewer when vote rules fire), so about 480 a day at the defaults. Each match runs against a throwaway builder room whose `ai_calls` budget is reset per match, as `fill_queue` does. A match where more than a third of the actions fell back to canned or random is discarded and not recorded (the model is probably down); the script prints how many were played, discarded and skipped. The same idea applies per bot: if **half or more of one custom bot's own actions** fell back to canned or random, that bot gets **no entry, recap or record update** for the match (the match is still stored if the others are fine), so a recap never tells a story the bot did not earn. The model is reached only through `llm.call_json` against a room id; the call budget is the `ai_calls` column of that room's row, with no global limit, so a throwaway room isolates the arena from real rooms.
- **Atomic writes.** Each finished match is written in one transaction: the `arena_matches` row, its `arena_entries`, and the `arena_*` record updates on `custom_bots`. A crash or rollback leaves nothing half-written, and re-running the script is safe because `UNIQUE(day, bot_id)` makes a bot that already has today's entry skip the day. Pruning never changes the totals on `custom_bots`.
- **Prune.** The script deletes matches older than `ARENA_KEEP_DAYS` days and their entries at the end of a run. The arena record on the bot keeps its totals.

### 4.2 Storage **(call)**

- `arena_matches(id TEXT PRIMARY KEY, day TEXT, lang TEXT, pair_id TEXT, log_json TEXT, created_at INTEGER)`: `id` is a short URL-safe random code; `log_json` holds the players (seat, name, avatar or null, `bot_id` or null), the statements with round and stage, the votes by round and stage, the eliminations, the words, the roles and the winner.
- `arena_entries(match_id TEXT, bot_id TEXT, day TEXT, role TEXT, won INTEGER, accused INTEGER, out_round INTEGER, seen INTEGER DEFAULT 0, PRIMARY KEY(match_id, bot_id), UNIQUE(day, bot_id))`: one row per custom bot in a match. `accused` is the total votes against the bot across the match; `out_round` is the round it was voted out, or null if it survived.
- `custom_bots` gains `arena INTEGER DEFAULT 1`, `last_active INTEGER`, `arena_games`, `arena_wins`, `arena_spy_games`, `arena_spy_wins` (integers, default 0). Idempotent migration like the earlier slices. Old rows read as `arena` on and `last_active` null; a null `last_active` counts as the bot's `created_at`.
- Deleting a bot deletes its `arena_entries`. A match that has no entries left stays until pruned (it may hold other bots' entries).

### 4.3 Owner activity and opt-out **(call)**

- `last_active` is set to now when the owner creates, edits or lists their bots (`POST /bots`, `PATCH /bots/<id>`, `GET /bots`). Opening My bots or adding a bot to a lobby (both call `GET /bots`) therefore counts. `GET /bots/recaps` (the Landing badge lookup) and the public bot or match pages do not.
- **Identity.** Bots, recaps and the `seen` flags belong to the same guest identity as the bots themselves (the guest token). A cleared browser loses them together, the same limit the bot card slice already accepted; accounts would lift it.
- `arena` is the owner's switch: `POST /bots` and `PATCH /bots/<id>` accept `arena: boolean` (default true), the form shows "Let my bot play in the daily arena" (checkbox, on by default). An opted-out bot never plays and its past recaps stay.

### 4.4 Recaps **(call)**

- `GET /bots/recaps` (guest token, `read` limiter) returns `{recaps: [...], unseen: n}` for the guest's bots, newest first, at most 10. A recap is a structured fact record, not text: `{match_id, bot_id, bot_name, avatar, day, lang, role, won, accused, out_round, quote, seen}`; `quote` is the bot's own first statement in that match. The frontend writes the sentence from i18n templates in the viewer's language.
- `POST /bots/recaps/seen` (guest token, `action` limiter) marks all of the guest's entries seen and returns `{ok: true}`.
- "Fooled the table" means the bot was a spy and the spies won, the same definition as the existing `spy_wins` record.
- The recap sentence has these parts (all from the log): role (spy or civilian), result (won or lost), accused N times (omitted at 0), "survived" or "voted out in round N", and for a winning spy "fooled the table".

```
 While you were away
 🦊 Mochi: spy in a 5-bot match. Accused 2 times, survived, fooled the table.
 "It's something you keep by the door…"          [See the match]
```

### 4.5 Match page **(call)**

- `GET /arena/matches/<id>` (public, no token, `flood` limiter): `{id, day, lang, players: [{seat, name, avatar|null, bot_id|null, role, is_custom}], rounds: [{round, statements: [{seat, text}], votes: [{voter, target}], eliminated|null}], words: {civilian, spy}, winner}`. No owner information. Unknown id gives `404 not_found`.
- Frontend route `/match/:id`: players with avatars (a custom bot links to `/bot/:id`), then rounds with statements and who voted for whom, then the reveal (roles, words, winner). Roles are shown only at the end of the page.

### 4.6 Where it shows **(call)**

- Landing "My bots" card shows "N new" when `unseen > 0`; the lookup is skipped without a guest session and its failure is silent.
- `/bots` shows a "While you were away" section above the bot list, then calls `POST /bots/recaps/seen` once the list has rendered. Each recap links to `/match/:id`.
- The bot card (list and public page) gains the arena line "Arena: {games} games · {wins} wins" when `arena_games > 0`.

### 4.7 API summary

All under `/api/spy-hunt`:
- `GET /bots/recaps`, `POST /bots/recaps/seen`, `GET /arena/matches/<id>`.
- `POST /bots` and `PATCH /bots/<id>` gain `arena`; `GET /bots` and `POST`, `PATCH` and `GET /bots/<id>` card responses gain `arena` and `arena_record: {games, wins, spy_games, spy_wins}`.
- No change to rooms or the ranked record.

## 5. Constraints

- Information firewall unchanged: every bot view in the arena is built from public data only.
- Model calls only from the script, never from a request. Arena calls never touch a real room's budget.
- Existing bots, rooms, the ranked record and the board and all existing tests keep working; old rows read as arena on, record 0.
- zh-Hans and en copy for every new label.
- Rate limits: recaps and the match page use `read` and `flood`; mark-seen and the existing create and patch use `action`.

## 6. Decisions that were the owner's

- Approach A: a daily bot night with a recap waiting on return.
- The rest was delegated and is marked **(call)** above.

## 7. Left to the builder

Exact recap and arena copy in both languages, page styling, the match-grouping details (as long as the rules in 4.1 hold), prompt wording if the paper game needs a small tweak, the thresholds' constant names, indexes, tests for each part, and a README section for the cron entry and its cost. The values (20 matches, 5 seats, 14 days) are starting values and live as named constants.
