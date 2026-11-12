# Superadmin Panel: Daily Puzzle Refill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden, token-gated `/admin` page that lets a trusted operator refill the daily-puzzle queue from a browser instead of SSHing in to run a CLI, structured so future superadmin actions drop into the same panel.

**Architecture:** Backend gains an `admin.py` (shared-secret `X-Admin-Token` decorator + a lock-guarded async refill that runs `puzzle_gen.fill_queue` on the existing worker pool) and two routes on the existing `spy_hunt_bp` blueprint. Frontend gains an unlinked `/admin` route whose screen prompts once for the token (kept in `sessionStorage`), then shows an action-card panel; card 1 shows live queue counts and a Refill button that polls status while generation runs.

**Tech Stack:** Flask (backend, `PP-AI-Service` via `backend/` symlink), React 19 + react-router-dom 7 + Vite + TypeScript + Vitest (frontend), pytest with fake-LLM fixtures (backend tests).

**Spec:** `docs/superpowers/specs/2026-11-12-admin-refill-design.md`

## Global Constraints

- Shared-secret auth only — reuse the existing `ADMIN_TOKEN` env var (same helper as `PP-AI-Service/ai_svc/dictionary/cache_routes.py:get_admin_token`); no user accounts, no roles.
- Token accepted via the `X-Admin-Token` **header only**, never a query param (query strings leak into logs/history).
- The `/admin` page and route must not be linked from any player-facing nav/menu/copy.
- Admin routes take neither `auth.require_guest` nor the player-facing `ratelimits.limit` decorators.
- Refill must never block the HTTP request on LLM generation — it runs on the existing `workers.submit` pool and is guarded by a module-level lock so concurrent clicks cannot start a second `fill_queue`.
- Backend tests use the fixtures in `ai_svc/spy_hunt/tests/conftest.py` (`client`, `temp_db`); the autouse fixtures set `SPY_HUNT_FAKE_LLM=1` and `workers.set_synchronous(True)`, so `fill_queue` runs inline in tests. Frontend tests use Vitest and mock `../api/client`.

## Review Focus

- **Missing `X-Admin-Token` header (not just wrong value):** `request.headers.get` returns `None`; the comparison must reject `None` rather than erroring — covered in Task 1.
- **Empty string / empty env token:** if `ADMIN_TOKEN` is unset the existing helper auto-generates one, so a client sending an empty token must still be rejected — covered in Task 1.
- **Double refill click:** a second `POST /admin/refill` while one is in flight must return `started: false` and must not enqueue a second job — covered in Task 2.
- **Refill job raising mid-generation:** the in-progress flag must be cleared even when `fill_queue` throws, or the panel is stuck "refilling" forever — covered in Task 2.
- **401 on a stored-but-stale token:** the frontend must clear the stored token and re-prompt rather than loop — covered in Task 5.

---

### Task 1: Admin auth decorator

**Files:**
- Create: `backend/ai_svc/spy_hunt/admin.py`
- Test: `backend/ai_svc/spy_hunt/tests/test_admin.py`

**Interfaces:**
- Consumes: `get_admin_token` from `ai_svc.dictionary.cache_routes` (existing: reads `ADMIN_TOKEN` env or returns a persistent auto-generated token).
- Produces: `require_admin(fn)` — Flask view decorator. On a request whose `X-Admin-Token` header does not equal `get_admin_token()` (including a missing/empty header), returns `(jsonify({"error": "unauthorized"}), 401)` and does not call `fn`. Otherwise calls `fn`. Uses `hmac.compare_digest` for the comparison.

- [ ] **Step 1: Write the failing test**

Add a module-level `token` fixture and an `_app_with(view)` helper, then the four decorator tests. `_app_with(view)` builds a minimal `Flask(__name__)`, registers `admin.require_admin(view)` at `/x`, sets `testing = True`, and returns the app.

```python
# test_admin.py
import pytest
from ai_svc.spy_hunt import admin

@pytest.fixture
def token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret-xyz")
    return "secret-xyz"

def test_require_admin_rejects_missing_header(temp_db, token):
    app = _app_with(lambda: ("ok", 200))
    assert app.test_client().get("/x").status_code == 401

def test_require_admin_rejects_wrong_token(temp_db, token):
    app = _app_with(lambda: ("ok", 200))
    assert app.test_client().get("/x", headers={"X-Admin-Token": "nope"}).status_code == 401

def test_require_admin_rejects_empty_token(temp_db, token):
    app = _app_with(lambda: ("ok", 200))
    assert app.test_client().get("/x", headers={"X-Admin-Token": ""}).status_code == 401

def test_require_admin_allows_correct_token(temp_db, token):
    app = _app_with(lambda: ("ok", 200))
    r = app.test_client().get("/x", headers={"X-Admin-Token": "secret-xyz"})
    assert r.status_code == 200 and r.get_data(as_text=True) == "ok"
```

