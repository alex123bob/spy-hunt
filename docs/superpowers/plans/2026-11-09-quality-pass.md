# Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish what exists before Phase 2: a personal Result screen with a share card, grouped votes on the Reveal screen, the deferred frontend minors, and a word pool of 120 pairs.

**Architecture:** Frontend-only changes for the screens (pure helpers in `src/game/`, reusing `shareResult` from `src/daily/share.ts`) and the minors; a backend change to the pool generator (avoid-list prompt, duplicate rejection, `build_pool --extend`) followed by a real generation run and a reviewed merge into the seed.

**Tech Stack:** React 19 / TypeScript / vitest / Playwright; Python 3 / Flask / SQLite / pytest with `fake_llm`.

**Spec:** `docs/superpowers/specs/2026-11-09-result-screen-design.md` (in `spy-hunt`). Read it first.

**Repos and branches** (nothing is merged or pushed):
- Frontend: `/Users/jiali/personal_github_repos/spy-hunt`, new branch `quality-pass` from `daily-puzzle`. Tests: `yarn test` (89 pass today), `yarn build`, e2e with `export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/*.app)/Contents/MacOS/Google Chrome for Testing"; yarn playwright test` (2 pass today).
- Backend: `/Users/jiali/personal_github_repos/PP-AI-Service`, new branch `spy-hunt-pool-120` from `spy-hunt-daily-puzzle`. Paths are relative to `ai_svc/spy_hunt/`. Tests: `cd /Users/jiali/personal_github_repos/PP-AI-Service && venv/bin/pytest ai_svc/spy_hunt/tests -q` (492 pass today).

## Global Constraints

- Result and Reveal changes are **frontend only**: no backend change, no new server data.
- New UI copy exists in **en and zh-Hans** (`src/i18n/en.json`, `src/i18n/zh-Hans.json`); tests use the English strings below verbatim.
- The share card is **text only**, uses `shareResult` from `src/daily/share.ts` unchanged, and appears only when `winner` is not null.
- Share card format, exactly (`\n`-separated, three lines): `Spy Hunt 🕵️ Civilians won in round 2` / `Spy: Finn (conditioner) · You: civilian ✅` / `<origin>/` (✅ when the viewer won, ❌ when lost). Several spies are joined with `, `. The word in parentheses is the spy word in the viewer's language and is omitted (with its parentheses) when the snapshot has no words.
- A room with `winner === null` shows **"Game ended"**, no win/lose line and no share card.
- Word pool target: **at least 120 pairs** in `seed/pairs_seed.json` (83 today). New pairs are reviewed by the owner before the seed changes.
- Keep the existing suites green. The e2e smoke test only asserts no role text on Table and Vote screens.
- Code comments only where behavior is not obvious.

## Review Focus

1. **Won/lost mapping and odd snapshots:** spy winning, civilian winning, viewer is a spy or a civilian, `winner` null (closed room), the viewer's player missing from `players`. Task 1.
2. **Several spies and long names:** an 8+ player game has two spies; long names must wrap (no overflow) on the Result screen and in the card. Tasks 1 and 2.
3. **Vote grouping edge cases:** abstentions, a tie, zero votes, a voter or target that has left (name lookup falls back to `?`), counts above 6 (dots capped, number still shown). Task 3.
4. **Share failure:** clipboard blocked and no `navigator.share` shows the failure message instead of throwing. Task 2.
5. **Pool duplicates:** a reversed pair (tea/coffee vs coffee/tea), the same pair under another theme, and an avoid list that would make the prompt huge. Task 5.

---

## Task 1: Result helpers (outcome and share text)

