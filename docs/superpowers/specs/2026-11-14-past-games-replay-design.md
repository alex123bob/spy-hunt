# Past games: round-by-round replay (full design)

Status: draft for owner approval. Date: 2026-11-14.

Builds on two existing docs and revisits a non-goal both of them stated:

- [[2026-11-13-lang-persistence-and-game-history-design]] added `room_results`/`room_result_players` and `GET /me/games`, `GET /me/games/<room_id>/<game_no>` — explicitly scoped out "a full chat/vote replay of a past game," calling it "a materially bigger retention change."
- [[2026-11-14-past-games-detail-design]] (expandable rows on Profile) restated the same non-goal, citing the same reason: "it needs stored data that doesn't exist."

Research for this doc found that reasoning is partly outdated: `messages` and `votes` are never swept today (only the unrelated `events`/SSE log is pruned, and only a room's `status` flips on idle timeout). The raw data to build a replay already survives past game-end. What's actually missing is a read path shaped like arena's `log_json`, and a bounded retention policy for it. This doc adds both.

## 1. Intent

Show a player, for their own past games, what was actually said and who voted for whom each round — the same depth bot arena matches already get via `MatchPage.tsx`, applied to ordinary human room games.

## 2. Goals, non-goals, anti-goals

**Goals**
- A finished human room game's statements and votes, round by round, are durably captured at game-end and viewable afterward by any player who was seated in that game.
- Where a statement had a translation for some player at the table, the replay carries the original text and all translations that existed for it at game-end — not just whichever language the live viewer happened to be using at the time.
- The replay is reachable from the existing full recap page (`GameDetail.tsx`), below the roles/words/credits snapshot it already shows.
- Replay data has a bounded, deliberate retention window, since it's chat text and may be more sensitive than the roles/words/credits snapshot.

**Non-goals (this slice)**
- Backfilling replay data for games that finished before this ships. Those games' raw `messages`/`votes` rows still exist, but reconstructing a `log_json`-shaped snapshot retroactively (recomputing `eliminated`, stage grouping, etc. from raw rows outside the `_finish()` code path) is extra work with no clear owner ask; they keep today's reveal-only view.
- Changing idle-timeout behavior. `_finish_idle()` still doesn't call `history.record_game()`, so a room that times out instead of finishing normally still gets no history row and, by extension, no replay — same as today.
- Any change to the live in-room chat/translation experience, `visibility.py`, or the `translations` table's existing write path.
- A UI for toggling or hiding translations in replay. The existing live-chat convention (show both, always, stacked) carries over as-is.

**Anti-goals**
- A replay depending on `messages`/`votes` rows still existing. Those tables aren't swept today, but nothing guarantees that forever (see Approaches) — same self-contained-snapshot principle the roles/words history already follows.
- Replay data outliving a deliberately chosen retention window. Unlike `room_results` (kept indefinitely, by design — a worthwhile permanent record of "I played and won/lost"), raw chat text sitting around forever is a bigger liability with less ongoing value.
- Exposing a human player's raw `player_id`, or any other player's seat content, to a non-participant. Same rule `history.game_detail()` already follows.

## 3. Constraints

- No change to `_finish()`'s existing `game_over` event payload or to the three side effects it already triggers (bots, clans, credits) — this is a fourth, independent addition, same pattern `history.record_game()` already used.
- No new backend dependency; SQLite, same DB.
- zh-Hans and en copy for any new strings.
- Reuse existing rendering: `MatchPage.tsx`'s round-grouping/stage logic for structure, `StatementBubble.tsx` for individual statement+translation display (it already renders original text and a stacked, dashed-divider, muted, globe-emoji translation line — the only such pattern in the codebase).

## 4. Approaches considered

**Storage: how the replay gets persisted**
- **A. Read-only, join on demand.** A new endpoint queries `messages`+`votes` live at request time, shaped into rounds. No new write path, but replay correctness is implicitly hostage to whether some future, unrelated change starts pruning those tables — the anti-goal above rules this out as the sole mechanism.
- **B. Snapshot at `_finish()` time, mirroring arena's `log_json` (chosen).** At the same hook that already writes `room_results`, also build a `log_json`-shaped structure from the current `messages`/`votes` rows for that `(room_id, game_no)` and store it once, durably. Matches the precedent arena already set and the "self-contained snapshot" principle `room_results` already follows. Barely more work than A, since the data is sitting right there to copy at exactly the moment it's known to be complete.

**Where the snapshot lives**
- **A. A new column on `room_results`.** Simplest, but ties the heavy, more-sensitive chat data to the same row and retention as the light, permanent roles/words/credits snapshot — they'd have to share one lifetime.
- **B. A separate table, `room_replays` (chosen).** Mirrors arena's own split (`arena_matches` holds `log_json`; a separate concern from the per-bot `arena_entries` rows). Lets replay retention be pruned independently of `room_results`, which stays permanent exactly as already designed.

## 5. Design

### 5.1 New table: `room_replays`

```sql
CREATE TABLE IF NOT EXISTS room_replays(
  room_id TEXT, game_no INTEGER, log_json TEXT, created_at INTEGER,
  PRIMARY KEY(room_id, game_no));
```

Written in `history.record_game()` (or a sibling function in the same module), called from `_finish()` right alongside the existing `room_results`/`room_result_players` writes, in the same savepoint — a replay-write failure shouldn't block the room from finishing, same as history already doesn't.

`log_json` shape mirrors arena's `result["log"]`, with one addition — a `translations` map per statement:

```python
{
  "players": [{"seat": int, "name": str, "is_bot": bool, "role": "spy"|"civilian"}],
  "rounds": [
    {
      "round": int,
      "statements": [
        {"seat": int|None, "stage": 0|1, "kind": "statement"|"skipped"|"host",
         "text": str, "lang": str, "translations": {"<lang>": str, ...}}
      ],
      "votes": [{"voter": int, "target": int|None, "stage": 0|1}],
      "eliminated": int|None,
    },
    ...
  ],
  "words": {"civilian": {"<lang>": str, ...}, "spy": {"<lang>": str, ...}},
  "winner": "spies" | "civilians",
}
```

Built by querying `messages` and `votes` for that `(room_id, game_no)`, grouped by `round`/`stage` the same way `MatchPage.tsx` already groups arena rounds. All three `messages.kind` values (`statement`, `skipped`, `host`) are copied in, not just player statements — `seat` is `NULL` for host narration, matching live chat (`StatementBubble.tsx`'s existing host/skipped branches render this correctly once `GameDetail.tsx` builds the same `Message` shape for replay). `translations` for each statement is whatever rows already exist in the `translations` table for that `message_id` at the moment `_finish()` runs (background translation workers that haven't completed by then simply aren't captured — the same kind of point-in-time snapshot already accepted for roles/words). **(settled after builder check)**

One consequence of the snapshot-at-`_finish()` timing: the `game_over` host narration line that announces the final elimination is itself written *after* `_finish()` takes its snapshot (`host.py`'s async narration path), so it's never captured in replay — a round-start narration line can race the same way. This is the same point-in-time tradeoff already accepted for translations above, just worth naming explicitly: replay is a snapshot of what existed at the moment the game finished, not a complete transcript of every message the room ever produces.

`words` is stored as the same per-language dict `_finish()` already computes and `room_results.words_json` already stores (`visibility._pair_words()`), not a single-language pair — so a replay viewer reading in a different language than the room's `main_lang` still sees the word pair, via the same `wordFor()` fallback `GameDetail.tsx` already uses for the reveal section. The original draft of this doc had this as a flat `{civilian, spy}` pair mirroring arena's mono-lingual match; that was inconsistent with this doc's own intent that replay preserve what every language needed, not just one viewer's. **(settled after builder check)**

### 5.2 Translations: stored in full **(confirmed)**

Every translation that existed for a statement at game-end is captured, not just whichever language the room's viewers happened to be using live. This is what makes replay readable in a viewer's current language regardless of what it was during the game.

### 5.3 Retention: 30 days **(my call)**

`room_replays` rows are deleted 30 days after `created_at`, via a new `history.prune_replays(conn, keep_days=30)`. Called as a sibling call from `scripts/arena_night.py`'s `main()`, alongside its existing call to `arena.run_night()` — not from inside `arena.py` itself, since `arena.py` has no existing reason to import the `history` module and shouldn't gain one just for scheduling. This reuses the same externally-scheduled script as the scheduling mechanism (no new cron/scheduling infrastructure) without adding a cross-module dependency. **(settled after builder check)** Mirrors arena's own `ARENA_KEEP_DAYS` precedent, the closest existing policy in the codebase, with a longer window since human games are far less frequent per player than arena matches are per bot. `room_results`/`room_result_players` are untouched by this — they keep today's indefinite retention. After 30 days, `GameDetail.tsx` simply falls back to the reveal-only view it already has.

### 5.4 Idle-timeout games: unchanged **(my call)**

`_finish_idle()` still doesn't call `history.record_game()` or write a replay. An idle-abandoned game gets no history row today; extending that is a separate, larger decision (would need its own call on whether idle-abandoned games should count toward win/loss, credits, etc.) and isn't part of this slice.

### 5.5 New endpoint: `GET /me/games/<room_id>/<game_no>/replay`

`@auth.require_guest` → `@ratelimits.limit("read")`, same tier as the existing detail route. Requires the viewer to have been a participant (same check `game_detail()` already does) — a non-participant gets the same `404 not_found` an unknown id gets. Returns `log_json` deserialized, with `players` carrying `is_you` the same way `roles` does in the existing detail response, and never another human's raw `player_id`. Returns `404` if no `room_replays` row exists (pre-feature game, or pruned past 30 days) — the frontend's existing reveal-only view is simply what renders in that case.

### 5.6 Frontend

- New type `GameReplay` in `api/types.ts`, structurally close to `MatchView`/`MatchRound` but with `kind`/nullable `seat`/`translations` added per statement, and `words: WordsByRole` (the same per-language type `GameDetail` already uses) rather than a flat pair.
- `getMyGameReplay(roomId, gameNo)` in `src/games/api.ts`, hitting the new route.
- `GameDetail.tsx` fetches the replay alongside the existing detail call (or lazily, after the reveal renders) and, when present, renders a replay section below the existing `.match-reveal`-style block, reusing `MatchPage.tsx`'s round-grouping/stage/vote-chip structure. Each statement renders via the existing `StatementBubble` component (passing `{text, lang, translations}` in the shape it already expects) rather than a new bubble implementation, so replay automatically gets the same original-text/translation stacking, dashed divider, muted color, and globe-emoji convention live chat already uses. When absent (404), the page is unchanged from today.
- The expandable row (`GameRow.tsx`) keeps its single existing "Full recap" link — no separate "View replay" link. `GameDetail.tsx` is the one place replay shows up, conditionally, so there's nothing in `GameRow`/`GameRecap` that needs to know whether a replay exists.

## 6. Decisions that were the owner's

- Build this feature: new games going forward, no backfill of games finished before it ships.
- Translations are stored in full (original text plus all translations that existed at game-end), not original-only.
- Everything else in this doc — snapshot-at-finish vs. live-join, the separate `room_replays` table, the 30-day retention window, leaving idle-timeout games out of scope, reusing `StatementBubble` for replay rendering, including host/skipped messages alongside player statements, storing `words` per-language, and where `prune_replays` is called from — was left to this session's judgment (the last four settled after a builder check raised them as ambiguous).

## 7. Left to the builder

- Exact migration syntax/index needs for `room_replays` (follows the existing idempotent `PRAGMA table_info`/`CREATE TABLE IF NOT EXISTS` style already used elsewhere in `db.py`).
- Whether `MatchPage.tsx`'s round/stage-grouping logic gets extracted into a shared helper for reuse by `GameDetail.tsx`, or duplicated — the project already tolerates some duplication between these two screens (`GameDetail.tsx` doesn't reuse `GameRecap.tsx` either).
- Exact query shape for grouping `messages`/`votes` into rounds/stages when building `log_json` at `_finish()` time.
- zh-Hans/en copy, CSS for the new replay section's layout within `GameDetail.tsx`.
- Tests: `history.record_game` writing the expected `room_replays` row, the new route's auth/participant/404 behavior, `prune_replays` idempotency and cutoff correctness, frontend fetch/fallback-when-404 behavior, and reuse of `StatementBubble` rendering translations correctly in the replay context.
