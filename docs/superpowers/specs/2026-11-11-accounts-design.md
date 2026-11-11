# Accounts (guest-first registration and login): design

Status: draft for owner approval. Date: 2026-11-11. Builds on everything merged to `main` in both repos, including the living bot arena. Product background: `docs/brainstorm/2026-11-06-brainstorm-record.md` §9 lists "Accounts, clans and the living bot" as the final phase; the living bot is done, so this slice is the accounts half — clans are a later slice built on top.

## 1. Intent

Every guest today is a bearer token that never expires, with no name, email or password attached — clearing a browser loses everything (bots, remix credit, top-bots standing, and the daily streak, which lives only in `localStorage` and isn't even tied to a guest). The owner wants **guest mode to stay the front door**: no signup wall, type a name and play. An account is an upgrade a guest opts into once they're already invested, not a condition of playing. This slice adds email+password registration and login, a quiet corner link for it, and a few soft nudges at moments where losing progress would actually sting — without blocking or interrupting anyone who'd rather keep playing as a guest.

## 2. Goals, non-goals, anti-goals

Goals
- A guest can register (email + password) from the corner link at any time; doing so attaches the credentials to their *existing* guest identity, so their bots, remix credit, arena record and daily streak are kept, not migrated or merged from scratch.
- A registered player can log in from any device/browser and see the same bots, streak and history there too (the actual point of having an account).
- Logging out signs out only the current device; other logged-in devices are unaffected.
- Three soft, dismissible nudges point an un-registered guest at the corner link: after a daily-streak milestone, after a notable win, and on a return visit — never a modal, never blocking.
- The daily-puzzle streak moves server-side (keyed by the guest's `player_id`), because "register to keep your streak" has to be an honest claim, and today the streak isn't attached to any identity at all.

Non-goals (this slice)
- Clan mode itself (leaderboards, clan vs clan, seasons) — the next slice once accounts exist.
- Merging two *already separately populated* identities (e.g. logging into an existing account from a device that already has its own unrelated guest bots). Logging in on that device replaces its local session with the account's; whatever that device had as an anonymous guest is abandoned, not merged. This is a real data-reconciliation problem and is deliberately punted.
- Email verification, "forgot password," social login (Google/Apple etc.), and any email-sending infrastructure at all — none exists in either repo today and none of this slice needs it.
- An account display name, profile page, or account deletion/GDPR flow. The per-room name entry is unchanged.
- A guest-only wall (a feature that requires an account to use at all). Nothing in this slice is gated — only the streak/win/return-visit nudges, which are copy, not walls. The "hitting a wall" nudge trigger from the brainstorm is deferred until a clan feature actually creates one.

Anti-goals (a failure even if it technically works)
- Anyone being blocked from playing, joining a room, or using any existing feature because they haven't registered.
- A nudge that interrupts gameplay (a modal at a trigger moment) rather than sitting quietly in the fixed banner slot.
- A password ever stored, logged, or sent anywhere in plaintext.
- Registering or logging in changing `player_id` for existing data (bots, remixes, arena record, rate-limit buckets) — all of that is keyed directly on the raw `player_id` string with no indirection, so it must keep working unchanged.
- Two sources of truth for the daily streak (client localStorage disagreeing with the server) after this slice ships.

## 3. Approaches considered

**Session model** (how a login is represented):
- **A. A `sessions` table holding many valid tokens per `player_id` (chosen).** `require_guest` already reduces to "does this token hash match a known `player_id`"; this generalizes it from one row to many. Both devices stay logged in after a login elsewhere, which is what makes "this device only" logout meaningfully different from "all devices" — if there were only ever one valid token, the distinction would be moot. Minimal diff: the `Authorization: Bearer player_id.token` shape, `require_guest`, and every downstream `g.player_id` consumer (bots, rate limits, rooms) are untouched.
- B. Rotate the single token on login (today's one-token-per-`player_id` shape, just reissued). Simpler schema, but a second device logging in would silently 401 the first device on its next request, forcing it to either re-login or — worse — quietly mint a brand-new anonymous guest and desync from the account. Rejected.
- C. Stateless JWT sessions. Adds a new library and a revocation story neither repo needs at this scale; rejected in favor of reusing the existing bearer-token-hash-in-DB pattern already in place everywhere else.

**Streak storage:**
- **A. Compute it from the existing `puzzle_results` table, keyed by `player_id` (chosen).** That table is already written server-side on every daily-puzzle action (`get_today`, `guess_spy`, `guess_word`), already has `day` and `solved` per player, and nothing has ever read it back per-player. No backfill needed — the history already exists, just unread.
- B. A new dedicated streak table, updated incrementally. Redundant with data `puzzle_results` already holds; rejected as needless duplication.

## 4. Design

### 4.1 Identity and sessions **(call)**

- `guests` gains two nullable columns: `email TEXT`, `password_hash TEXT` (idempotent migration, like every earlier slice's column-add loop). A partial unique index, `CREATE UNIQUE INDEX idx_guests_email ON guests(email) WHERE email IS NOT NULL`, keeps emails unique without constraining the (common, unregistered) null case.
- New table `sessions(token_hash TEXT PRIMARY KEY, player_id TEXT, created_at INTEGER)`. One row per valid token; a `player_id` can have many.
- **Migration:** a one-time, idempotent backfill copies every existing `guests.token_hash` into `sessions` (`INSERT OR IGNORE INTO sessions(token_hash, player_id, created_at) SELECT token_hash, player_id, created_at FROM guests WHERE token_hash IS NOT NULL`), run inside `init_db()`. Existing guest tokens keep working with no re-login required. Going forward, `guests.token_hash` is legacy and unused; new tokens (new guests, and every login) are written only to `sessions`.
- `auth.require_guest` changes its lookup from `guests.token_hash` to a join against `sessions` on the token hash; everything downstream (`g.player_id`) is unchanged, so bot ownership, remixes, rate-limit buckets and room membership all keep working exactly as today — none of them are touched by this slice.
- Password hashing uses `werkzeug.security.generate_password_hash` / `check_password_hash` (Werkzeug is already a Flask dependency; no new library). Minimum password length 8 characters **(call)**; email is lowercased and trimmed before storage/lookup, validated with a simple format check (no deliverability check, since there's no verification step).

### 4.2 Registration, login, logout, "who am I" **(call)**

All under `/api/spy-hunt`, all JSON body/response, all behind `@ratelimits.limit("flood")` (IP) first like every existing route:

- `POST /register` — `@auth.require_guest` then `@ratelimits.limit("action")` (guest-scoped). Body `{email, password}`. Attaches the credentials to `g.player_id` (the caller's *current* guest identity — the one already holding their bots and history). `400 bad_request` for an invalid email or a password under 8 characters; `409 conflict` for an email already in use by another `player_id`, **and also `409 conflict` if the calling `player_id` already has an email** (re-registering/overwriting an existing account's credentials is rejected outright rather than silently allowed — the UI never offers this path since the corner link only shows "Register" when no account exists yet, but the endpoint itself must not trust that). Returns `{email}`. The frontend calls `ensureGuest()` first if no session exists yet (same pattern `create()` on Landing already uses before `POST /rooms`), so registering always has a real `player_id` to attach to. **(call: the conflict guard)**
- `POST /login` — **no guest token required** (it's the one way to authenticate from a device with no session at all) — instead `@ratelimits.limit("login")`, a new **IP-scoped** limit (basic brute-force protection; rate left as a tunable constant, suggested 20/min). Body `{email, password}`. `401 unauthorized` on any mismatch (never reveals which field was wrong). On success, mints a fresh token, inserts it into `sessions` for that `player_id`, and returns `{player_id, token, email}` — the same shape as `POST /guests` plus `email`, so the frontend saves it into its session exactly the way `ensureGuest()` already does. This is what makes a second device "just work": a login there installs that `player_id` and a valid token locally, and every existing bots/history endpoint sees the same owner it always has.
- `POST /logout` — `@auth.require_guest` then `@ratelimits.limit("action")`. Deletes **only the session row matching the current request's token** ("this device only," per the owner's choice — meaningful precisely because other devices hold other valid tokens). Returns `{ok: true}`. The device then has no local session at all; the next action that needs one (e.g. opening `/daily`) creates a brand-new anonymous guest, exactly as a fresh browser does today — the account is untouched server-side, ready for the next login.
- `GET /me` — `@auth.require_guest` then `@ratelimits.limit("read")`. Returns `{email: string | null}`. The frontend calls this once per app load (alongside the existing recap-badge lookup pattern on Landing) to know whether the current `player_id` already has an account, so it can suppress the corner link and nudges and show the account's email instead.

### 4.3 Daily streak moves server-side **(call)**

- `puzzles.py` gains `streak_for(conn, player_id, today) -> {"streak": int, "best": int}`: reads every `puzzle_results` row for that `player_id` ordered by `day`, and computes the same semantics the frontend's `streak.ts` has today — current streak is the length of the run of consecutive solved days ending at `today` or `today - 1` (zero if the run is older than that), best is the longest such run ever seen for that player. A new index, `CREATE INDEX idx_puzzle_results_player ON puzzle_results(player_id, day)`, keeps this cheap (one tiny scan per player; row count is one per day the game has existed, per player).
- `GET /daily` and `GET /daily/result` responses both gain `streak`, `best` and `played_today` fields computed by this helper — `GET /daily` so Landing/the puzzle entry screen can show the live number without opening the full puzzle; `GET /daily/result` so the result screen shows the just-updated number without a second round trip. `played_today` means **finished** today's puzzle (a `puzzle_results` row for `(today, player_id)` with `stage='done'`), matching today's frontend semantics exactly: opening and abandoning the puzzle must not flip Landing's label from "Play" to "Done today," since that would be a visible UX regression from the current client-only behavior. **(call)**
- New route `GET /daily/streak` (guest, `read` limiter) returning `{streak, best, played_today}` — a lightweight call for Landing's badge, which otherwise has no reason to hit the heavier `/daily` payload just to show a number.
- The frontend's local `localStorage`-based streak (`src/daily/streak.ts`, key `spy-hunt.daily`) is **removed**, not kept as a fallback or dual-written — one source of truth, and no backfill is needed since the server already has the full history for every `player_id` that has ever played (every daily route already required a guest token). `DailyResult.tsx` stops calling `recordResult` and instead reads `streak`/`best` straight off the `GET /daily/result` response; Landing calls the new `GET /daily/streak` instead of the removed local functions.

### 4.4 The corner link, the modal, and account state **(call)**

- A fixed top bar (confirmed direction A in the visual mockups) sits above every screen's header, holding the language picker (already present on Landing) on one side and, on the other: "Register / log in" when the current session has no account yet, or the account's email (truncated) with a small "Log out" action once it does. This becomes a small shared layout piece wrapping `AppRoutes`, since no shared header exists today.
- **No eager guest creation.** `GET /me` is never called speculatively, and opening the app never creates a guest session by itself — that stays lazy exactly as it is today (a guest is created on the first real action: creating or joining a room, opening Daily, opening Bots). The top bar shows "Register / log in" whenever there is no local session (`getSession().playerId` unset), and only calls `GET /me` once a session already exists (fire-and-forget, alongside the existing recap-badge lookup pattern on Landing; its result is cached in the session module next to `email`, read on every render, and silently left as "unknown" — rendered as "Register / log in" — on failure). A guest who never does anything that creates a session simply sees "Register / log in" throughout, which is correct: they have nothing to attach an account to yet, and `POST /register` itself calls `ensureGuest()` first (per §4.2) if needed. **(call)**
- Tapping "Register / log in" opens a modal (confirmed direction) with two tabs, Register and Log in, sharing one email+password form. Register's copy makes the "nothing is lost" promise explicit ("Your current name, bots and streak move with you"), matching the brainstorm's intent that this never feels like starting over.
- **After a successful register, login, or logout, the app does a full page reload** (`window.location.reload()`) rather than trying to live-invalidate every screen's already-fetched data. Nothing today reacts to a mid-session credential change, and a reload is a small, correct fix rather than building a refresh mechanism this app has never needed before. The modal shows a brief "Signed in" state for one tick before reloading, so the action doesn't feel silently dropped. **(call)**
- The banner slot sits directly below the top bar (also direction A), one banner at a time, each dismissible with its own per-trigger dismissal (dismissing the streak banner doesn't suppress a later win banner). Banners never show at all once an account is known (the top bar shows the email).

### 4.5 The three nudges **(call)**

- **Precedence when more than one would fire in the same visit:** the more specific, earned triggers (streak milestone, notable win) take priority over the generic return-visit nudge.
- **Streak milestone:** fires when the streak just reached a milestone value (e.g. 3) on the Daily result screen or on return to Landing. Copy: "🔥 {n}-day streak — register to keep it on any device."
- **Notable win:** fires on the Room reveal screen when the viewer's own side (their role, civilian or spy) matches the room's `winner`. Scoped to the human's own room wins for this slice — a bot's arena "fooled the table" result stays in its recap only, not as a separate nudge trigger, to keep this slice's scope tight. Copy: "🎉 Nice win! Register so it's never lost to a cleared browser."
- **Return visit:** fires on the Nth time the Landing screen has ever loaded on this browser (a simple counter in storage; exact N, e.g. 3, left as a tunable constant). Copy: "👋 Welcome back — register to keep your bots safe."
- Each trigger's dismissal and "already shown" state is tracked independently (per-trigger, in the same storage that already holds guest session state), and none of the three ever appears once the guest has registered.

### 4.6 API summary

All under `/api/spy-hunt`:
- `POST /register`, `POST /login`, `POST /logout`, `GET /me` (new).
- `GET /daily/streak` (new); `GET /daily` and `GET /daily/result` gain `streak`, `best`, `played_today`.
- No change to any bots, rooms, arena, or top-bots route or response shape.

## 5. Constraints

- No new backend dependency — password hashing uses Werkzeug, already required by Flask.
- `player_id` never changes as a result of registering or logging in; every existing table and rate-limit bucket keyed on it (`custom_bots.owner_player_id`, `remixes`, `guest_recent_pairs`, `players.player_id`, `rooms.host_player_id`, the `guest:{player_id}` rate-limit bucket) is unaffected by this slice.
- Existing guest tokens issued before this migration keep working without forcing a re-login.
- The `Authorization: Bearer player_id.token` request shape is unchanged; only how tokens are minted/validated changes.
- zh-Hans and en copy for every new label (top bar, modal, all three nudge banners).
- Rate limits: `register`/`logout` use `action` (guest-scoped, existing); `me`/`daily/streak` use `read` (guest-scoped, existing); `login` is a new IP-scoped limit, since it runs before any guest token exists.

## 6. Decisions that were the owner's

- Guest mode stays the default; registration/login lives in a quiet corner, never a wall, with nudges that encourage rather than block ("not pushing too hard at the beginning").
- Email + password (not social login or magic links).
- Claim/merge is automatic: registering attaches to the existing guest identity rather than starting fresh.
- A login on another device should pick up the same bots and history (the reason the session model is a table of many tokens, not one).
- This slice is accounts only; clans are a later slice.
- No email verification and no password-reset flow for this slice.
- Nudge triggers: streak milestone, notable win, and return visit (not a guest-only wall, since none exists yet).
- Dismissing a nudge is per-trigger and can reappear for a different trigger later; the register/login surface is a modal; logout is this-device-only.

## 7. Left to the builder

Exact copy polish in both languages, the modal's visual styling, the top bar's exact layout on narrow screens, the streak-milestone and return-visit threshold constants (suggested 3 and 3, as named constants), the `login` rate limit's exact number (suggested 20/min), minimum password length enforcement details (suggested 8, server-side only — no client-side strength meter needed), indexes beyond the two named above if profiling calls for them, and tests for each part.