**Files:**
- Create: `src/game/result.ts`, `src/game/result.test.ts`
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json`
- Branch: create `quality-pass` from `daily-puzzle` first.

**Interfaces:**
- Consumes: `Snapshot`, `Player`, `Role`, `Lang` from `src/api/types.ts`; `t(key, params)` from `src/i18n`.
- Produces:
  - `type Outcome = 'won' | 'lost' | 'ended'`
  - `interface ResultInfo { outcome: Outcome; myRole: Role | null; myWord: string | null; spies: { name: string; word: string | null }[]; rounds: number }`
  - `resultInfo(state: Snapshot, lang: Lang): ResultInfo`. `me` is the player with `seat === state.me.seat`. `outcome` is `'ended'` when `winner` is null or `me`/`me.role` is missing; otherwise `'won'` when (`me.role==='spy'` and `winner==='spies'`) or (`me.role==='civilian'` and `winner==='civilians'`), else `'lost'`. `spies` are the players with role spy (`word = state.words?.spy?.[lang] ?? null`). `myWord = state.words?.[me.role]?.[lang] ?? null`. `rounds = state.round`.
  - `resultShareText(state: Snapshot, info: ResultInfo, url: string): string` per the Global Constraints format, built with `t()` keys below. Only called when `outcome !== 'ended'`.
  - New keys (en): `result.won` "You won! 🎉", `result.lost` "You lost", `result.ended` "Game ended", `result.yourRole` "Your role: {role}", `result.yourWord` "Your word: {word}", `result.theSpy` "The spy", `result.theSpies` "The spies", `result.everyone` "Everyone", `result.rounds` "Rounds played: {n}", `result.share` "Share", `result.shared` "Shared", `result.copied` "Copied", `result.shareFailed` "Could not share.", `result.cardCivilians` "Spy Hunt 🕵️ Civilians won in round {n}", `result.cardSpies` "Spy Hunt 🕵️ Spies won in round {n}", `result.cardLine` "Spy: {spies} · You: {role} {mark}". The card's `{role}` is `t('role.<role>').toLowerCase()` (no effect in Chinese); `{mark}` is ✅ or ❌. zh-Hans copy is the builder's choice, plain and direct.

- [ ] **Step 1: Branch and failing tests** in `src/game/result.test.ts`, building snapshots with `snap`/`player` from `src/test/fixtures.ts` (players need a `role`; `words: { civilian: { en: 'piano', 'zh-Hans': '钢琴' }, spy: { en: 'organ', 'zh-Hans': '风琴' } }`):
  - `civilian viewer, civilians win -> won` and `spy viewer, spies win -> won`.
  - `civilian viewer, spies win -> lost` and `spy viewer, civilians win -> lost`.
  - `winner null -> ended` (Review Focus 1), and `viewer missing from players -> ended`.
  - `spies lists every spy with the word in the viewer language` (en and zh-Hans), and `two spies are both listed`.
  - `myWord follows the viewer role and language`; `words missing -> word null`.
  - `share text for a civilian win viewed by a civilian`: exactly `Spy Hunt 🕵️ Civilians won in round 2\nSpy: Finn (organ) · You: civilian ✅\nhttps://x/`.
  - `share text for a lost game uses the cross`, `two spies are joined with ", "`, `words missing drops the parentheses`, `Chinese share text uses Chinese copy` (with `setLang('zh-Hans')` the text contains 'Finn', '✅' and the Chinese spy word, and does not contain the English word "won").
- [ ] **Step 2: Run** `yarn test src/game/result.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `resultInfo`, `resultShareText` and the keys.
- [ ] **Step 4: Run** `yarn test` and `yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: result outcome and share text helpers`.

## Task 2: Result screen

**Files:**
- Modify: `src/screens/Result.tsx`, `src/styles/global.css`
- Test: `src/screens/Result.test.tsx`

**Interfaces:**
- Consumes: Task 1 `resultInfo`, `resultShareText`, keys; `shareResult(text): Promise<'shared'|'copied'|'failed'>` from `src/daily/share.ts`; `useLang()`; `Link`, `request` as today.
- Produces: `Result({ state })` laid out as the spec sketch: heading `result.title`; outcome line (`result.won` / `result.lost` / `result.ended`, large, centred); when role is known `result.yourRole` and (if present) `result.yourWord`; a highlighted panel `result.theSpy` / `result.theSpies` listing each spy with the word; a panel `result.everyone` with the existing role list; `result.rounds`; for `outcome !== 'ended'` a `<pre data-testid="share-preview">` with the card text and a Share button; then the existing rematch / waiting / Leave controls unchanged. The card URL is `` `${window.location.origin}/` ``. After pressing Share a status line shows `result.shared`, `result.copied` or `result.shareFailed`.

- [ ] **Step 1: Failing tests** in `Result.test.tsx` (mock `../daily/share` `shareResult`, wrap in `MemoryRouter`, `setLang('en')` in `beforeEach`):
  - `shows You won for the winning viewer and You lost for the losing one`.
  - `shows Game ended and no share button when winner is null` (Review Focus 1; also asserts no "Civilians win" text).
  - `shows the viewer role and word`.
  - `the spy panel names the spy and the spy word`; `two spies use the plural heading`.
  - `share preview matches resultShareText` (`getByTestId('share-preview')` text equals the Task 1 example).
  - `share button reports Copied` (mock resolves `'copied'`), `reports Could not share. on failure` (mock resolves `'failed'`) (Review Focus 4).
  - `a very long name wraps`: the name element has class `wrap` (Review Focus 2).
  - `host sees Play again, others see waiting` (existing behaviour kept).
- [ ] **Step 2: Run** `yarn test src/screens/Result.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen and a small `.spy-panel` highlight style (border in the existing `--danger` colour).
- [ ] **Step 4: Run** `yarn test`, `yarn build` and the e2e suite. Expected: pass (the smoke test still sees "Game over").
- [ ] **Step 5: Commit** `feat: personal result screen with share card`.

