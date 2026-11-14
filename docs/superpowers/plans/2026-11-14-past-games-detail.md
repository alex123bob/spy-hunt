# Past Games Expandable Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each row in Profile's Recent games list expandable in place, showing the stored game detail (words, every seat's role, your credit breakdown) without leaving the page.

**Architecture:** A new `GameRecap` component renders a loaded `GameDetail` (words, lineup, static credit chips, full-recap link). A new `GameRow` component owns one list row: a toggle button, lazy detail fetch on first open with per-row error and retry, and a result cache for the life of the row. `Profile.tsx` renders `GameRow` per game. `wordFor` moves out of `GameDetail.tsx` into a shared helper.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, plain CSS in `src/styles/`.

**Spec:** `docs/superpowers/specs/2026-11-14-past-games-detail-design.md`

## Global Constraints

- Frontend only. No API or backend change. Reuse `getMyGameDetail(roomId: string, gameNo: number): Promise<GameDetail>` from `src/games/api.ts` and the `GameSummary`/`GameDetail` types.
- Detail is fetched on first open only and kept; reopening does not refetch. A failed fetch shows an error with a retry inside that row only.
- Several rows can be open at once.
- The toggle is a `<button>` with `aria-expanded`; the whole collapsed summary is inside it.
- Word shown in the viewer's language with the existing `wordFor` fallback (viewer language, then the game's `lang`, then any).
- Works at 320px, no horizontal scroll. Use theme tokens (`--ink`, `--paper`, `--muted`, `--sun`, `--mint`, `--tomato-deep`).
- Every new i18n key exists in both `src/i18n/en.json` and `src/i18n/zh-Hans.json` and in a both-language test list in `src/i18n/i18n.test.ts`.
- Do not use `sed -i` (leaves `*-e` backup files).
- `GameDetail.tsx` (the full-page screen) keeps working unchanged in behavior.

## Review Focus

- A game with `won: null` (draw / no winner): badge reads Draw, never Lost.
- Opening a row whose detail request fails: error and retry in that row only; other rows unaffected; retry refetches.
- Opening the same row twice: one request total. Two rows open at once: one request each.
- A detail with no words (`words` empty): the words line is omitted, nothing renders as "undefined".
- Bots in the lineup are marked; the viewer's own seat is marked; credits chips only for the viewer.
- Long player names wrap at 320px.

---

### Task 1: Shared word helper and i18n keys

**Files:**
- Create: `src/games/words.ts`, `src/games/words.test.ts`
- Modify: `src/screens/GameDetail.tsx` (import the helper instead of defining it), `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Produces: `export function wordFor(words: WordsByRole, role: Role, prefer: Lang, fallback: Lang): string` (same behavior as the current private function in `GameDetail.tsx`).
- Produces i18n keys (en / zh-Hans): `profile.game.you` ("You" / "你"), `profile.game.bot` ("Bot" / "机器人"), `profile.game.words` ("Words" / "词语"), `profile.game.yourWord` ("your word" / "你的词"), `profile.game.credits` ("Credits" / "积分"), `profile.game.fullRecap` ("Full recap" / "完整战报"), `profile.game.winner.civilians` ("Civilians won" / "平民获胜"), `profile.game.winner.spies` ("Spies won" / "卧底获胜"), `profile.game.winner.none` ("No winner" / "无胜者"), `profile.game.loading` ("Loading…" / "加载中…"), `profile.game.error` ("Could not load this game." / "无法加载这局游戏。"). Reuse existing `room.retry` for the retry button and `arena.role.*`, `arena.match.words`, `credits.kind.*` as they are.

- [ ] **Step 1: Write failing tests** in `src/games/words.test.ts`: prefers the viewer language; falls back to the game's language; falls back to any available word; returns `''` for a role with no entry.
- [ ] **Step 2: Run** `npx vitest run src/games/words.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `wordFor` in `src/games/words.ts` by moving the body from `GameDetail.tsx`; update `GameDetail.tsx` to import it. Add the keys above to both json files (edit tool, no `sed -i`) and to the both-language key list in `i18n.test.ts`.
- [ ] **Step 4: Run** `npx vitest run src/games src/screens/GameDetail.test.tsx src/i18n && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "refactor: share wordFor; add past-game detail strings"`

### Task 2: GameRecap component

**Files:**
- Create: `src/components/GameRecap.tsx`, `src/components/GameRecap.test.tsx`
- Modify: `src/styles/pages.css` (new `.game-recap*` rules)

