# Daily Spy Hunter puzzle: design

Status: draft for owner approval. Phase 3. Tags: **(owner)** decided by the owner, **(call)** my decision, change it if you disagree.

## 1. Goal

A Wordle-style daily puzzle that needs no room, no friends and no account. It is a reason to open the app every day, and the share card is a way for new people to arrive. After it, the game suggests a real round.

Source: brainstorm record §5.2 **(owner)**. Transcript source is **bot-vs-bot, pre-generated queue (owner, 2026-11-09)**.

## 2. What the player does (about 2 minutes)

1. Open "Daily Spy Hunter". Everyone gets the same puzzle that day (UTC day, shown as "Puzzle #N").
2. They see the **civilian word** (for example "piano") and a transcript of one finished game: 5 players, 2 rounds of statements, each statement in their language (original plus translation).
3. **Find the spy:** tap the player they think had a different word. Two tries **(call)**.
4. **Optional bonus: guess the spy's word** from 4 options. The wrong options come from the pool **(call)**. Multiple choice avoids matching "钢琴" against "piano" across languages, so no concept-ID work is needed.
5. Result screen: the answer, the spy's real word, score, streak, a share card, and two buttons: "Play a real round" and "Share".

Showing the civilian word makes the puzzle solvable by reading, as in the real game where you know your own word **(call)**.

## 3. Scoring and sharing

- Spy found on try 1: 100. Try 2: 60. Not found: 0.
- Time bonus: up to +20, linear, full under 60 s, zero after 180 s.
- Word guess right: +20. Wrong: no penalty. Skipped: 0.
- Share card is text with emoji squares and no spoilers, for example:

```
Spy Hunter #12  🕵️ 
🟥🟩  ⏱ 1:12  ✅ word
Streak 4 🔥  spyhunt.example/daily
```

  🟥 is a wrong tap, 🟩 is the spy found, ⬜ is not found. The copy button uses the Web Share API, falling back to the clipboard.

## 4. Streaks

Stored in the browser (`localStorage`): last played day, current streak, best streak, per-day history **(call)**. A streak continues when the player solves yesterday's puzzle and today's. Moving it to the server per guest, then to accounts in Phase 4, is a later step. The server already records results (see §6) so that move needs no migration of history.

## 5. Generating puzzles (backend)

Not played through the room engine. A separate generator in a new module `ai_svc/spy_hunt/puzzles.py` reuses bot personas and the translation helper but has no rooms, timers or votes, so it is simple to test and cheap to re-run.

Pipeline per puzzle:

1. Draw a word pair from the pool, using one that has not been a puzzle before.
2. Create 5 bot players (names and personas from the existing sets). One is the spy and has the other word. Fixed speaking order.
3. For 2 rounds, ask the model for each bot's statement in turn. The prompt is the existing describe prompt, with the visible statements so far.
4. **Quality gate.** Reject and retry (max 3 attempts, then try another pair) when any of these hold:
   - any statement is a canned fallback or fails to parse;
   - any statement contains either word (checked in both languages);
   - a **solver model**, shown the civilian word and transcript, picks a wrong player (unsolvable), or all 5 players are equally ranked;
   - the spy's clues are trivially unrelated, judged by the solver as confidence 100% on round 1 alone (too easy).
   The solver's confidence becomes a difficulty label shown in the app.
5. Translate every statement into the other language in one batch call and store both.
6. Store the puzzle as `ready`. The generator keeps a queue of 14 ready puzzles. A day is assigned at publish time (first request that day takes the next ready puzzle, atomically).

A CLI `python -m ai_svc.spy_hunt.scripts.build_puzzles --count 14` fills the queue. A cron or the existing worker runs it daily. The owner can list and veto queued puzzles with a `--review` option.

Budget: about 5 players × 2 rounds + solver + translation ≈ 13 model calls per puzzle, comfortably inside the existing budget limits.

## 6. Data and API

New tables:

- `puzzles(id, day TEXT UNIQUE NULL, status, pair_id, difficulty, transcript_json, answer_json, created_at)`. The transcript is public data. The answer (spy seat, spy word) is never sent before the puzzle is finished.
- `puzzle_results(day, player_id, tries, solved, word_correct, started_at, finished_at, score)` with unique `(day, player_id)`. Used for aggregate stats, such as "62% found the spy", and for later streak migration.

Endpoints under `/api/spy-hunt/daily`, guest token optional for read but required to record a result:

- `GET /daily`: today's puzzle: number, civilian word (both languages), transcript, word options, difficulty. Never the answer. Records `started_at` for the guest, which is the start of the speed timer.
- `POST /daily/guess {spy_seat}`: returns `{correct, tries_left}`. After a correct guess or the last try it returns the answer and the spy's word.
- `POST /daily/word {option}`: returns correctness, then finalizes the score.
- `GET /daily/result`: the guest's result and the aggregate stats for the day.

Time is measured by the server, from `started_at` to the last request, so the score cannot be faked from the client. A guest may only record one result per day.

## 7. Frontend

New routes: `/daily` and a Landing card "Daily Spy Hunter" with the streak and a "Done today ✅" state. Screens: `DailyPuzzle` (transcript plus tap-to-pick), `DailyWord` (4 options), `DailyResult` (score, share card, streak, next-step buttons). It reuses `StatementBubble` and the i18n setup. The transcript shows in the player's language with the original available, as in the room.

## 8. Non-goals

Accounts, server-side streaks, leaderboards, real human games as sources (hybrid is possible later: the `puzzles` table has no dependency on how a transcript was produced), puzzle archive browsing, living-bot recaps, dress-up.

## 9. Testing

- Backend, with the fake LLM: pipeline accepts a good transcript; each gate rejects (canned, word leak, unsolvable, too easy); a day is assigned once; the answer is never in `GET /daily`; scores, tries and elapsed time; one result per guest per day.
- Frontend: tap flow, try counts, scoring display, share text, streak rules including missed days.
- One live run with the real model to read a few real puzzles, as I did for the room game.

## 10. Open questions for the owner

1. UTC day boundary is simple but means a new puzzle arrives at 08:00 Beijing time. Acceptable, or use the Asia/Shanghai day?
2. Should the app block a second attempt on the same day (as designed), or allow replays without score?

## 11. Deferred to the deployment phase (owner decision, 2026-11-09)

Not built now, because the project is still in development and has no host yet.

- **Automatic queue top-up.** Today the queue is filled by hand with `build_puzzles --count 14`; with it empty, `/daily` answers `503 no_puzzle`. At deployment, add both:
  1. a daily cron job running `build_puzzles --count 14` (about 14 model calls per puzzle), and
  2. a built-in safety net: when ready puzzles drop below a threshold (about 5), a background thread refills the queue, guarded by a lock so two requests cannot start it twice.
- **Alerting** when the ready queue is short (for example fewer than 3).

Done (polish pass): a round-1 solver error now rejects the candidate, the "all five equally ranked" gate (minimum score gap of 10), and stricter mixed-language detection.

Still deferred from the final review (see the branch history): server-side streaks and anti-replay (needed before any leaderboard).