## Task 3: Reveal vote grouping

**Files:**
- Create: `src/game/votes.ts`, `src/game/votes.test.ts`
- Modify: `src/screens/Reveal.tsx`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`
- Test: `src/screens/Game.test.tsx` (append)

**Interfaces:**
- Consumes: `RevealInfo['votes']` (`{ voter: number; target: number | null }[]`).
- Produces:
  - `groupVotes(votes): { groups: { target: number; voters: number[] }[]; abstained: number[] }`. Groups sorted by voter count descending, then target seat ascending; voters sorted by seat ascending; `target === null` votes go to `abstained` (sorted).
  - Reveal renders each group as `<name> <dots> <count text>` and the voter names under it. Dots are `●` repeated `min(count, 6)`. Count text keys (en): `reveal.voteCount` "{n} votes", `reveal.voteCountOne` "1 vote", `reveal.abstainedList` "Abstained: {names}". The panel keeps the existing heading `reveal.votes`. A seat missing from `players` is named `?`.

- [ ] **Step 1: Failing tests:**
  - `votes.test.ts`: `groups by target, most votes first`, `ties on count sort by seat`, `abstentions are separated`, `no votes gives empty groups`, `voters are sorted`.
  - `Game.test.tsx`: `reveal shows grouped votes with counts and voter names` (3 votes for one player: text "3 votes", dots `●●●`, voter names listed); `one vote uses the singular`; `abstained names are listed`; `a departed voter shows ?`; `more than six votes cap the dots but show the number` (Review Focus 3); `tie and nobody-eliminated lines are unchanged` (existing `reveal.tie` text still appears).
- [ ] **Step 2: Run** `yarn test src/game/votes.test.ts src/screens/Game.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `groupVotes` and the Reveal panel.
- [ ] **Step 4: Run** `yarn test` and `yarn build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: group votes by target on the reveal screen`.

## Task 4: Deferred frontend minors

**Files:**
- Modify: `src/api/stream.ts`, `src/screens/Room.tsx`, `src/components/StatementBubble.tsx`, `src/state/session.ts`
- Create: `src/state/backoff.ts`, `src/state/backoff.test.ts`
- Test: `src/api/stream.test.ts`, `src/screens/Room.test.tsx`, `src/components/StatementBubble.test.tsx` (create if absent), `src/state/session.test.ts` (append)

**Interfaces:**
- Produces:
  - `reloadDelay(failures: number): number` in `src/state/backoff.ts`: `[1000, 2000, 4000, 8000, 15000][Math.min(Math.max(failures, 0), 4)]`.
  - `openRoomStream(...).reconnectNow()` now also ends a pending backoff wait so the next connect attempt starts at once (signature unchanged).
  - `Room` reloads after a `failed` stream status with a delay of `reloadDelay(n)`, where `n` counts consecutive `failed` statuses and resets to 0 when the status becomes `open`; the timer is cleared on unmount.
  - `StatementBubble`'s `.who` element has class `wrap`.
  - `session.ts` persists identity in `localStorage`, falls back to `sessionStorage` when `localStorage` throws, and stays in memory only when both throw.

- [ ] **Step 1: Failing tests:**
  - `backoff.test.ts`: `reloadDelay` for 0, 1, 4, 99 and a negative input.
  - `stream.test.ts`: `reconnectNow skips the backoff wait`: a `fetchImpl` that rejects once then succeeds with a stream that never ends, and an injected `sleep` that never resolves; after the first failure status is `reconnecting`; calling `reconnectNow()` triggers a second `fetchImpl` call without advancing time.
  - `Room.test.tsx`: `a failed stream reloads after a delay, not immediately` (fake timers; capture `onStatus` from the mocked `openRoomStream`; call it with `'failed'`; `request` GET count unchanged at once, +1 after 1000 ms; a second failure waits 2000 ms; `'open'` resets to 1000 ms; unmount clears the timer).
  - `StatementBubble.test.tsx`: `the name line wraps long names`.
  - `session.test.ts`: `identity survives a reload when only sessionStorage works` (stub `Storage.prototype` getItem/setItem for `localStorage` to throw, create a guest with `ensureGuest()`, call `resetSessionForTests()`, then `getSession().playerId` is the same); `with both storages blocked the session stays in memory and does not throw`.
