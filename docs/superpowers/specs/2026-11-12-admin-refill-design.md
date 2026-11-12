# Superadmin panel: daily puzzle refill (phase 1)

Status: draft for owner approval. Tags: **(owner)** decided by the owner, **(call)** my decision, change it if you disagree.

## 1. Goal

Today the only way to top up the daily-puzzle queue is to SSH in and run `python -m ai_svc.spy_hunt.scripts.build_puzzles --count 14` by hand (see `2026-11-09-daily-puzzle-design.md` §11). This adds a hidden, token-gated admin page so that action — and future ones like it — can be triggered from a browser instead of a terminal.

This is explicitly the start of a **superadmin surface**, not a one-off button **(owner)**. "Refill the daily puzzle queue" is the first action; more operational actions land on the same page later without a redesign.

## 2. Non-goals

- A real account/role system. This stays a **shared-secret** gate, not user accounts **(owner)** — appropriate because the only people who'll ever hold the token are the owner and trusted operators, not players.
- Discoverability. The page is not linked from anywhere in the game UI; no nav entry, no mention in player-facing text **(owner)**.
- Scheduling. A cron/automatic top-up is still deferred, per the original design doc's §11 — this only makes the manual trigger reachable from a browser, it doesn't remove the need for a human (or a future cron) to press it.
- An audit log, multi-admin identity, or per-action permissions. One shared token can do everything the panel exposes.

## 3. Auth: shared admin token **(owner: lightweight shared secret)**

The backend already has exactly this pattern for cache-management endpoints (`PP-AI-Service/ai_svc/dictionary/cache_routes.py`): an `ADMIN_TOKEN` env var, checked against a request-supplied token, with an auto-generated fallback (logged a warning) if unset.

**(call)** Reuse that same `ADMIN_TOKEN` env var rather than inventing a second one — it's the same backend process, same intended operator, and one fewer secret to manage. Unlike the cache routes, the new endpoints accept the token **only via the `X-Admin-Token` header**, not a query string — query params land in server logs and browser history, which is an unnecessary leak for a token that controls real actions (LLM spend, queue mutation).

Flow: the admin page asks for the token once, keeps it in `sessionStorage` (survives refresh, clears when the tab closes) **(owner: fine for this use)**, and sends it as `X-Admin-Token` on every admin request. A wrong or missing token gets a 401 and the page re-prompts.

## 4. Backend changes (`PP-AI-Service`)

New module `ai_svc/spy_hunt/admin.py`:

- `require_admin_token(fn)` — decorator, mirrors `cache_routes.check_admin_auth` but header-only: reads `X-Admin-Token`, compares against `get_admin_token()` (reusing or re-exporting the existing helper rather than duplicating the auto-generate-and-warn logic).
- A module-level `threading.Lock` plus a `bool` flag so a second "refill" click while one is already running is a no-op, not a duplicate `fill_queue` run burning LLM calls twice. `fill_queue` runs on the existing `workers.submit` pool (`ai_svc/spy_hunt/workers.py`), the same pool bot turns and translation already use — no new thread machinery.

New routes on the existing `spy_hunt_bp` (`ai_svc/spy_hunt/routes.py`), grouped under `/admin`:

- `GET /api/spy-hunt/admin/status` → `{"ready_count": int, "total_count": int, "refilling": bool}`, using `puzzles.ready_count()` / `puzzles.total_count()` (already exist) plus the in-progress flag.
- `POST /api/spy-hunt/admin/refill` → if already refilling, returns `{"started": false, "refilling": true}` (200, not an error — the panel treats it as "already in progress"); otherwise submits `puzzle_gen.fill_queue` to the worker pool and returns `{"started": true}` immediately. The request never blocks on generation (a batch of 14 puzzles is ~13 model calls each, well past any reasonable HTTP timeout).

Both routes require `require_admin_token`; neither takes `auth.require_guest` (not a player-facing route) nor the player-facing rate limiters (`ratelimits.limit`) — **(call)** the lock already prevents the one failure mode that matters (duplicate concurrent runs), and this is a single-operator surface, not something that needs flood protection.

## 5. Frontend changes (spy-hunt)

- New route `/admin` in `src/routes.tsx`, **not** added to any nav/menu component **(owner)**.
- New screen `src/screens/Admin.tsx`:
  - If no token in `sessionStorage`: a single password-style input + submit, which just stores the value (no separate "verify" call — the first real request validates it, and a 401 clears the stored token and re-prompts).
  - Once a token is present: a panel of action cards. Card 1, "Daily puzzle queue": shows `ready_count` / `total_count` from `GET /admin/status`, and a "Refill" button.
  - Clicking Refill calls `POST /admin/refill`, then polls `GET /admin/status` every 3s **(call)** while `refilling` is true, updating the shown count live; stops polling once `refilling` goes false. A manual "Refresh" action exists independent of refill, for checking status without triggering generation.
  - Future actions are additional cards in the same panel — no structural change needed to add one.
- New `src/admin/api.ts`, parallel to the existing `src/daily/api.ts`: `getAdminStatus()`, `startRefill()`. These call the shared `src/api/client.ts` `request()` but need a header `request()` doesn't currently support (it only ever attaches the guest `Authorization` bearer). **(call)** Add an optional 4th `headers` parameter to `request<T>()` rather than writing a parallel fetch helper, so admin calls can pass `{ 'X-Admin-Token': token }` without duplicating error handling.

## 6. What happens on a bad/missing token

- No stored token → prompt screen, nothing fetched.
- Stored token rejected (401) → clear it from `sessionStorage`, show the prompt screen with a brief "invalid token" message, no retry loop.

## 7. Testing

- Backend (pytest, fake LLM per existing convention): `require_admin_token` rejects missing/wrong/no header; `/admin/refill` returns `started: true` and actually enqueues a `fill_queue` job; a second call while one is in flight returns `started: false` without a second job; `/admin/status` reflects `ready_count`/`refilling` correctly before, during (with `workers.set_synchronous` or a mocked lock state), and after.
- Frontend (Vitest): token prompt → stores and retries; 401 clears stored token and re-prompts; refill button triggers poll loop that stops when `refilling` flips false.
- Not covered: Playwright e2e (low value for a hidden single-operator page; manual check is enough) **(call)**.

## 8. Open question for the owner

None blocking — reusing the existing `ADMIN_TOKEN` is a call, not a requirement; say so if you'd rather this have its own separate token (e.g. so rotating cache-admin access doesn't also rotate puzzle-refill access).