where `_app_with(view)` builds a minimal `Flask(__name__)`, registers `admin.require_admin(view)` at `/x`, and returns it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && SPY_HUNT_FAKE_LLM=1 python -m pytest ai_svc/spy_hunt/tests/test_admin.py -v`
Expected: FAIL (`admin` has no attribute `require_admin`).

- [ ] **Step 3: Implement `require_admin(fn)` in `admin.py`**

Use `functools.wraps`. Read `request.headers.get("X-Admin-Token", "")`, compare with `hmac.compare_digest(provided, get_admin_token())`. Import `get_admin_token` from `ai_svc.dictionary.cache_routes`. On mismatch return `jsonify({"error": "unauthorized"}), 401`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/ai_svc/spy_hunt/admin.py backend/ai_svc/spy_hunt/tests/test_admin.py
git commit -m "feat(spy-hunt): add admin token decorator"
```

---

### Task 2: Lock-guarded async refill + status

**Files:**
- Modify: `backend/ai_svc/spy_hunt/admin.py`
- Test: `backend/ai_svc/spy_hunt/tests/test_admin.py`

**Interfaces:**
- Consumes: `puzzles.ready_count()`, `puzzles.total_count()` (existing, return `int`); `puzzle_gen.fill_queue(target=14, log=...)` (existing, runs model calls); `workers.submit(fn, *a, **kw) -> Future` (existing pool; inline when synchronous).
- Produces:
  - `admin_status() -> dict` → `{"ready_count": int, "total_count": int, "refilling": bool}`.
  - `start_refill() -> dict` → if a refill is already in progress, `{"started": False, "refilling": True}` with no new job; else sets the in-progress flag, submits `fill_queue` to the worker pool wrapped so the flag is cleared in a `finally`, and returns `{"started": True}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_status_reports_counts(temp_db, token):
    # seed 2 ready puzzles via puzzles.insert_ready(*sample_puzzle(), 2, f"p-{i}")
    out = admin.admin_status()
    assert out == {"ready_count": 2, "total_count": 2, "refilling": False}

def test_start_refill_runs_fill_queue(temp_db, token, monkeypatch):
    calls = {"n": 0}
    monkeypatch.setattr(admin.puzzle_gen, "fill_queue", lambda **k: calls.__setitem__("n", calls["n"] + 1) or 1)
    assert admin.start_refill() == {"started": True}
    assert calls["n"] == 1           # ran inline (workers synchronous in tests)
    assert admin.admin_status()["refilling"] is False  # flag cleared after

def test_double_refill_does_not_double_run(temp_db, token, monkeypatch):
    # fill_queue blocks until released, so the flag is observably set when the 2nd call lands
    import threading
    started, release = threading.Event(), threading.Event()
    def slow(**k):
        started.set(); release.wait(2); return 0
    monkeypatch.setattr(admin.puzzle_gen, "fill_queue", slow)
    monkeypatch.setattr(admin.workers, "set_synchronous", lambda f: None)  # force real thread
    admin.workers.set_synchronous(False)
    r1 = admin.start_refill(); started.wait(2)
    r2 = admin.start_refill()
    release.set()
    assert r1 == {"started": True}
    assert r2 == {"started": False, "refilling": True}

def test_flag_cleared_when_fill_queue_raises(temp_db, token, monkeypatch):
    def boom(**k): raise RuntimeError("x")
    monkeypatch.setattr(admin.puzzle_gen, "fill_queue", boom)
    admin.start_refill()
    assert admin.admin_status()["refilling"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -k "status or refill" -v`
Expected: FAIL (`admin` has no `admin_status` / `start_refill`).

- [ ] **Step 3: Implement the refill state in `admin.py`**

