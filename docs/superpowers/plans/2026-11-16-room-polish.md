# Room Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five independent room-experience fixes: the mobile zoom-stuck-after-blur
bug, the bot-profile-link base-path bug, LLM temperature variety for random bots,
add-bot discoverability, and a consolidated lobby share/invite header.

**Architecture:** Five standalone tasks, each touching a different slice of the app,
with no task depending on another's code. Tasks 1–2 and 4–5 are `spy-hunt`
(frontend, TypeScript/React/Vitest); Task 3 is `PP-AI-Service` (backend,
Python/pytest, path `ai_svc/spy_hunt/`). Tasks can be built and reviewed in any
order; the order below is cheapest-first.

**Tech Stack:** React + TypeScript + Vitest + Testing Library + Playwright (frontend);
Python + pytest + SQLite (backend).

**Spec:** `docs/superpowers/specs/2026-11-16-room-polish-design.md`

## Global Constraints

- Frontend and backend are separate git repos (`spy-hunt`, `PP-AI-Service`); each
  task's commit happens in its own repo.
- Every in-app link must resolve through `import.meta.env.BASE_URL` /
  `basename`, never a hardcoded absolute path (production serves at
  `/spy-hunt/`).
- `llm.call_json`'s new `temperature` parameter must default to behavior-preserving
  for every existing caller (translation, host, puzzle generation) — only the
  `"bot"`-task statement/vote calls for non-custom personas pass a non-default value.
- Bot temperature is derived from data already on the `players` row
  (`player_id`), stable for that bot's whole game — no DB migration.
- i18n: every new user-facing string needs both `en` and `zh-Hans` entries in
  `src/i18n/`.
- No blanket viewport/zoom meta changes (`maximum-scale`/`user-scalable=no`) —
  the zoom fix is the proven `.blur()`-on-dispatch pattern only.

## Review Focus

- A room that is already full when the add-bot CTA logic runs: the first "empty
  seat" CTA must not appear (today's `!full` guard around `AddBotMenu` must still
  hold once that control moves into the seat grid).
- A non-host viewer with no bots of their own, looking at a room with open
  seats: the first empty seat must render as a plain "Empty seat" placeholder,
  not an inert-looking CTA that does nothing when tapped (today's `AddBotMenu`
  returns `null` for this viewer; the CTA tile must inherit that same gating).
- `navigator.share` unavailable or the user cancels the native share sheet: the
  Invite button must fall back to clipboard-copy-plus-toast without throwing,
  matching `shareCard()`'s existing cancel/fallback behavior.
- Two bots in the same room both getting `bot_persona="cheerful"` (or any same
  persona) must still land at different temperatures, since temperature is
  derived from `player_id` (unique per bot), not from persona.
- A bot whose model call fails (LlmError/BudgetExceeded/timeout) must still fall
  back exactly as today (canned statement / random valid vote) — adding a
  `temperature` argument to the call must not change `_run_describe`'s or
  `_run_vote`'s existing exception handling or fallback paths.

---

## Task 1: Fix mobile zoom-stuck-after-blur on room/game inputs

**Files:**
- Modify: `src/screens/Table.tsx:21,52-65,104-113` (statement input)
- Modify: `src/screens/Room.tsx:38,117-137` (needName input)
- Modify: `src/screens/Landing.tsx:16-17,55-74,116-133` (name + code inputs)
- Modify: `src/screens/Clan.tsx:78-124` (clan name + code inputs, `NoClan`)
- Modify: `src/components/AuthModal.tsx:22-23,29-44,70-80` (email + password inputs)
- Test: `src/screens/Game.test.tsx` (Table), `src/screens/Room.test.tsx`,
  `src/screens/Landing.test.tsx`, `src/screens/Clan.test.tsx`,
  `src/components/AuthModal.test.tsx`

