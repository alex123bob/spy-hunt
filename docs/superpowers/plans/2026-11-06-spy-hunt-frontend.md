# Spy Hunt Front End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 mobile-first spy-hunt web app that plays against the back end in `docs/superpowers/plans/2026-11-06-spy-hunt-backend.md`.

**Architecture:** React SPA. A small store holds the room snapshot and applies stream events through a reducer. The stream is `fetch` with a streaming body (so the Authorization header works), reconnecting with `after=<lastId>` and falling back to polling.

**Tech Stack:** TypeScript, React, Vite, React Router, yarn, Vitest, Playwright, a small QR library.

**Spec:** `docs/specs/2026-11-06-spy-hunt-design-spec.md` (screens, UX; §8) and `docs/specs/2026-11-06-spy-hunt-implementation-spec.md` (§7 API, §12 front end).

**Dependency:** Back-end Tasks 1–7 must exist before Tasks 5+ here can be exercised against a real server; until then develop against recorded fixtures. Back end runs with `SPY_HUNT_FAKE_LLM=1` for e2e.

## Global Constraints

- Package manager is **yarn**; app lives at the repo root (no `web/` subfolder). `VITE_API_BASE` is the API base (e.g. `/api/spy-hunt`).
- Languages: `en` and `zh-Hans` only. Default from `navigator.language`: `zh*` → `zh-Hans`, else `en`. Changeable in the room at any time.
- Auth header: `Authorization: Bearer <player_id>.<token>`. Token in `localStorage` (every access wrapped in try/catch; the app must work without storage). Never put the token in a URL.
- Show original message always; show the translation under it only when the message language ≠ viewer language and a translation exists. Originals appear instantly; translations fill in later.
- Never display other players' roles or words before game over. Own word shown in own language only.
- Dark theme default, large type, one-handed portrait layout, 16px side gutters, no horizontal scroll, works at phone width.
- Unknown event types are ignored. Countdown uses the server `phase_deadline` minus a measured clock offset.
- Reconnect backoff 1, 2, 4, 8 s (max 15 s); after 3 failures poll `GET /rooms/<code>` every 2 s while retrying the stream.
- SPA fallback: `/r/<code>` must serve `index.html`.

## Review Focus

- Phone locks/sleeps mid-turn, then wakes: stream resumes with no duplicate or missing statements (Task 3).
- Device clock is minutes wrong: countdown still correct (Task 3).
- localStorage blocked (private window): app still lets you play for the session (Task 2).
- Unknown/full/started room code in the link: friendly screen, not a blank page (Task 5).
- Very long or RTL/emoji statements and 16-char names: layout does not break (Task 6).

---

### Task 1: Scaffold

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`, `src/styles/global.css`, `src/App.test.tsx`. Modify `.gitignore` only if `yarn.lock` handling needs it.

**Interfaces:** Produces routes `/` (Landing), `/r/:code` (Room); dev proxy `/api` → `http://localhost:8000` in `vite.config.ts`; scripts `dev`, `build`, `test`.

- [ ] **Step 1: Failing test** `App.test.tsx`: rendering `/` shows an element with role `button` named "Create room".
- [ ] **Step 2: Run** `yarn test`; FAIL. **Step 3: Implement** the scaffold with `yarn create vite` React-TS template trimmed to the files above. **Step 4: Run** `yarn test` and `yarn build`; PASS. **Step 5: Commit** `feat: scaffold app`.

### Task 2: API client, session, i18n

**Files:** Create `src/api/client.ts`, `src/api/types.ts`, `src/state/session.ts`, `src/i18n/{index.ts,en.json,zh-Hans.json}` and tests beside each.

**Interfaces:**
- Produces: `api.request<T>(method, path, body?) -> Promise<T>` adding the auth header, throwing `ApiError{status, code}`; `session.getSession() -> {playerId, token, lang, name}`, `session.ensureGuest()` (POST `/guests` once), memory fallback when storage throws; `t(key, params?)`, `setLang(lang)`, `detectLang(navigatorLang:string) -> Lang`; types `Snapshot`, `Player`, `Message`, `ServerEvent` matching back-end impl §7.1–7.2.