**Interfaces:**
- Consumes: `wordFor` (Task 1), `GameDetail` type.
- Produces: `export function GameRecap(props: { detail: GameDetail; roomId: string; gameNo: number }): JSX.Element`. Renders, in order: a words line (omitted when both words are empty) using `t('profile.game.words')` and `t('arena.match.words', { civilian, spy })`, with the viewer's role's word marked by a `profile.game.yourWord` tag; a lineup list with one `<li>` per `detail.roles` entry: name, role via `arena.role.<role>`, a `profile.game.you` tag when `is_you`, a `profile.game.bot` tag when `is_bot`; static credit chips for the viewer's entry (`credit_parts` as `<li class="credit-chip chip-<kind>">+n {t('credits.kind.<kind>')}</li>`; when parts are empty and `credits_earned > 0`, one chip `+n {t('credits.title')}`); and `<Link to={/games/${roomId}/${gameNo}}>` with text `profile.game.fullRecap`. No animation.

- [ ] **Step 1: Write failing tests**: (a) words shown in the viewer language and the viewer's role word carries the your-word tag; (b) lineup marks `is_you` and `is_bot` seats; (c) credit chips render only for the viewer's entry, with `credit_parts` kinds; (d) empty `words` renders no words line and no "undefined"; (e) the link href is `/games/r1/3`.
- [ ] **Step 2: Run** `npx vitest run src/components/GameRecap.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `GameRecap`; CSS wraps long names (`overflow-wrap: anywhere`, `min-width: 0` on flex children) and reuses the existing `.role.spy`/`.role.civilian` and `.credit-chip` classes.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: add GameRecap component"`

### Task 3: GameRow and Profile list

**Files:**
- Create: `src/components/GameRow.tsx`, `src/components/GameRow.test.tsx`
- Modify: `src/screens/Profile.tsx` (render `GameRow` inside the existing `<ol className="game-list">`), `src/screens/Profile.test.tsx`, `src/styles/pages.css`

**Interfaces:**
- Consumes: `GameRecap` (Task 2), `getMyGameDetail`, `GameSummary`.
- Produces: `export function GameRow(props: { game: GameSummary }): JSX.Element` rendering `<li>`. The toggle `<button aria-expanded>` contains: result badge (`profile.gameOutcome.won|lost|none` text with credits as today), `arena.role.<your_role>`, winner text (`profile.game.winner.civilians|spies|none` from `game.winner`), and date plus time via `new Date(finished_at).toLocaleString()`. Opening the first time calls `getMyGameDetail(room_id, game_no)` once; while loading it shows `profile.game.loading`; on success it shows `<GameRecap>`; on failure it shows `profile.game.error` and a `room.retry` button that refetches. Reopening after success never refetches.

- [ ] **Step 1: Write failing tests** in `GameRow.test.tsx` (mock `../games/api`): (a) collapsed by default, `aria-expanded="false"`, no request; (b) click opens, one `getMyGameDetail('r1', 1)` call, recap shown; close and reopen: still one call; (c) failure shows the error and Retry, retry calls again and then shows the recap; (d) `won: null` shows the Draw wording and never "Lost"; (e) winner text and role are in the collapsed button.
- [ ] **Step 2: Run** `npx vitest run src/components/GameRow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `GameRow` (local state `{open, load}` with `load` one of idle/loading/ok/error; guard against state updates after unmount like `GameDetail.tsx`); style the button as a full-width row (min-height 44px, wraps at 320px) and the open panel under it.
- [ ] **Step 4: Update `Profile.tsx` and `Profile.test.tsx`**: replace the inline `<li>` with `<GameRow key=... game={gm} />`; the test "shows recent games and links to the detail screen" now opens the row (mock `getMyGameDetail`) and asserts the Full recap link href `/games/r1/1`; keep the other Profile tests (`.game-list li` count, role text, ordering, neutral outcome) passing; add a Profile test that two rows can be open at once, each causing one request.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit`. Expected: all PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: expandable recent game rows on Profile"`

---

## Self-Review notes
- Spec coverage: expandable rows with several open (T3), richer collapsed row (T3), expanded words/lineup/credits/full-recap link (T2), fetch once with per-row error and retry (T3), en + zh-Hans copy (T1), `aria-expanded` toggle (T3), 320px wrapping (T2/T3 CSS).
- Names consistent: `wordFor`, `GameRecap`, `GameRow`, `profile.game.*`.
- Deviation from spec: no `CreditBurst` reuse, because it animates and counts up; the recap uses the same `.credit-chip` classes statically.