Module-level `_lock = threading.Lock()` and `_refilling = False`. `start_refill`: acquire `_lock`; if `_refilling`, release and return the not-started dict; else set `_refilling = True`, release, and `workers.submit(_run_fill)`, where `_run_fill` calls `puzzle_gen.fill_queue(log=log.info)` inside `try/finally` that sets `_refilling = False` (under the lock) in the `finally`. `admin_status` reads the counts and the flag. Import `puzzle_gen`, `puzzles`, `workers`. Route `fill_queue`'s `log=` to the module logger rather than `print`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/ai_svc/spy_hunt/admin.py backend/ai_svc/spy_hunt/tests/test_admin.py
git commit -m "feat(spy-hunt): add lock-guarded async queue refill"
```

---

### Task 3: Admin HTTP routes

**Files:**
- Modify: `backend/ai_svc/spy_hunt/routes.py` (add after the daily-puzzle section, ~line 300; add `admin` to the module import on line 8)
- Test: `backend/ai_svc/spy_hunt/tests/test_admin.py`

**Interfaces:**
- Consumes: `admin.require_admin`, `admin.admin_status`, `admin.start_refill` (Task 1–2).
- Produces:
  - `GET /api/spy-hunt/admin/status` → `jsonify(admin.admin_status())`, wrapped in `@admin.require_admin`.
  - `POST /api/spy-hunt/admin/refill` → `jsonify(admin.start_refill())`, wrapped in `@admin.require_admin`.

- [ ] **Step 1: Write the failing tests** (use the `client` fixture)

```python
HDR = {"X-Admin-Token": "secret-xyz"}

def test_status_route_requires_token(client, token):
    assert client.get("/api/spy-hunt/admin/status").status_code == 401

def test_status_route_returns_counts(client, token):
    # seed 1 ready puzzle
    r = client.get("/api/spy-hunt/admin/status", headers=HDR)
    assert r.status_code == 200 and r.get_json()["ready_count"] == 1

def test_refill_route_starts(client, token, monkeypatch):
    monkeypatch.setattr(admin.puzzle_gen, "fill_queue", lambda **k: 0)
    r = client.post("/api/spy-hunt/admin/refill", headers=HDR)
    assert r.status_code == 200 and r.get_json() == {"started": True}

def test_refill_route_requires_token(client, token):
    assert client.post("/api/spy-hunt/admin/refill").status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -k route -v`
Expected: FAIL (404 — routes not registered).

- [ ] **Step 3: Add the two routes in `routes.py`**

Add `admin` to the `from ai_svc.spy_hunt import ...` list on line 8. Add a `# ---- admin ----` section with the two view functions, each decorated only with `@spy_hunt_bp.route(...)` and `@admin.require_admin` (no `auth.require_guest`, no `ratelimits.limit`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest ai_svc/spy_hunt/tests/test_admin.py -v`
Expected: PASS (all admin tests).

- [ ] **Step 5: Commit**

```bash
git add backend/ai_svc/spy_hunt/routes.py backend/ai_svc/spy_hunt/tests/test_admin.py
git commit -m "feat(spy-hunt): expose admin status and refill routes"
```

---

### Task 4: Frontend admin API client

**Files:**
- Modify: `src/api/client.ts` (add optional `headers` arg to `request`)
- Create: `src/admin/api.ts`
- Create: `src/admin/token.ts`
- Test: `src/admin/api.test.ts`

**Interfaces:**
- Consumes: `request` from `../api/client`.
- Produces:
  - `request<T>(method, path, body?, headers?: Record<string,string>)` — the new optional 4th arg is merged into the fetch headers (after `authHeaders()` and the content-type), so callers can add `X-Admin-Token`. Existing 3-arg calls are unchanged.
  - `token.ts`: `getToken(): string | null`, `setToken(t: string): void`, `clearToken(): void` — read/write `sessionStorage` key `spy-hunt.admin-token`, each wrapped in try/catch returning a safe default (the session module at `src/state/session.ts` is the pattern).
  - `api.ts`: `AdminStatus = { ready_count: number; total_count: number; refilling: boolean }`; `getAdminStatus(): Promise<AdminStatus>` → `GET /admin/status`; `startRefill(): Promise<{ started: boolean; refilling?: boolean }>` → `POST /admin/refill`. Both read the token via `getToken()` and pass `{ 'X-Admin-Token': token ?? '' }` as the headers arg. Neither calls `ensureGuest`.

- [ ] **Step 1: Write the failing tests**

```ts
// api.test.ts
vi.mock('../api/client', () => ({ request: vi.fn().mockResolvedValue({ ready_count: 3, total_count: 5, refilling: false }) }))
// stub sessionStorage token to 'tok'
test('getAdminStatus GETs with the admin header and no guest', async () => {
  expect(await getAdminStatus()).toEqual({ ready_count: 3, total_count: 5, refilling: false })
  expect(request).toHaveBeenCalledWith('GET', '/admin/status', undefined, { 'X-Admin-Token': 'tok' })
})
test('startRefill POSTs with the admin header', async () => {
  await startRefill()
  expect(request).toHaveBeenCalledWith('POST', '/admin/refill', undefined, { 'X-Admin-Token': 'tok' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/admin/api.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Add the `headers?` param to `request` in `client.ts` and spread it into the `headers` object in the `fetch` call. Write `token.ts` (sessionStorage, try/catch) and `api.ts` as specified.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/admin/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/admin/api.ts src/admin/token.ts src/admin/api.test.ts
git commit -m "feat(spy-hunt): add admin api client and token storage"
```