- [ ] **Step 2: Run** `yarn test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** each change. The abortable wait in `stream.ts` races the existing `sleep` with a promise that `reconnectNow()` resolves.
- [ ] **Step 4: Run** `yarn test`, `yarn build` and the e2e suite. Expected: all pass.
- [ ] **Step 5: Commit** `fix: reconnect backoff, stream reload backoff, name wrap, storage fallback`.

## Task 5: Pool generator avoids duplicates (backend)

**Files:**
- Modify: `words.py`, `scripts/build_pool.py`, `README.md`
- Test: `tests/test_words.py` (append), `tests/test_build_pool.py` (create)
- Branch: create `spy-hunt-pool-120` from `spy-hunt-daily-puzzle` first.

**Interfaces:**
- Consumes: `llm.call_json`, `fake_llm.register("pair_generate" | "pair_validate", ...)`, existing `words._pair_id`, `words.generate_pair(room_id, theme=None)`.
- Produces:
  - `words.AVOID_MAX = 150`.
  - `words._gen_prompt(theme: Optional[str], avoid: List[str]) -> str`: when `avoid` is non-empty the prompt ends the instructions with `Do not use any of these pairs or reuse their words: <a/b; a/b; ...>` (English words only, at most `AVOID_MAX` entries, newest first).
  - `words.generate_pair(room_id, theme=None)` builds `avoid` itself from the `pairs` table (`concept_a/concept_b`, newest rows first) and now returns `None` without inserting when the generated pair's id (`_pair_id`) already exists (counts as a rejected duplicate); the reversed pair has the same id because `_pair_id` sorts the words.
  - `build_pool.main(argv: list[str] | None = None) -> int` and a new flag `--extend`: start the throwaway database from the shipped seed (load `seed/pairs_seed.json` as `db.init_db()` does) instead of emptying `pairs`; `--target` then means the total pool size; the output file contains only the pairs added by this run.

- [ ] **Step 1: Failing tests:**
  - `test_words.py`: `generation prompt lists existing pairs to avoid` (capture the `pair_generate` prompt; contains a known seed pair like the first seed pair's `a/b`); `avoid list is capped at AVOID_MAX` (insert 200 extra pairs; the prompt has at most 150 entries); `duplicate generated pair is rejected and not inserted` (fake returns an existing seed pair, count unchanged, result `None`); `reversed duplicate is rejected` (Review Focus 5); `new pair still inserts` (existing test keeps passing).
  - `test_build_pool.py`: `extend starts from the seed and writes only new pairs` (fake LLM returns incrementing distinct valid pairs; `main(["--extend", "--target", str(seed_size + 2), "--out", tmp])` returns 0 and the output file has exactly 2 pairs, none in the seed); `without extend the pool starts empty` (existing behaviour).
- [ ] **Step 2: Run** `venv/bin/pytest ai_svc/spy_hunt/tests/test_words.py ai_svc/spy_hunt/tests/test_build_pool.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the three changes and update the README pool section with `--extend` (one paragraph).
- [ ] **Step 4: Run** the full backend suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spy-hunt): pool generator avoids known pairs, build_pool --extend`.

## Task 6: Grow the pool to 120 (real run, reviewed)

**Files:**
- Modify: `seed/pairs_seed.json`; the dev database `spy_hunt.db` (insert only).
- Temp: `seed/pairs_candidate.json` (deleted at the end).

**Interfaces:**
- Consumes: Task 5 `build_pool --extend`, real `DEEPSEEK_API_KEY` from `.env` (spends roughly 2 model calls per pair, capped by `MAX_CALL_BUDGET = 450`).

- [ ] **Step 1: Run** in the background: `venv/bin/python -u -m ai_svc.spy_hunt.scripts.build_pool --extend --target 120` (output file: `seed/pairs_candidate.json`). Do not poll; it takes several minutes. Expected: prints `wrote N pairs ... (review before use)` where N is up to 37 new pairs.
- [ ] **Step 2: Review** the candidate file yourself: print every pair (en and zh-Hans) and the theme. Drop a pair when a language is not a natural everyday word, the two words are near synonyms or one contains the other, or the theme is sensitive. Report the count kept, the pairs dropped and why.
- [ ] **Step 3: Merge**: append the kept pairs to `seed/pairs_seed.json` (ids unique, same format, `indent=1`, `ensure_ascii=False`), delete `seed/pairs_candidate.json`, and insert the new pairs into the dev database with `INSERT OR IGNORE` (as done before; the seed only loads into an empty database). Print the new total from both the file and the dev database. If the total is under 120, report the shortfall rather than looping again.
- [ ] **Step 4: Run** the full backend suite. Expected: all pass (word tests are pool-size independent).
- [ ] **Step 5: Commit** `chore(spy-hunt): grow the word pool toward 120 pairs`.

## Final check

- [ ] Run both full suites and the e2e. Expected: all pass.
- [ ] Open the Result and Reveal screens once in Chromium against the dev servers (`http://localhost:5173`) by playing a short bot game with the real model; report what the Result screen and the grouped vote list look like.
- [ ] Compare against the spec section by section; list anything intentionally different.