**Interfaces:**
- Consumes: nothing new — this task only adds `ref`s and `.blur()` calls to
  existing inputs and existing submit handlers (`send`, the needName `onClick`,
  `create`/`join`, the two `Clan.tsx` form `onSubmit`s, `AuthModal`'s `submit`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test for `Table.tsx`**

```tsx
test('sending a statement blurs the input (prevents mobile zoom persistence)', () => {
  render(<Table state={snap({ current_speaker: 1 })} />)
  const input = screen.getByPlaceholderText('Describe your word…')
  input.focus()
  fireEvent.change(input, { target: { value: 'hi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(input).not.toHaveFocus()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/Game.test.tsx -t "blurs the input"`
Expected: FAIL (input still has focus)

- [ ] **Step 3: Implement the fix in `Table.tsx`**

Add `const inputRef = useRef<HTMLInputElement>(null)`, attach `ref={inputRef}` to
the `<input>`, and call `inputRef.current?.blur()` as the first line inside
`send()` (fires unconditionally the moment the action is dispatched, before the
`await request(...)`, matching the proven fix: blur right after *initiating* the
action, not gated on its success).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/Game.test.tsx -t "blurs the input"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/Table.tsx src/screens/Game.test.tsx
git commit -m "fix: blur statement input on send to prevent mobile zoom persistence"
```

- [ ] **Step 6: Write the failing test for `Room.tsx`'s needName input**

```tsx
test('submitting a name blurs the input', async () => {
  // reuse this file's existing `go()` + needName-triggering mocks
  // (403 with empty session name -> needName boot state)
  vi.mocked(request).mockRejectedValueOnce(new ApiError(403, 'not_member'))
  go()
  const input = await screen.findByLabelText('Your name')
  input.focus()
  fireEvent.change(input, { target: { value: 'Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  expect(input).not.toHaveFocus()
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/screens/Room.test.tsx -t "blurs the input"`
Expected: FAIL

- [ ] **Step 8: Implement the fix in `Room.tsx`**

Add a `nameInputRef`, attach it to the needName `<input>`, call
`nameInputRef.current?.blur()` as the first line of the join button's
`onClick` handler (before `saveName`/`setAttempt`).

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/screens/Room.test.tsx -t "blurs the input"`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/screens/Room.tsx src/screens/Room.test.tsx
git commit -m "fix: blur name input on join to prevent mobile zoom persistence"
```

- [ ] **Step 11: Write the failing tests for `Landing.tsx`'s name and code inputs**

```tsx
test('creating a room blurs the name input', () => {
  render(<Landing />) // wrap in MemoryRouter per this file's existing convention
  const input = screen.getByLabelText('Your name')
  input.focus()
  fireEvent.change(input, { target: { value: 'Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  expect(input).not.toHaveFocus()
})

test('joining with a code blurs the code input', () => {
  render(<Landing />)
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } })
  const code = screen.getByLabelText('Room code')
  code.focus()
  fireEvent.change(code, { target: { value: 'ABCD' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }))
  expect(code).not.toHaveFocus()
})
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `npx vitest run src/screens/Landing.test.tsx -t "blurs"`
Expected: FAIL

- [ ] **Step 13: Implement the fix in `Landing.tsx`**

Add `nameRef`/`codeRef`, attach to their respective `<input>`s. In `create()`,
blur `nameRef` as the first line (after the `needName()` null-check returns, so
a validation failure that keeps the input visible for correction does not blur
it — matching the decision that failed submits don't blur; only a submit that
actually proceeds does). In `join()`, blur `codeRef` the same way, right after
`needName()` passes and before `nav(...)`.

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run src/screens/Landing.test.tsx -t "blurs"`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add src/screens/Landing.tsx src/screens/Landing.test.tsx
git commit -m "fix: blur name/code inputs on submit to prevent mobile zoom persistence"
```

- [ ] **Step 16: Write the failing tests for `Clan.tsx`'s create/join forms**

```tsx
test('creating a clan blurs the name input', () => {
  // render NoClan per this file's existing setup; fill name + pick a badge
  const input = screen.getByLabelText('Clan name')
  input.focus()
  fireEvent.change(input, { target: { value: 'Foxes' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create clan' }))
  expect(input).not.toHaveFocus()
})

test('joining a clan blurs the code input', () => {
  const input = screen.getByLabelText('Invite code')
  input.focus()
  fireEvent.change(input, { target: { value: 'ABCDEF' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join' }))
  expect(input).not.toHaveFocus()
})
```

- [ ] **Step 17: Run tests to verify they fail**

Run: `npx vitest run src/screens/Clan.test.tsx -t "blurs"`
Expected: FAIL

- [ ] **Step 18: Implement the fix in `Clan.tsx`**

Add `nameRef`/`codeRef` in `NoClan`, attach to their `<input>`s. Blur each as
the first line inside its form's `onSubmit` handler, before calling `run(...)`
— unconditional on dispatch, same as Task 1's other fixes.

- [ ] **Step 19: Run tests to verify they pass**

Run: `npx vitest run src/screens/Clan.test.tsx -t "blurs"`
Expected: PASS

- [ ] **Step 20: Commit**

```bash
git add src/screens/Clan.tsx src/screens/Clan.test.tsx
git commit -m "fix: blur clan name/code inputs on submit to prevent mobile zoom persistence"
```

- [ ] **Step 21: Write the failing tests for `AuthModal.tsx`'s email/password inputs**

```tsx
test('submitting the auth form blurs the focused input', () => {
  render(<AuthModal onClose={vi.fn()} />)
  const email = screen.getByLabelText('Email')
  email.focus()
  fireEvent.change(email, { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(email).not.toHaveFocus()
})
```

- [ ] **Step 22: Run test to verify it fails**

Run: `npx vitest run src/components/AuthModal.test.tsx -t "blurs"`
Expected: FAIL

- [ ] **Step 23: Implement the fix in `AuthModal.tsx`**

In `submit(e)`, immediately after `e.preventDefault()` and the `busy` guard,
call `(document.activeElement as HTMLElement | null)?.blur()` — this form has
two inputs and either could be focused at submit time, so blurring whichever
element is currently focused (rather than a single named ref) covers both
without extra refs. Fires unconditionally on dispatch, before the
`register`/`login` call.

- [ ] **Step 24: Run test to verify it passes**

Run: `npx vitest run src/components/AuthModal.test.tsx -t "blurs"`
Expected: PASS

- [ ] **Step 25: Commit**

```bash
git add src/components/AuthModal.tsx src/components/AuthModal.test.tsx
git commit -m "fix: blur focused auth input on submit to prevent mobile zoom persistence"
```

---

## Task 2: Fix bot profile link to resolve under the `/spy-hunt/` base path

**Files:**
- Modify: `src/components/PlayerChip.tsx:1-11`
- Test: `src/components/PlayerChip.test.tsx:7-11`

**Interfaces:**
- Consumes: `react-router-dom`'s `Link` (already imported elsewhere in the app,
  e.g. `src/bots/BotCardView.tsx`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the failing-first test**

Replace the existing test (it currently asserts a raw `href`, which is the bug):

```tsx
test('a custom bot links to its page', () => {
  render(<MemoryRouter><PlayerChip player={p({ bot_id: 'abc12345' })} /></MemoryRouter>)
  const a = screen.getByRole('link', { name: 'Bo' })
  expect(a).toHaveAttribute('href', '/bot/abc12345')
  expect(a).toHaveAttribute('target', '_blank')
})
```

(The asserted `href` stays `/bot/abc12345` in this unit test because
`MemoryRouter` has no `basename` configured — the fix is verified by the fact
that the link now goes through `<Link>`/routing at all, which is what makes
`App.tsx`'s real `basename={import.meta.env.BASE_URL}` apply in production.
`target`/`rel` are preserved.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PlayerChip.test.tsx -t "links to its page"`
Expected: FAIL — rendering `<PlayerChip>` outside a `Router` throws (the current
`<a>` doesn't need one; once Step 3 switches to `<Link>`, the un-wrapped render in
the *old* test file would throw, which is exactly the signal that step hasn't
landed yet). If the harness reports a throw rather than a clean assertion
failure, that still counts as FAIL for this step.

- [ ] **Step 3: Implement the fix in `PlayerChip.tsx`**

Add `import { Link } from 'react-router-dom'`. Replace:
```tsx
<a className="name wrap" href={`/bot/${encodeURIComponent(player.bot_id)}`} target="_blank" rel="noopener">{player.name}</a>
```
with:
```tsx
<Link className="name wrap" to={`/bot/${encodeURIComponent(player.bot_id)}`} target="_blank" rel="noopener">{player.name}</Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PlayerChip.test.tsx -t "links to its page"`
Expected: PASS

- [ ] **Step 5: Run the full PlayerChip and Lobby test files to catch any other render-without-Router break**

Run: `npx vitest run src/components/PlayerChip.test.tsx src/screens/Lobby.test.tsx`
Expected: PASS. If `Lobby.test.tsx` fails because `Lobby` is rendered without a
`Router` anywhere and now transitively needs one (via `PlayerChip`), wrap that
file's `render(<Lobby .../>)` calls in `<MemoryRouter>`, matching the pattern
already used in `src/screens/Result.test.tsx:31`.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlayerChip.tsx src/components/PlayerChip.test.tsx src/screens/Lobby.test.tsx
git commit -m "fix: resolve bot profile links through the router so they respect the base path"
```

---

## Task 3: Random bot LLM temperature variety (backend)

**Files:**
- Modify: `PP-AI-Service/ai_svc/spy_hunt/llm.py:102-174` (`_transport`,
  `_run_with_deadline`, `call_json`)
- Modify: `PP-AI-Service/ai_svc/spy_hunt/bots.py:411-493` (`_run_describe`,
  `_run_vote`)
- Test: `PP-AI-Service/ai_svc/spy_hunt/tests/test_llm.py`,
  `PP-AI-Service/ai_svc/spy_hunt/tests/test_bots.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `llm.call_json(task, prompt, schema, room_id, max_tokens, timeout,
  temperature=None)` — new optional keyword, default `None` (today's behavior:
  no `temperature` sent to the transport). `bots.bot_temperature(player_id:
  str) -> float` — new pure function, deterministic, range `[0.6, 1.2]`.

- [ ] **Step 1: Write the failing test for `bot_temperature`**

```python
def test_bot_temperature_is_deterministic_and_in_range():
    t1 = bots.bot_temperature("bot-abc123")
    t2 = bots.bot_temperature("bot-abc123")
    assert t1 == t2
    assert 0.6 <= t1 <= 1.2

def test_bot_temperature_varies_by_player_id():
    temps = {bots.bot_temperature(f"bot-{i:06x}") for i in range(20)}
    assert len(temps) > 1  # different bots land at different points in the range
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest ai_svc/spy_hunt/tests/test_bots.py -k bot_temperature -v`
Expected: FAIL with `AttributeError: module 'bots' has no attribute 'bot_temperature'`

- [ ] **Step 3: Implement `bot_temperature(player_id: str) -> float` in `bots.py`**

Add near the other module-level helpers (e.g. after `_canned_statement`). Hash
`player_id` with `hashlib.sha256(player_id.encode()).digest()`, take the first 4
bytes as an unsigned int, divide by `2**32` to get a float in `[0, 1)`, then map
linearly into `[0.6, 1.2]`: `0.6 + fraction * 0.6`. Add `import hashlib` to the
file's imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest ai_svc/spy_hunt/tests/test_bots.py -k bot_temperature -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai_svc/spy_hunt/bots.py ai_svc/spy_hunt/tests/test_bots.py
git commit -m "feat: deterministic per-bot temperature derived from player_id"
```

- [ ] **Step 6: Write the failing test for `call_json`'s new `temperature` parameter**

```python
def test_call_json_passes_temperature_to_transport(room, fake, monkeypatch):
    seen = {}
    real_transport = llm._transport
    def spy(task, prompt, max_tokens, timeout, temperature=None):
        seen['temperature'] = temperature
        return real_transport(task, prompt, max_tokens, timeout, temperature=temperature)
    monkeypatch.setattr(llm, "_transport", spy)
    fake.register("bot", lambda p: {"text": "hi"})
    llm.call_json("bot", "p", Out, room, 50, 8, temperature=0.9)
    assert seen['temperature'] == 0.9

def test_call_json_without_temperature_omits_it(room, fake, monkeypatch):
    seen = {}
    real_transport = llm._transport
    def spy(task, prompt, max_tokens, timeout, temperature=None):
        seen['temperature'] = temperature
        return real_transport(task, prompt, max_tokens, timeout, temperature=temperature)
    monkeypatch.setattr(llm, "_transport", spy)
    fake.register("bot", lambda p: {"text": "hi"})
    run(room)  # existing helper, calls call_json with no temperature arg
    assert seen['temperature'] is None
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `pytest ai_svc/spy_hunt/tests/test_llm.py -k temperature -v`
Expected: FAIL with `TypeError: call_json() got an unexpected keyword argument 'temperature'`

- [ ] **Step 8: Implement the `temperature` parameter through `llm.py`**

Thread an optional `temperature: float | None = None` parameter through
`call_json` -> `_run_with_deadline` -> `_transport`. In `_transport`, pass it to
both the `fake_llm.complete(...)` call and the real `client.chat.completions.create(...)`
call, but only include it in the real call's kwargs when it is not `None`
(DeepSeek's default is fine when it's `None`; don't send `temperature=None`
literally to the SDK). Update `fake_llm.complete`'s signature to accept and
ignore the same optional `temperature` parameter (the fake transport does not
need to vary behavior on it, but must accept the call shape so real and fake
paths match).

- [ ] **Step 9: Run tests to verify they pass**

Run: `pytest ai_svc/spy_hunt/tests/test_llm.py -k temperature -v`
Expected: PASS

- [ ] **Step 10: Run the full `test_llm.py` to confirm every existing caller (translate, host, puzzle) is unaffected**

Run: `pytest ai_svc/spy_hunt/tests/test_llm.py -v`
Expected: PASS (all prior tests pass unchanged, since `temperature` defaults to
`None` and existing call sites don't pass it)

- [ ] **Step 11: Commit**

```bash
git add ai_svc/spy_hunt/llm.py ai_svc/spy_hunt/fake_llm.py ai_svc/spy_hunt/tests/test_llm.py
git commit -m "feat: add optional temperature parameter to llm.call_json"
```

- [ ] **Step 12: Write the failing test for bots.py wiring `bot_temperature` into describe/vote calls**

```python
def test_describe_passes_bot_temperature_for_non_custom_persona(monkeypatch, room, fake, benv):
    rid = lobby_with_bots(1, 1)
    start(rid)
    bot_seat = next(s for s, p in seats(rid).items() if p["is_bot"])
    pid = seats(rid)[bot_seat]["player_id"]
    expected = bots.bot_temperature(pid)
    seen = {}
    real = llm.call_json
    def spy(task, prompt, schema, room_id, max_tokens, timeout, temperature=None):
        seen['temperature'] = temperature
        return real(task, prompt, schema, room_id, max_tokens, timeout, temperature=temperature)
    monkeypatch.setattr(bots.llm, "call_json", spy)
    fake.register("bot", lambda p: {"statement": "hi"})
    bots._run_describe(rid, bot_seat, seats(rid)[bot_seat])
    assert seen['temperature'] == expected

def test_describe_passes_no_temperature_for_custom_persona(monkeypatch, room, fake, benv):
    # a custom bot (bot_persona='custom') keeps today's behavior: no temperature override
    rid = lobby_with_bots(1, 0)
    # ... set up a seated custom bot per this file's existing custom-bot fixture pattern ...
    seen = {}
    real = llm.call_json
    def spy(task, prompt, schema, room_id, max_tokens, timeout, temperature=None):
        seen['temperature'] = temperature
        return real(task, prompt, schema, room_id, max_tokens, timeout, temperature=temperature)
    monkeypatch.setattr(bots.llm, "call_json", spy)
    fake.register("bot", lambda p: {"statement": "hi"})
    bots._run_describe(rid, custom_seat, seats(rid)[custom_seat])
    assert seen['temperature'] is None
```

(Reuse this test file's existing custom-bot seating helper, e.g. the pattern at
`test_bots.py:619` that sets `bot_persona='custom'` directly on a seat, for the
second test's setup.)

- [ ] **Step 13: Run tests to verify they fail**

Run: `pytest ai_svc/spy_hunt/tests/test_bots.py -k "passes_bot_temperature or passes_no_temperature" -v`
Expected: FAIL (today's `_run_describe` never passes `temperature`)

- [ ] **Step 14: Wire `bot_temperature` into `_run_describe` and `_run_vote`**

In both functions, after computing `outfit = _outfit_of(me)`, derive
`temperature = bot_temperature(me["player_id"]) if outfit is None else None`
(non-custom personas only — `outfit is None` is exactly today's "not a custom
bot" condition per `_outfit_of`). Pass `temperature=temperature` into both
`llm.call_json(...)` calls (the statement call in `_run_describe`, the vote call
in `_run_vote`).

- [ ] **Step 15: Run tests to verify they pass**

Run: `pytest ai_svc/spy_hunt/tests/test_bots.py -k "passes_bot_temperature or passes_no_temperature" -v`
Expected: PASS

- [ ] **Step 16: Run the full backend test suite to confirm no regression**

Run: `pytest ai_svc/spy_hunt/tests/ -v`
Expected: PASS

- [ ] **Step 17: Commit**

```bash
git add ai_svc/spy_hunt/bots.py ai_svc/spy_hunt/tests/test_bots.py
git commit -m "feat: vary random-bot temperature per bot for less uniform games"
```

---

## Task 4: Add-bot discoverability — first empty seat becomes the CTA

**Files:**
- Modify: `src/screens/Lobby.tsx:89-116` (seats/empty-seat rendering,
  `AddBotMenu` placement)
- Modify: `src/components/AddBotMenu.tsx` (if needed — see Step 3)
- Modify: `src/styles/game.css` (new CTA tile styling; remove or repurpose
  `.addbot-row`'s dashed-row look)
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json` (reuse `lobby.addBotRow`;
  no new key needed per the design doc's "Left to the builder" note)
- Test: `src/screens/Lobby.test.tsx`
- Test: `e2e/bots.spec.ts` (update the add-bot step if its locator changes)

**Interfaces:**
- Consumes: `AddBotMenu` exactly as it exists today — `{ isHost, myBots,
  ownBotIn, onAdd }` — no signature change. The CTA tile is a new wrapper
  *around* the same `AddBotMenu`, not a reimplementation of its menu logic.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test — CTA appears only for a host or bot-owner, in the first empty seat**

```tsx
test('the first empty seat is the add-bot CTA for the host, styled distinctly', () => {
  render(<Lobby state={snap(true)} />)
  const seatsList = screen.getAllByText(/Empty seat|Add a bot/)
  expect(seatsList[0]).toHaveTextContent(/Add a bot/)
  expect(seatsList[0].closest('.seat')).toHaveClass('seat-cta')
})

test('remaining empty seats (beyond the first) stay plain placeholders', () => {
  const s = sized(2, true) // 2 players, min 4 -> 2 empty seats, max_players 10
  render(<Lobby state={s} />)
  const placeholders = screen.getAllByText('Empty seat')
  expect(placeholders.length).toBeGreaterThanOrEqual(1)
})

test('a non-host with no bots sees a plain Empty seat, not a CTA, in the first slot', async () => {
  render(<Lobby state={snap(false)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.getByText('Empty seat')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('a non-host who owns a bot sees the CTA in the first empty seat', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={snap(false)} />)
  expect(await screen.findByRole('button', { name: /Add a bot/ })).toBeInTheDocument()
})

test('a full room has no CTA at all', async () => {
  vi.mocked(listMyBots).mockResolvedValue([mine('b1', 'Rex')])
  render(<Lobby state={full(true)} />)
  await waitFor(() => expect(listMyBots).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /Add a bot/ })).toBeNull()
})

test('there is no separate dashed add-bot row below the seats', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.queryByText('Empty seat')).toBeNull() // only 0 empty seats in snap(); the point is there's exactly one "Add a bot" affordance, not two
  expect(screen.getAllByRole('button', { name: /Add a bot/ })).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/Lobby.test.tsx -t "CTA"`
Expected: FAIL (no `.seat-cta` class exists yet, and `AddBotMenu` still renders
below the seats, not inside the first empty seat)

- [ ] **Step 3: Decide and implement the CTA/empty-seat merge in `Lobby.tsx`**

The visibility rule that decides whether *any* add-bot entry point shows is
exactly `AddBotMenu`'s current early return: `isHost || myBots.length > 0`
(today's `if (!isHost && myBots.length === 0) return null` at the top of
`AddBotMenu`). Compute that same boolean in `Lobby.tsx` as `canAddBot = isHost
|| myBots.length > 0`, alongside the existing `!full` guard.

In the empty-seats loop (today: `Array.from({ length: empty }, (_, k) => ...)`),
for `k === 0` and `canAddBot && !full`, render the `AddBotMenu` trigger wrapped
in a `.seat .seat-cta` div in place of the plain "Empty seat" div; for every
other `k` (and for `k === 0` when the condition is false), keep today's plain
`.seat.empty` div unchanged. Remove the old standalone
`{!full && <AddBotMenu .../>}` block that today sits below the seats
entirely — the CTA tile is its only home now.

`AddBotMenu` itself needs no prop or behavior change: it already returns `null`
when `!isHost && myBots.length === 0`, so wrapping it in the first-empty-seat
slot and gating that slot's CTA appearance on the same condition keeps the two
in lockstep by construction, not by duplicated logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/screens/Lobby.test.tsx -t "CTA"`
Expected: PASS

- [ ] **Step 5: Run the full `Lobby.test.tsx` to confirm no regression in existing add/remove-bot tests**

Run: `npx vitest run src/screens/Lobby.test.tsx`
Expected: PASS. Existing tests like "the host adds a random bot from the add
menu" (`src/screens/Lobby.test.tsx:135`) and "a non-host without bots has no
add row" (`:161`) must still pass — update any that assert on the old
below-seats DOM position if they fail on structure rather than behavior.

- [ ] **Step 6: Add CSS for `.seat-cta` in `src/styles/game.css`**

Give `.seat-cta` (and the `AddBotMenu` trigger inside it) a filled,
high-contrast look distinct from `.seat.empty`'s dashed/muted style — reuse
existing tokens (e.g. `var(--sun)` background, `var(--ink)` border, matching
the weight of `.addbot-row[aria-expanded="true"]`'s existing "active" look at
`game.css:215`) so it reads as the primary call-to-action, not a secondary
control.

- [ ] **Step 7: Update `e2e/bots.spec.ts` if the add-bot locator's DOM position changed**

Run: `npx playwright test e2e/bots.spec.ts` (or read the spec against the new
markup) — the existing locator is `owner.getByRole('button', { name: 'Add a
bot' })`, which is role/name-based and should still resolve correctly since
`AddBotMenu`'s trigger button is unchanged; only its container moved. No
locator change expected, but verify.

- [ ] **Step 8: Commit**

```bash
git add src/screens/Lobby.tsx src/screens/Lobby.test.tsx src/styles/game.css
git commit -m "feat: make the first empty seat the add-bot call-to-action for discoverability"
```

---

## Task 5: Lobby share/invite header redesign

**Files:**
- Create: `src/components/ShareSheet.tsx` (QR + link + copy popup, built on
  the existing `Sheet` component)
- Modify: `src/screens/Lobby.tsx:1-22,54-75,118-122` (header buttons, remove
  the bottom QR card, wire the new invite card model)
- Modify: `src/game/result.ts` or a new `src/game/lobbyShare.ts` (new
  `ShareCardModel` builder for the room invite — see Step 3 for the file choice)
- Modify: `src/i18n/en.json`, `src/i18n/zh-Hans.json` (new keys: see Step 9)
- Test: `src/screens/Lobby.test.tsx`
- Test: `src/components/ShareSheet.test.tsx`
- Test: `src/game/lobbyShare.test.ts` (or colocated with the chosen file)

**Interfaces:**
- Consumes: `drawCard`, `shareCard`, `ShareCardModel`, `ShareOutcome` from
  `src/daily/share.ts` (unchanged signatures); `Sheet` from
  `src/components/Sheet.tsx` (unchanged: `{ label, onClose, children,
  dismissible?, adornment? }`); `QrCode` from `src/components/QrCode.tsx`
  (unchanged: `{ text }`).
- Produces: `ShareSheet({ link, onClose }: { link: string; onClose: () => void
  }): JSX.Element` — the QR/link/copy popup, for use only within `Lobby.tsx`.
  `lobbyInviteCardModel(code: string, playerCount: number, maxPlayers: number,
  url: string): ShareCardModel` — pure function building the room-invite share
  card content.

- [ ] **Step 1: Write the failing test for `lobbyInviteCardModel`**

```ts
test('builds a room-invite share card model', () => {
  const m = lobbyInviteCardModel('ABCD', 3, 10, 'https://x/r/ABCD')
  expect(m.title).toBe('Spy Hunt')
  expect(m.puzzle).toBe('Room ABCD')
  expect(m.tiles.find(t => t.label === 'Players')?.value).toBe('3/10')
  expect(m.scanHint).toBe('Scan to join')
  expect(m.url).toBe('https://x/r/ABCD')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/lobbyShare.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement `lobbyInviteCardModel` in `src/game/lobbyShare.ts`**

New file, mirroring `roomCardModel`'s shape in `src/game/result.ts:44-67`:
returns a `ShareCardModel` with `title: t('app.title')`, `puzzle: t('lobby.shareRoomLine',
{ code })`, `solved: true` (drives the card's accent color — pick the "win"
palette since an invite is a positive moment, not a loss), `verdict:
t('lobby.shareInviteVerdict')`, `mascot: '🕵️'`, `hero`/`rankTitle: ''` (no
rank context in a pre-game invite — leave blank, `ShareCardModel`'s fields are
plain strings so an empty string renders nothing extra), one tile for player
count (`{ label: t('share.players'), value: `${n}/${max}`, color: '--sky' }`),
`badge: null`, `scanHint: t('lobby.scanToJoin')`, `url`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/lobbyShare.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/lobbyShare.ts src/game/lobbyShare.test.ts
git commit -m "feat: add share-card model for the lobby room invite"
```

- [ ] **Step 6: Write the failing test for `ShareSheet`**

```tsx
test('shows the QR code, the link, and a working copy button', async () => {
  const onClose = vi.fn()
  render(<ShareSheet link="https://x/r/ABCD" onClose={onClose} />)
  expect(screen.getByLabelText('QR code')).toBeInTheDocument()
  expect(screen.getByText('https://x/r/ABCD')).toBeInTheDocument()
  const clip = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(clip).toHaveBeenCalledWith('https://x/r/ABCD'))
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
})

test('Escape closes the sheet', () => {
  const onClose = vi.fn()
  render(<ShareSheet link="https://x/r/ABCD" onClose={onClose} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run src/components/ShareSheet.test.tsx`
Expected: FAIL (component doesn't exist)

- [ ] **Step 8: Implement `ShareSheet.tsx`**

```tsx
export function ShareSheet({ link, onClose }: { link: string; onClose: () => void }) {
  // Sheet label={t('lobby.invite')} onClose={onClose}
  // body: <QrCode text={link} />, <p className="wrap link">{link}</p>,
  // a copy button reusing the same clipboard-write + TOAST_MS-timed `copied` state
  // that Lobby.tsx's old copy() used (relocated here per the design doc), plus <Toast>.
}
```
Relocate the `copy()`/`copied`/`copyTimer` logic verbatim from today's
`Lobby.tsx:17-18,54-63` into this component — it is being moved, not
reinvented.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run src/components/ShareSheet.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/ShareSheet.tsx src/components/ShareSheet.test.tsx
git commit -m "feat: add ShareSheet popup with QR code, link, and copy button"
```

- [ ] **Step 11: Write the failing tests for the `Lobby.tsx` header redesign**

```tsx
test('the header has Invite and a QR icon button, no standalone Copy link pill', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'QR code' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
})

test('there is no bottom invite/QR card', () => {
  render(<Lobby state={snap(true)} />)
  expect(screen.queryByTestId('invite-link')).toBeNull()
  expect(screen.queryByLabelText('QR code')).toBeNull() // only appears once the QR button opens the sheet
})

test('clicking the QR icon opens the ShareSheet with the invite link', () => {
  render(<Lobby state={snap(true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'QR code' }))
  expect(screen.getByText(`${window.location.origin}/r/ABCD`)).toBeInTheDocument()
})

test('clicking Invite calls shareCard with the room invite model and falls back to copy on failure', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  render(<Lobby state={snap(true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  const arg = vi.mocked(shareCard).mock.calls[0][0]
  expect(arg.model.puzzle).toContain('ABCD')
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
})
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `npx vitest run src/screens/Lobby.test.tsx -t "Invite|QR|bottom"`
Expected: FAIL

- [ ] **Step 13: Implement the header redesign in `Lobby.tsx`**

Mock `shareCard`/`drawCard` in the test file the same way
`src/screens/Result.test.tsx:10` does (`vi.mock('../daily/share', ...)`).

In `Lobby.tsx`: remove the `copy`/`copied`/`copyTimer` state and the header's
"Copy link" `<button className="pill">` (moved into `ShareSheet`, Step 8).
Remove the entire bottom `<section className="card center">` block (the old
QR + `data-testid="invite-link"` card). Add `const [qrOpen, setQrOpen] =
useState(false)` and `const [shareState, setShareState] = useState({ text: '',
n: 0 })` (same pattern as `Result.tsx`/`DailyResult.tsx`). In the header, add
two buttons: `Invite` (calls an `inviteShare` handler) and a small icon button
labelled `QR code` (`onClick={() => setQrOpen(true)}`). Render `{qrOpen &&
<ShareSheet link={link} onClose={() => setQrOpen(false)} />}` once, near the
header. `inviteShare` builds `lobbyInviteCardModel(code, state.players.length,
state.config.max_players, link)`, calls `shareCard({ model, text:
t('lobby.shareText', { code }), filename: \`spy-hunt-room-${code}.png\` })`,
and sets `shareState` from the result's outcome exactly like
`Result.tsx:49-55`'s `share()` does, reusing `t('daily.shared')`-style keys
(new lobby-scoped ones — see Step 15).

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run src/screens/Lobby.test.tsx`
Expected: PASS

- [ ] **Step 15: Add new i18n keys to `src/i18n/en.json` and `src/i18n/zh-Hans.json`**

Add: `lobby.qrCode` ("QR code" / "二维码"), `lobby.shareRoomLine` ("Room {code}"
/ "房间 {code}"), `lobby.shareInviteVerdict` ("Join my game!" / "来加入我的游戏！"),
`lobby.scanToJoin` ("Scan to join" / "扫码加入"), `share.players` ("Players" /
"玩家"), `lobby.shareText` ("Join my Spy Hunt room: {code}" /
"来加入我的谍影追踪房间：{code}"), `lobby.shared` ("Shared" / "已分享"),
`lobby.shareFailed` ("Could not share." / "分享失败。"). Remove `lobby.link` only
if nothing else references it (grep first — it's also used as the `<label>`
text inside the old bottom card, which this task deletes).

- [ ] **Step 16: Run the full Lobby test file and the i18n consistency check (if one exists) to confirm no missing-key regressions**

Run: `npx vitest run src/screens/Lobby.test.tsx src/i18n/i18n.test.ts`
Expected: PASS

- [ ] **Step 17: Commit**

```bash
git add src/screens/Lobby.tsx src/screens/Lobby.test.tsx src/i18n/en.json src/i18n/zh-Hans.json
git commit -m "feat: consolidate lobby share UI into an Invite button (native share, image card) and a QR popup"
```

- [ ] **Step 18: Update `e2e/bots.spec.ts` and any other e2e spec asserting on the old "Copy link" pill or bottom invite card**

Run: `grep -rn "Copy link\|invite-link" e2e/` and update any matching
locators/assertions to the new header buttons (`Invite`, `QR code`).

- [ ] **Step 19: Commit the e2e update**

```bash
git add e2e/
git commit -m "test: update e2e specs for the redesigned lobby share header"
```

---

## Self-Review Notes

- **Spec coverage:** All five spec sections have a task (1↔Task 1, 2↔Task 2,
  3↔Task 3, 4↔Task 4, 5↔Task 5). The spec's "Left to the builder" items are
  folded into the relevant task's steps (exact `.blur()` call sites in Task 1;
  CSS/i18n/e2e updates in Tasks 4 and 5; `call_json`'s `temperature` default
  in Task 3).
- **Review Focus coverage:** full-room CTA suppression (Task 4, Step 1's third
  test), non-host-no-bots CTA suppression (Task 4, Step 1's second test),
  `shareCard` cancel/fallback (Task 5, Step 11's fourth test reuses the
  existing `shareCard()` fallback behavior verified by `Result.test.tsx`;
  temperature-by-persona and same-persona-different-temperature (Task 3,
  Steps 1 and 12's tests), bot fallback path untouched by the new
  `temperature` argument (Task 3, Step 16's full-suite run covers the
  existing fallback tests in `test_bots.py` unchanged).
- **Type/name consistency:** `bot_temperature(player_id: str) -> float` (Task
  3) is the name used consistently in both its defining task and nowhere
  redefined. `lobbyInviteCardModel` and `ShareSheet` (Task 5) are each defined
  once and consumed only within `Lobby.tsx`, so no cross-task signature drift
  is possible.
- **Proportion:** this plan is longer than the design doc because each of the
  five fixes needed its own file list, test-first steps, and commit — but no
  step carries a full function body beyond what its signature/test don't
  already determine; algorithmic bodies (the temperature hash-to-range
  formula, the CTA/empty-seat merge condition) are described in prose, not
  code, since the exact implementation is left to the builder's judgment
  within the stated constraint.