---

### Task 5: Admin screen + route

**Files:**
- Create: `src/screens/Admin.tsx`
- Modify: `src/routes.tsx` (add the route; do not touch any nav component)
- Test: `src/screens/Admin.test.tsx`

**Interfaces:**
- Consumes: `getAdminStatus`, `startRefill` from `../admin/api`; `getToken`, `setToken`, `clearToken` from `../admin/token`; `ApiError` from `../api/client`; `Loader`/`EmptyState` components (pattern: `src/screens/Daily.tsx`).
- Produces: `Admin` component. Route `/admin` → `<Admin />` in `routes.tsx`.

Behavior:
- On mount, if `getToken()` is null → render the token prompt (a `<form>` with a password input; submit calls `setToken(value)` then loads status).
- If a token is present → call `getAdminStatus()`. On `ApiError` with status 401 → `clearToken()` and show the prompt with an "invalid token" message. On other error → a generic error with a retry.
- On success → render the action panel: a "Daily puzzle queue" card showing `ready_count` / `total_count`, a **Refill** button, and a **Refresh** button (re-fetches status without refilling).
- Clicking Refill → `startRefill()`, then poll `getAdminStatus()` every 3000ms while the latest status has `refilling: true`, updating the shown counts; stop polling when `refilling` is false. Clear the interval on unmount.

- [ ] **Step 1: Write the failing tests** (Vitest + Testing Library; mock `../admin/api` and `../admin/token`)

```tsx
test('shows the token prompt when no token is stored', () => {
  vi.mocked(getToken).mockReturnValue(null)
  render(<Admin />)
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('submitting the token stores it and loads status', async () => {
  vi.mocked(getToken).mockReturnValue(null)
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 4, total_count: 4, refilling: false })
  render(<Admin />)
  await userEvent.type(screen.getByLabelText(/token/i), 'tok')
  await userEvent.click(screen.getByRole('button', { name: /enter/i }))
  expect(setToken).toHaveBeenCalledWith('tok')
  expect(await screen.findByText(/4/)).toBeInTheDocument()
})

test('a 401 clears the stored token and re-prompts', async () => {
  vi.mocked(getToken).mockReturnValue('stale')
  vi.mocked(getAdminStatus).mockRejectedValue(new ApiError(401, 'unauthorized'))
  render(<Admin />)
  await waitFor(() => expect(clearToken).toHaveBeenCalled())
  expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
})

test('refill triggers startRefill and shows refilling state', async () => {
  vi.mocked(getToken).mockReturnValue('tok')
  vi.mocked(getAdminStatus).mockResolvedValue({ ready_count: 2, total_count: 2, refilling: false })
  vi.mocked(startRefill).mockResolvedValue({ started: true })
  render(<Admin />)
  await userEvent.click(await screen.findByRole('button', { name: /refill/i }))
  expect(startRefill).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/Admin.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `Admin.tsx` and register the route**

Follow `Daily.tsx` for loading/error structure and the `screen`/`btn` class conventions. Use `window.setInterval`/`clearInterval` for the 3s poll, stored in a `useRef`, cleared on unmount and when `refilling` goes false. Add `<Route path="/admin" element={<Admin />} />` to `routes.tsx`; leave the `*` fallback and all other routes unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/screens/Admin.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend + backend suites**

Run: `npx vitest run` and `cd backend && python -m pytest ai_svc/spy_hunt/tests/ -q`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/screens/Admin.tsx src/routes.tsx src/screens/Admin.test.tsx
git commit -m "feat(spy-hunt): add hidden admin panel with queue refill"
```

---

### Task 6: Document the env var

**Files:**
- Modify: `backend/.env.example` (the `ADMIN_TOKEN` entry already exists — extend its comment to note it now also gates the spy-hunt admin panel)

**Interfaces:** none.

- [ ] **Step 1: Update the comment** above `ADMIN_TOKEN=` to say it gates both the dictionary cache-management endpoints and the spy-hunt admin panel (`/api/spy-hunt/admin/*`).

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs(spy-hunt): note ADMIN_TOKEN gates the admin panel"
```

---

## Manual verification (after all tasks)

- Start backend (`cd backend && python app.py`) and frontend (`npm run dev`); with `ADMIN_TOKEN` set, open `/admin`, enter the token, confirm the queue count shows and Refill flips to a refilling state and the count climbs. Confirm a wrong token re-prompts. Confirm `/admin` loads on a hard refresh (SPA fallback) and is absent from all player-facing nav.