- [ ] **Step 1: Failing tests:** `detectLang("zh-TW")==="zh-Hans"`, `detectLang("fr")==="en"`; `ensureGuest` works when `localStorage.getItem` throws; a 401 becomes `ApiError{status:401}`; every key in `en.json` exists in `zh-Hans.json` and vice versa.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat: api client, session, i18n`.

### Task 3: Stream and room store

**Files:** Create `src/api/stream.ts`, `src/state/roomStore.ts`, tests `stream.test.ts`, `roomStore.test.ts`.

**Interfaces:**
- Produces: `parseSse(chunks: AsyncIterable<string>) -> AsyncIterable<{id?:string,event:string,data:unknown}>` (handles split chunks, comments, multi-line data); `openRoomStream(code, onEvent, onStatus) -> {close()}` with backoff and polling fallback; `reduce(snapshot, event) -> Snapshot` (pure; `state` replaces; `statement` appends once by message id; `translation` attaches to the message; unknown ignored); `clockOffset(serverDateHeader, localNow) -> number`; `remainingMs(deadline, offset, now)`.

- [ ] **Step 1: Failing tests:** an event split across two chunks parses once; duplicate `statement` id (replay after resume) is not appended twice; `translation` for a not-yet-seen message is held and applied when it arrives; unknown event leaves state unchanged; with a clock 10 minutes fast, `remainingMs` is still the true remainder; after 3 failed connects the status becomes `polling`.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat: stream and store`.

### Task 4: Landing and Lobby

**Files:** Create `src/screens/{Landing,Lobby}.tsx`, `src/components/{LangPicker,PlayerChip,QrCode}.tsx`, tests.

**Interfaces:** Consumes Tasks 2–3. Landing: name input (max 16), language picker visible from first screen, Create / Join-with-code. Lobby: players with bot seats, QR + copyable link `${origin}/r/<code>`, host-only controls (main language, add/remove bots up to `max_players`, Start enabled when ≥ 1 human), language switch calls `PATCH /rooms/<code>/me`.

- [ ] **Step 1: Failing tests:** Start button absent for non-host; join code uppercased and trimmed; link text equals `/r/ABCD`; switching language updates visible strings immediately.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat: landing and lobby`.

### Task 5: Room shell, join-by-link, error screens

**Files:** Create `src/screens/Room.tsx`, `src/screens/RoomError.tsx`, tests.

**Interfaces:** `/r/:code` ensures a guest, GETs the snapshot (join if not a member and the game hasn't started), opens the stream, and renders the screen for `status/phase`. 404 → "room not found", 409 full/started → "game already started / room full" with a way home; 403 non-member triggers join.

- [ ] **Step 1: Failing tests** (mock api): 404, 409 and network failure each render their message; a member in `playing/describe` renders Table.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat: room shell`.

### Task 6: Word card, Table, Vote, Reveal, Result

**Files:** Create `src/screens/{WordCard,Table,Vote,Reveal,Result}.tsx`, `src/components/{StatementBubble,Countdown}.tsx`, tests.

**Interfaces:** Statement bubble shows original, plus translated text below when `message.lang !== viewer.lang && translations[viewer.lang]`; "translation unavailable" quiet marker only after the server says so. Table shows current speaker and `Countdown`; input only on own turn, disabled when eliminated, retry allowed after a 400 rejection. Vote shows alive players (excluding self; in a re-vote only tied targets, and tied players see "waiting"), "locked in" state, abstain. Reveal shows votes and the eliminated player's role. Result shows winner, all roles and both words in both languages, plus Rematch (host). Haptic tick via `navigator.vibrate` in the last 5 s when available.

- [ ] **Step 1: Failing tests:** zh viewer sees original and translation for an en message and original only for a zh message; own role never rendered during play; tied player's Vote screen has no targets; 2000-character and emoji/RTL statements render inside the bubble (no overflow class applied; text wraps); Countdown hits zero and stops.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat: game screens`.

### Task 7: Playwright smoke test and deploy notes

**Files:** Create `e2e/smoke.spec.ts`, `playwright.config.ts`, `README.md` (dev, build, Nginx snippet: serve `dist/`, `/api/` proxied with SSE block, SPA fallback for `/r/*`).

- [ ] **Step 1: Failing test:** start the back end with `SPY_HUNT_FAKE_LLM=1` and the dev server; two browser contexts create/join, start (bots fill), play to game over; assert result screen shows both words and no role text appeared before it.
- [ ] **Step 2–3:** run `yarn playwright test` (FAIL), fix gaps, run again (PASS) plus `yarn test` and `yarn build`. **Step 4: Commit** `test: e2e smoke and README`.
