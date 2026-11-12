# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen, modal, banner and state of the Spy Hunt front end into the approved cartoon "paper" look, with springy CSS motion and three signature moments (word card flip, reveal choreography, result word flip). Behaviour stays unchanged.

**Architecture:** Replace `src/styles/global.css` with a token-based design system split into a few CSS files. Add a small set of presentational primitives (FlipCard, Confetti, Sparkles, Sheet, Toast, Loader, EmptyState, the ring Countdown, the sized Avatar) and a `useReducedMotion` hook. Then restyle each screen on top of them, keeping every existing state, API call, string, role and test id. Motion is CSS only. JS timers only toggle classes and never gate content.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest + Testing Library (jsdom), Playwright, `@fontsource/fredoka`, `@fontsource/nunito`.

**Spec:** `docs/superpowers/specs/2026-11-12-ui-overhaul-design.md`. The visual source of truth is `.superpowers/brainstorm/98888-1794451145/content/look-and-feel.html` (the "mockup"). Copy its tokens, shapes, keyframes and easing.

## Global Constraints

- Work on branch `ui-overhaul`. Merge in one go. Delete the old stylesheet; never keep old and new side by side.
- No changes to the backend, API calls, routes, game rules or data shapes.
- No animation library. CSS keyframes and transitions plus small hooks only. The only new dependencies are `@fontsource/fredoka` and `@fontsource/nunito` (Latin subsets). No CJK font.
- Font stacks:
  - Display: `'Fredoka', 'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif`
  - Body: `'Nunito'` followed by the same fallbacks.
- Tokens:
  - Colours: cream `#f6ecd9`, paper `#fffaf0`, ink `#1d3b33`, green `#1f4a3f`, tomato `#e5533d`, sun `#f6c445`, sky `#8fd3e8`, pink `#f7a8b8`, mint `#9fe0b5`, lilac `#d9c4f2`.
  - Shape: borders 2–3px ink; hard shadows `0 5px 0 ink` (controls) and `6px 6px 0 ink` (hero cards); radius 16–24px (cards) and 999px (pills).
  - Easing: spring `cubic-bezier(.34,1.45,.5,1)`. Durations: feedback 120–180ms, entrances 250–450ms, flip 700ms.
- Layout: mobile first. 320px wide with no horizontal scroll and a 16px gutter. Centred column, max 520px, on the dotted cream background.
- Tap targets ≥ 44px. Visible focus ring: `outline: 3px solid ink; outline-offset: 2px`. AA contrast.
- `prefers-reduced-motion: reduce` turns off all decorative motion: no confetti or sparkles, instant flips and stamps.
- Animate only `transform` and `opacity` (the conic timer ring is the one exception). Confetti has at most 40 pieces and removes itself.
- Idle loops only on Landing, the TopBar logo and the Bot page.
- List stagger is 40ms per item, capped at 400ms in total.
- Preserved selectors: `.turnbar`, `.recap-new`, `span.avatar`, `.wrap`, `.bot-item`, `button.target`, every `data-testid`, every aria role and name. The WordCard's accessible name still toggles between `t('word.hide')` and `t('word.show')`.
- Every new string goes into both `src/i18n/en.json` and `src/i18n/zh-Hans.json` (the `every key exists in both dictionaries` test enforces this). Existing keys keep their text.
- Tests are edited only where layout really changes, never to weaken a behaviour check. `yarn test` (316 passing at baseline) and `yarn build` must pass after every task.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Long text at 320px.** 16-character names, long Chinese words and 8-letter room codes must wrap inside flip cards, avatar cards, the turn bar and leaderboard rows, never overflow. Pinned by a Task 2 FlipCard test (`.wrap` on the word) and the Task 15 screenshot sweep.
2. **The screen moves on mid-animation.** The reveal or result unmounts while timers are pending (a fast server phase change). No timer may fire after unmount (no React warnings) and the next screen must not wait. Pinned by a Task 2 `useStaged` unmount test.
3. **Many votes or players.** With 10 players and 9 votes on one target, the reveal sequence must still finish within 2500ms and the token row must wrap. Pinned by a Task 2 `useStaged` timing test with 9 steps.
4. **Reduced motion.** The full content still appears at once with no confetti. Pinned by Task 2 tests (Confetti renders nothing; `useStaged` jumps to the final step) and the Task 15 emulated-media screenshot.
5. **Keyboard and screen reader users** on restyled custom controls (segmented tabs, chip radios, toggles, account menu, Sheet). Roles, `aria-checked`/`aria-selected`/`aria-expanded`, a visible focus ring, and Escape closing the Sheet and the menu. Pinned by Task 3 Sheet tests and Task 4 account-menu tests.

---

## File Structure

- `src/styles/tokens.css`: custom properties, `@font-face` imports via fontsource, base element styles, the dotted background, focus ring, reduced-motion kill switch.
- `src/styles/primitives.css`: `.btn` variants, `.card`/`.panel`, `.tile`, `.pill`, `.tag`, `.tape`, inputs/selects/toggles, `.segmented`, `.ticket`, `.screen` enter animation, `.stagger`, shared keyframes.
- `src/styles/game.css`: room flow (lobby, table, bubbles, turnbar, vote, reveal, result, flip card).
- `src/styles/pages.css`: landing, daily, bots, bot form, top, clan, match, errors.
- `src/styles/global.css`: deleted. `src/main.tsx` imports the four files above in order.
- `src/motion/useReducedMotion.ts`, `src/motion/useStaged.ts`: motion hooks.
- `src/components/FlipCard.tsx`, `Confetti.tsx`, `Sparkles.tsx`, `Sheet.tsx`, `Toast.tsx`, `Loader.tsx`, `EmptyState.tsx`, `Logo.tsx`, `AccountMenu.tsx`: new primitives.
- Existing components and screens: modified in place.

---

### Task 1: Design tokens, fonts and primitives CSS

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/primitives.css`, `src/styles/game.css` (empty header comment), `src/styles/pages.css` (empty header comment)
- Delete: `src/styles/global.css`
- Modify: `src/main.tsx` (imports), `index.html` (`theme-color` → `#f6ecd9`), `package.json` (add fontsource deps)

**Interfaces:**
- Produces these class names, used by every later task:
  - Buttons: `.btn` plus `.primary` (tomato), `.secondary` (green), `.ghost` (dashed). The default `.btn` is paper.
  - Surfaces: `.card` (alias `.panel`), `.tile` with colour modifiers `.c-sun .c-sky .c-pink .c-mint .c-lilac`, `.pill`, `.tag` (with `.ok`, `.bad`), `.tape`, `.ticket`, `.segmented` (radiogroup/tablist container whose `[aria-checked=true]`/`[aria-selected=true]` child gets the pill), `.toggle` (styled checkbox inside a label).
  - Layout and helpers: `.screen`, `.stagger` (children pop in with `--i`-based delay), `.row`, `.between`, `.center`, `.muted`, `.small`, `.big`, `.wrap`, `.error`, `.ok`, `.narrow`, `.grow`.
  - Keyframes: `pop`, `rise`, `bob`, `hop`, `wob`, `shake`, `stamp`, `drop`, `spin`, `look`, `dot`, `pulse`.

- [ ] **Step 1: Install fonts.** Run `yarn add @fontsource/fredoka @fontsource/nunito`. Expected: both appear in `dependencies`.
- [ ] **Step 2: Write `tokens.css`.**
  - `@import '@fontsource/fredoka/500.css'` and `/600.css`, `/700.css`; `@import '@fontsource/nunito/500.css'`, `/700.css`, `/800.css`.
  - On `:root`: the token custom properties listed in Global Constraints, plus `--gutter: 16px`, `--ease-spring`, `--font-display` and `--font-body`.
  - `color-scheme: light`.
  - `body`: cream with a dot grid, `radial-gradient(rgba(29,59,51,.08) 1.5px, transparent 1.5px)` at 18px.
  - `:focus-visible` ring.
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; } }`
- [ ] **Step 3: Write `primitives.css`** with every class in Interfaces, styled like the mockup's `.btn`, `.tile`, `.pill`, `.tape`, `.field`.
  - `.btn`: `min-height: 52px`; lifts on hover, sinks on `:active`; disabled is `opacity: .5` with no lift.
  - `.screen`: `max-width: 520px`, `margin: 0 auto`, `padding: 16px var(--gutter) 32px`, `animation: rise 300ms ease-out`.
  - `.stagger > *`: `animation: pop 400ms var(--ease-spring) both; animation-delay: calc(min(var(--i, 0), 10) * 40ms)`.
  - Keep `.wrap` exactly as today: `overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap`.
- [ ] **Step 4: Point `main.tsx` at the new files.** Import `tokens.css`, `primitives.css`, `game.css` and `pages.css` in that order. Delete `global.css`. Copy across from it any class that a still-unstyled screen needs to stay usable (`.chip-row`, `.avatar`, `.bubble`, `.qr`, `.modal-backdrop`, `.history`, `.picker`, `.clan-badge`, `.badges`, `.rule-row`, `.topbar`, `.nudge`, `.banner`, `.countdown`, `.targets`, `.role`), restyled with the new tokens, into `game.css` or `pages.css`. Later tasks replace them.
- [ ] **Step 5: Verify.** Run `yarn test && yarn build`. Expected: 316 tests pass and the build succeeds. Then run `yarn dev`, open `/` at 320px wide, and check: cream dotted background, Fredoka headings, chunky buttons, no horizontal scroll.
- [ ] **Step 6: Commit** with the message `feat(ui): design tokens, fonts and primitives`.

---

### Task 2: Motion hooks and effect primitives

**Files:**
- Create: `src/motion/useReducedMotion.ts`, `src/motion/useStaged.ts`, `src/components/FlipCard.tsx`, `src/components/Confetti.tsx`, `src/components/Sparkles.tsx`
- Test: `src/motion/useStaged.test.tsx`, `src/components/FlipCard.test.tsx`, `src/components/Confetti.test.tsx`
- Modify: `src/styles/game.css` (flip card, sparkles and confetti styles from the mockup)

**Interfaces:**
- `useReducedMotion(): boolean`. Reads `window.matchMedia('(prefers-reduced-motion: reduce)')` and subscribes to changes. Returns `false` when `matchMedia` is missing (jsdom).
- `useStaged(delays: number[]): number`
  - Returns the index of the current step: 0 at mount, then +1 after each delay has passed (the delays add up).
  - When reduced motion is on, it returns `delays.length` at once.
  - Clears every timer on unmount, and restarts when the `delays` contents change (compare them with `delays.join()`).
- `FlipCard(props: { flipped: boolean; front: ReactNode; back: ReactNode; label: string; onClick?: () => void; className?: string; size?: 'lg' | 'sm' }): JSX.Element`
  - Renders as a `<button type="button" aria-label={label}>` when `onClick` is given, and as a `<div role="group" aria-label={label}>` otherwise.
  - Contains `.flip-card` with `.face.back` and `.face.front`. `flipped` adds `.flipped`, which shows the front.
  - The face that is not showing gets `aria-hidden="true"`.
- `Sparkles(props: { burstKey: number }): JSX.Element | null`
  - Plays a 12-piece burst each time `burstKey` changes after mount. Nothing plays at mount or when reduced motion is on.
- `Confetti(props: { run: boolean; pieces?: number }): JSX.Element | null`
  - `pieces` defaults to 40 and is capped at 40.
  - Renders `null` when `run` is false or reduced motion is on.
  - Has `aria-hidden` and `pointer-events: none`, and fills its positioned parent.
  - Unmounts its pieces after 3s.

- [ ] **Step 1: Write the failing tests.**
  - `useStaged.test.tsx`, using `vi.useFakeTimers()`:
    - `steps through cumulative delays`: `useStaged([100, 200])` returns 0, then 1 after 100ms, then 2 after 300ms.
    - `nine steps of a busy reveal finish inside 2500ms`: the delays come from Task 9's `revealDelays(9)`, so stub them as `[...Array(9).fill(130), 400, 500]` and assert the step is `11` after 2500ms.
    - `clears timers on unmount`: unmount after 50ms, advance 1000ms, and `vi.getTimerCount()` is `0`.
    - `jumps to the end under reduced motion`: mock `matchMedia` to report `matches: true` and assert the first render returns `delays.length`.
  - `FlipCard.test.tsx`:
    - `hides the face not showing from assistive tech`: with `flipped={false}`, the front has `aria-hidden="true"` and the back does not.
    - `toggles via onClick and keeps its label`: the button has the label it was given, and a click calls `onClick`.
    - `a long word wraps`: front content `<span className="word wrap">{'超级长的中文词语测试测试'}</span>` gives an element with class `wrap`.
  - `Confetti.test.tsx`:
    - `renders at most 40 pieces`: `<Confetti run pieces={100} />` gives `container.querySelectorAll('i').length === 40`.
    - `renders nothing when not running or reduced motion`.
- [ ] **Step 2: Run the tests to see them fail.** Run `yarn vitest run src/motion src/components/FlipCard.test.tsx src/components/Confetti.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the hooks and components** with the signatures above. Copy the flip CSS (`perspective: 900px`, `transform-style: preserve-3d`, `backface-visibility: hidden`, 700ms spring) and the burst, fall and keyframe CSS from the mockup into `game.css`. Confetti pieces get random `left`, colour, delay (0–0.6s) and duration (1.8–2.8s) when created.
- [ ] **Step 4: Run the tests to see them pass.** Run the same command, then `yarn test`. Expected: everything passes.
- [ ] **Step 5: Commit** with the message `feat(ui): motion hooks, flip card, confetti, sparkles`.

---

### Task 3: Shared component restyle (avatar, timer, bubble, chips, sheet, toast, loader, empty state)

**Files:**
- Modify: `src/components/Avatar.tsx`, `Countdown.tsx`, `StatementBubble.tsx`, `PlayerChip.tsx`, `ClanTag.tsx`, `LangPicker.tsx`, `StatementHistory.tsx`
- Create: `src/components/Sheet.tsx`, `Toast.tsx`, `Loader.tsx`, `EmptyState.tsx`
- Test: `src/components/Sheet.test.tsx`, `src/components/Countdown.test.tsx`, plus the existing `Avatar.test.tsx`, `PlayerChip.test.tsx` and `StatementBubble.test.tsx` (these must still pass)
- Modify: `src/styles/game.css`, `src/styles/primitives.css`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`

**Interfaces:**
- `Avatar({ player, size = 'm', out = false })`
  - Still renders `span.avatar`. Adds the classes `avatar-s`, `avatar-m` or `avatar-l` (28/36/96px) and `is-out`, which greys it and adds a ✕ sticker via `::after`.
  - The emoji-or-initial logic stays the same.
- `Countdown({ deadline, offset = 0, vibrate = true, total?: number })`
  - Still renders `<span role="timer">` with the seconds as its text.
  - Wraps the number in a ring: CSS var `--p` = `secs/total`, clamped to 0..1, and set to 1 when `total` is missing. The ring is `conic-gradient(var(--tomato) calc(var(--p)*360deg), var(--paper) 0)`.
  - `.urgent` (5 seconds or less) adds `pulse`.
- `StatementBubble`: same props. Adds an avatar slot (optional prop `avatar?: { name: string; avatar?: AvatarData | null }`) to the left of the bubble.
  - Bubble kinds: `mine` is mint; `host` is sun with a dashed border; `skipped` is faded italic.
  - The translation keeps `data-testid="translation"` and adds a 🌐 prefix as `aria-hidden` text, so the test id's text content is unchanged.
- `PlayerChip`: same props. Uses `Avatar size="m" out={!player.alive}` and pill tags. The bot tag reads `🤖 {t('lobby.bot')}`, with the 🤖 in an `aria-hidden` span.
- `LangPicker`: same props and roles. Container class becomes `segmented`.
- `Sheet({ label, onClose, children, dismissible = true })`
  - Renders `<div className="sheet-backdrop">` containing `<div role="dialog" aria-modal="true" aria-label={label} className="sheet">`.
  - Escape and a backdrop click call `onClose` when `dismissible`.
  - Focuses the first focusable element on mount.
  - Bottom sheet below 560px wide, centred pop-in above that.
- `Toast({ text })`: `<p role="status" className="toast">{text}</p>` with a pop-in animation. Returns `null` when `text` is empty.
- `Loader({ label })`: `<div className="loader" role="status"><Logo size="s" /><span className="dots" aria-hidden /><span className="muted">{label}</span></div>`. Depends on Task 4's `Logo`; until then, put the eye markup inline and swap it in Task 4.
- `EmptyState({ emoji, title, body?, role?, children? })`: an emoji spot disc, then `<h2>`, then `<p className="muted">`, then an actions slot. `role` is passed through to the wrapper (for `alert`).

- [ ] **Step 1: Write the failing tests.**
  - `Sheet.test.tsx`:
    - `Escape closes a dismissible sheet` calls `onClose`.
    - `Escape does nothing when not dismissible`.
    - `has dialog role and label`.
    - `focuses first control`.
  - `Countdown.test.tsx`:
    - `exposes seconds as timer text and ring progress`: with `deadline = now + 10_000` and `total = 20`, `getByRole('timer')` has text `10`, and its wrapper's style `--p` is `0.5`.
    - `marks urgent at 5 seconds or less`.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/components`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above and their CSS.
- [ ] **Step 4: Run the tests.** Run `yarn test`. Expected: all tests pass, including the unchanged `Avatar`, `PlayerChip` and `StatementBubble` tests.
- [ ] **Step 5: Commit** with the message `feat(ui): restyled shared components and sheet/toast/loader/empty-state`.

---

### Task 4: Global chrome: TopBar with logo and account menu, nudge, reconnect banner, screen transitions

**Files:**
- Create: `src/components/Logo.tsx`, `src/components/AccountMenu.tsx`
- Modify: `src/components/TopBar.tsx`, `src/components/NudgeBanner.tsx`, `src/screens/Room.tsx` (banner markup, `key={screen}` on the phase body), `src/components/Loader.tsx` (use `Logo`)
- Test: `src/components/TopBar.test.tsx` (edit), `src/components/AccountMenu.test.tsx` (new), `e2e/accounts.spec.ts` (edit)
- Modify: `src/styles/primitives.css`, i18n files (new key `auth.account` = "Account" / "账户", `app.trust` = "Trust nobody" / "谁都别信")

**Interfaces:**
- `Logo({ size = 'm', withText = true })`: the eye disc from the mockup (with the glancing pupil) plus the Fredoka `t('app.title')`. In TopBar it is wrapped in `<Link to="/" aria-label={t('app.title')}>`.
- `AccountMenu({ email, onLogout })`
  - A pill button with `aria-haspopup="menu"`, `aria-expanded` and accessible name `t('auth.account')`.
  - When open, shows a popover: the email (with `.wrap`) and a `Log out` button (`t('auth.logout')`).
  - Escape and an outside click close it.
- TopBar layout: Logo on the left. On the right: LangPicker (segmented, compact) plus either the "Register / log in" pill or the Clan pill plus `AccountMenu`.
- NudgeBanner: a `.nudge` sticky note (sun colour, `rotate(-1deg)`, slides in from the top). The dismiss button keeps its aria-label.
- Reconnecting banner: `<div className="banner" role="status">` with a pulsing dot. Keeps the text `t('room.reconnecting')`.
- `RoomView`: wrap the phase body in `<div key={screen} className="phase">` so `.screen`'s `rise` replays on each phase change. Don't add exit animations.

- [ ] **Step 1: Write the failing tests and update the existing ones.**
  - `AccountMenu.test.tsx`:
    - `opens to show email and log out`: click the `Account` button and assert that `a@b.com` and the `Log out` button are visible.
    - `Escape closes it` and `aria-expanded` is back to `false`.
  - Edit `TopBar.test.tsx`: the signed-in test clicks `Account` before it expects the email and clicks `Log out`. The signed-out assertions stay the same.
  - Edit `e2e/accounts.spec.ts:36`: click `getByRole('button', { name: 'Account' })` before clicking Log out. Also open the menu before any email-visible assertion in that spec.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/components`. Expected: the AccountMenu and TopBar tests FAIL.
- [ ] **Step 3: Implement** the interfaces above and their CSS. Swap `Logo` into `Loader`.
- [ ] **Step 4: Run the tests.** Run `yarn test && yarn build`. Expected: everything passes.
- [ ] **Step 5: Commit** with the message `feat(ui): top bar, account menu, nudge and phase transitions`.

---

### Task 5: Auth modal as a Sheet

**Files:**
- Modify: `src/components/AuthModal.tsx`, `src/styles/pages.css`
- Test: `src/components/AuthModal.test.tsx` (must pass; add one test)

**Interfaces:**
- Consumes: `Sheet` (from Task 3; `dismissible={!done}`, `label={t(tab === 'register' ? 'auth.registerTab' : 'auth.loginTab')}`).
- Layout, top to bottom:
  - a mascot avatar disc peeking over the top edge (`🕵️` on sun, `aria-hidden`);
  - the tabs as `.segmented` with `role="tablist"` and buttons with `role="tab"` (unchanged);
  - the pitch and note text;
  - chunky inputs, Submit (`.btn.primary`) and Close (`.btn.ghost`).
- An error adds `shake` once: re-key the `<p role="alert">` with an error counter so the animation replays.
- Success shows a ✓ disc that pops in next to `t('auth.signedIn')`.

- [ ] **Step 1: Write a failing test.** In `AuthModal.test.tsx`, add `the sheet closes on Escape before submit`, asserting that `onClose` is called.
- [ ] **Step 2: Run it to see it fail.** Run `yarn vitest run src/components/AuthModal.test.tsx`. Expected: the new test FAILS.
- [ ] **Step 3: Implement** the layout above.
- [ ] **Step 4: Run the tests.** Run `yarn test`. Expected: all tests pass.
- [ ] **Step 5: Commit** with the message `feat(ui): auth sheet`.

---

### Task 6: Landing

**Files:**
- Modify: `src/screens/Landing.tsx`, `src/styles/pages.css`, i18n (`landing.hero` = "Find the {spy}" / "找出{spy}", `landing.heroSpy` = "spy!" / "卧底！")
- Test: `src/screens/Landing.test.tsx` (must pass)

**Interfaces:**
- Structure, top to bottom, as in the mockup:
  - `.tape` with `t('app.trust')`;
  - an `<h1>` built from `landing.hero`, with `{spy}` replaced by `<span className="spy">{t('landing.heroSpy')}</span>`, which bobs. Split the string on `{spy}`; do not use `dangerouslySetInnerHTML`;
  - `<p className="muted">{t('landing.tagline')}</p>`;
  - a mascot row of 5 decorative avatars (`aria-hidden`; 🦊 🐸 🕵️ 🐼 🐙 on sky, pink, sun, mint, lilac) that hop with staggered delays;
  - a three-tile grid with the existing three buttons as `.tile` (Daily on sun, Bots on sky, Top on pink), keeping their text and conditions. Streak shows as `🔥 {t('daily.streak')}` with the emoji `aria-hidden`; unseen shows as a badge;
  - the name label and input, the error, Create (`.btn.primary`), "or join with a code", and a row with the code input (`.ticket` letter-spacing) plus Join (`.btn.secondary`).
- The `<h1>` accessible text changes from `Spy Hunt` to "Find the spy!". If any test queries the heading by `Spy Hunt`, point it at the TopBar logo link instead. Run the tests to find out.

- [ ] **Step 1: Implement the layout.**
- [ ] **Step 2: Run the tests.** Run `yarn vitest run src/screens/Landing.test.tsx && yarn test`. Expected: everything passes. Edit only heading-name queries, as noted above.
- [ ] **Step 3: Check it in the browser.** With `yarn dev`, check `/` at 320px and 1280px in English and 中文: no overflow, the tiles stay three across at 320px, and the motion is calm.
- [ ] **Step 4: Commit** with the message `feat(ui): landing`.

---

### Task 7: Room entry, lobby, room errors

**Files:**
- Modify: `src/screens/Room.tsx` (loading, needName), `src/screens/Lobby.tsx`, `src/screens/RoomError.tsx`, `src/components/QrCode.tsx` (wrapper class only), `src/styles/game.css`, i18n (`lobby.emptySeat` = "Empty seat" / "空座位")
- Test: `src/screens/Lobby.test.tsx`, `src/screens/Room.test.tsx` (must pass)

**Interfaces:**
- Room loading: `<main className="screen center"><Loader label={t('room.loading')} /></main>`.
- needName: the code in a big `.ticket`, then the name field and Join (`.btn.primary`), unchanged otherwise.
- Lobby:
  - **Header ticket:** `t('lobby.title')` plus the code in big Fredoka letters, with a Copy pill. Copy feedback uses `<Toast text={copied ? t('lobby.copied') : ''} />`. The button text still changes to `t('lobby.copied')` while copied, so existing tests keep passing.
  - **Players:** in a `.card`, the seat list uses `.stagger` with `--i` set per row. Each row is a PlayerChip plus the Remove button (`.btn.ghost`, small).
  - **Empty seats:** `min_players - players.length` dashed placeholder rows, `aria-hidden`, each showing `t('lobby.emptySeat')`, with the fill or need-more hint after them.
  - **My bot picker:** avatar cards.
  - **QR:** the QR on a white card with a `.tape` corner, then the invite link (`data-testid="invite-link"`, kept).
  - **Host controls:** in a `.card.host-dock` that is `position: sticky; bottom: 0`. It holds the room language segmented control, Add/Remove bot, and a big `Start game` (`.btn.primary`).
  - **Non-host:** `<Loader label={t('lobby.waitingHost')} />`.
- RoomError: `<EmptyState role="alert" emoji={...}>` with emoji per kind: notFound 🔍, started ⏳, full 🪑, network 📡, closed 🚪. Retry (`.btn.primary`) and Home (`.btn`).

- [ ] **Step 1: Implement the screens above.**
- [ ] **Step 2: Run the tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 3: Check it in the browser.** Run `yarn dev` with the backend, open a room, and check the lobby at 320px with 10 players (add bots): the host dock never covers the last player row (add matching padding to the bottom of `.screen` when the dock is present).
- [ ] **Step 4: Commit** with the message `feat(ui): lobby, room entry and room errors`.

---

### Task 8: Table and the flip WordCard

**Files:**
- Modify: `src/screens/WordCard.tsx`, `src/screens/Table.tsx`, `src/styles/game.css`, i18n (`word.secret` = "Top secret" / "绝密", `word.peek` = "Tap to peek" / "点击偷看", `table.thinking` = "{name} is thinking…" / "{name} 正在思考…")
- Test: `src/screens/WordCard.test.tsx` (new), `src/screens/Game.test.tsx` (must pass), `e2e/table-scroll.spec.ts` (must pass)

**Interfaces:**
- `WordCard({ word, compact = false })`
  - Built on `FlipCard`, with `onClick` toggling `shown`, which starts as `true`.
  - `flipped = shown`. Front: `t('word.yourWord')` label, `<span className="word wrap">{word}</span>`, and `👀 t('word.hide')`. Back: 🔒 seal, `t('word.secret')`, `t('word.peek')`.
  - `label = shown ? t('word.hide') : t('word.show')`, as today.
  - A `Sparkles burstKey` increments each time the card turns face up.
  - `compact` uses `size="sm"` (Vote screen).
- Table:
  - Header: a round `.pill` and the LangPicker.
  - Then the WordCard, then the feed (StatementBubbles with an avatar for each speaker, popping in), then `.turnbar` (class kept).
  - The turnbar is sun coloured. It shows the speaker Avatar plus either `t('table.thinking', {name})` with typing dots, or `t('table.yourTurn')`. When it's your turn, the `my-turn` class glows and bounces once.
  - `Countdown total={state.config.turn_seconds}`.
  - The input and Send stay the same, as does the scroll-margin effect.
  - Eliminated players get a ghost note card.
  - `table.speaking` stays in the dictionary. Use `table.thinking` only in the new visual line. If `Game.test.tsx` asserts the speaking text, keep that text present: render `t('table.speaking')` as the line and add the typing dots next to it. Choose whichever leaves the tests unedited.

- [ ] **Step 1: Write the failing tests in `WordCard.test.tsx`.**
  - `starts showing the word and flips to secret`: the button is named `Tap to hide`; after a click it is named `Tap to show your word`, and the front face is `aria-hidden`.
  - `renders nothing without a word`.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/screens/WordCard.test.tsx`. Expected: FAIL (the file is new and the faces don't exist yet).
- [ ] **Step 3: Implement** WordCard and the Table layout.
- [ ] **Step 4: Run the tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 5: Run the table e2e.** Run `BACKEND_DIR=backend yarn e2e e2e/table-scroll.spec.ts`. Expected: PASS (the newest statement stays visible above the taller turnbar).
- [ ] **Step 6: Commit** with the message `feat(ui): flip word card and table`.

---

### Task 9: Vote and Reveal choreography

**Files:**
- Create: `src/game/revealTiming.ts`
- Modify: `src/screens/Vote.tsx`, `src/screens/Reveal.tsx`, `src/styles/game.css`, i18n (`reveal.shrug` = "Nobody is out" / "没有人出局", decorative only)
- Test: `src/game/revealTiming.test.ts` (new), `src/screens/Game.test.tsx` (must pass)

**Interfaces:**
- `revealDelays(voteCount: number): number[]`
  - Returns `voteCount` token delays followed by `[400 /* wobble */, 500 /* stamp then confetti */]`.
  - Each token delay is `min(220, floor(1200 / max(voteCount, 1)))`.
  - The total is always ≤ 2100ms, which leaves 400ms of slack inside the 2500ms budget.
- Reveal uses `const step = useStaged(revealDelays(votes.length))`:
  - token `i` gets `.in` when `step > i`;
  - the eliminated avatar (`Avatar size="l"`) gets `.wob` when `step >= votes.length + 1`;
  - the stamp gets `.on` when `step >= votes.length + 2`, showing `t('role.spy')` or `t('role.civilian')` on a tomato or green stamp;
  - `<Confetti run={step >= votes.length + 2 && r.role === 'spy' && state.me.seat !== r.eliminated} />`.
- **Every text node renders from the first frame.** The steps only add classes. The existing texts (`● N vote(s)` counts, voter names, abstained list, tie line, `reveal.out`) stay as they are, so `Game.test.tsx` passes unedited. The tokens are extra `aria-hidden` voter avatars per row.
- Tie or nobody-out: a 🤷 EmptyState-style disc next to the existing text.
- Vote:
  - Header: the title and `Countdown total={state.config.vote_seconds}`.
  - `<WordCard compact />`, then StatementHistory in a `<details>`, open by default, with the summary `t('vote.statements')`. The existing `aria-label` on the section stays.
  - Targets: `.targets` is a 2-column grid of `button.target` cards (Avatar size `m`, plus the name with `.wrap`). The `target` class is kept for e2e.
  - Clicking a target adds a `stamped` class to it. The locked state shows a ✓ sticker on the picked card and fades the rest.
  - Abstain is `.btn.ghost`. The out, tied and locked notes are note cards.

- [ ] **Step 1: Write the failing tests in `revealTiming.test.ts`.**
  - `one vote`: `revealDelays(1)` equals `[220, 400, 500]`.
  - `nine votes fit the budget`: the sum of `revealDelays(9)` is ≤ 2500 and the length is 11.
  - `zero votes`: `revealDelays(0)` equals `[400, 500]`.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/game/revealTiming.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `revealTiming.ts`, Reveal and Vote.
- [ ] **Step 4: Run the tests.** Run `yarn test`. Expected: everything passes, including the unedited `reveal vote grouping` tests.
- [ ] **Step 5: Commit** with the message `feat(ui): vote cards and reveal choreography`.

---

### Task 10: Result

**Files:**
- Modify: `src/screens/Result.tsx`, `src/styles/game.css`, i18n (`result.sideCivilians` = "Civilians win" / "平民获胜", `result.sideSpies` = "Spies win" / "卧底获胜")
- Test: `src/screens/Result.test.tsx` (must pass; add tests)

**Interfaces:**
- **Banner:** `<p className="center big result-banner">{t(`result.${info.outcome}`)}</p>` (the text is unchanged). Under it, when `state.winner` is set, a small line shows `t(state.winner === 'spies' ? 'result.sideSpies' : 'result.sideCivilians')`. A won banner gets confetti (`<Confetti run={info.outcome === 'won'} />`); a lost banner gets the `droop` class (a slow tilt down and desaturate).
- **Words panel** (`data-testid="words-panel"`, kept): two `FlipCard`s side by side (civilian, then spy), with `flipped` driven by `useStaged([300, 250])`. Card *n* is flipped once `step > n`. Each front shows `t('role.<r>')` plus the joined words (same join as today, `.wrap`). The back shows `?`.
- **Spy panel** (`data-testid="spy-panel"`): a "wanted poster" card (paper, tape corners, tomato title). The content is unchanged.
- **Everyone:** an avatar list with role stamps (`.role.spy` / `.role.civilian` classes kept) and `.stagger`.
- **Share preview** (`data-testid="share-preview"`, a `<pre>`, kept): styled as a torn ticket (a jagged bottom edge via `mask`). Share is `.btn`, Rematch is `.btn.primary`, Home is a `.btn` Link, and share status uses `Toast`.

- [ ] **Step 1: Write the failing tests in `Result.test.tsx`.**
  - `shows which side won under the personal line`: with winner `spies` and me a civilian, `You lost` and `Spies win` are both present.
  - `words are readable from the first render`: the words-panel text contains both words immediately, with no timers advanced. The faces are only visually hidden, so query the text with `{ hidden: true }` if needed, or assert `textContent`.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/screens/Result.test.tsx`. Expected: FAIL (the side line is missing).
- [ ] **Step 3: Implement** the Result layout.
- [ ] **Step 4: Run the tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 5: Commit** with the message `feat(ui): result screen`.

---

### Task 11: Daily puzzle (all states)

**Files:**
- Modify: `src/screens/Daily.tsx`, `DailyPlay.tsx`, `DailyWord.tsx`, `DailyResult.tsx`, `src/styles/pages.css`
- Test: `src/screens/Daily.test.tsx`, `e2e/daily.spec.ts` (must pass)

**Interfaces:**
- **Daily:**
  - loading is `Loader label={t('daily.loading')}`;
  - no puzzle is an `EmptyState` with emoji 😴 and title `t('daily.noPuzzle')`, plus a Home button;
  - error is an `EmptyState` with `role="alert"` and emoji 🙈, plus Retry.
- **DailyPlay:**
  - header: the number, plus the difficulty `.pill`;
  - the civilian word on a flipped-open `FlipCard` with no `onClick` (`flipped`, front text `t('daily.civilianWord', ...)`);
  - the intro, then the transcript bubbles grouped by round under round `.pill`s;
  - tries left: the existing text `t('daily.triesLeft')`, plus `aria-hidden` hearts (❤️ × `tries_left`, 🤍 for the ones used, out of 2);
  - player buttons as `button.target` avatar-less cards in a 2-column grid. A wrong guess plays `shake` once, then shows an ✕ sticker. Wrong ones stay disabled, as today.
- **DailyWord:** option cards as `button.target` and a Skip `.btn.ghost`.
- **DailyResult:**
  - a found or missed banner, with confetti if solved;
  - the "spy was" card;
  - a stats trio of tiles (score, time, tries) with the existing labels;
  - solved % and player count;
  - the streak shown as `🔥` plus the text;
  - the share ticket (`data-testid="share-preview"`), then Share, then the two follow-up buttons. Share status uses `Toast`.

- [ ] **Step 1: Implement the four screens above.**
- [ ] **Step 2: Run the unit tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 3: Run the daily e2e.** Run `BACKEND_DIR=backend yarn e2e e2e/daily.spec.ts`. Expected: PASS.
- [ ] **Step 4: Commit** with the message `feat(ui): daily puzzle`.

---

### Task 12: Bots: trading cards, recaps, form, bot page

**Files:**
- Modify: `src/bots/BotCardView.tsx`, `RecapList.tsx`, `BotForm.tsx`, `src/screens/Bots.tsx`, `src/screens/BotPage.tsx`, `src/styles/pages.css`
- Test: `src/bots/*.test.tsx`, `src/screens/Bots.test.tsx`, `src/screens/BotPage.test.tsx`, `e2e/bots.spec.ts` (all must pass)

**Interfaces:**
- **BotCardView** (`data-testid="bot-card"`, kept): a trading card.
  - Top band in the avatar colour, holding `Avatar size="l"`. Under it, the name in Fredoka, then the remix-of link and the remixes count.
  - Voice, style and quirk as icon rows (🗣️ 🎨 ✨ `aria-hidden`), keeping the `bots.line` text.
  - Rules as `when → do` chips (keeping the `bots.rules.line` text).
  - Record and arena record as stat badges (same text).
- **RecapList:** keeps the `.recap` / `.recap-new` classes. Each recap is a small story card; a new one shows a glowing dot. The list uses `.stagger`.
- **Bots:**
  - the `.bot-item` wrapper is kept;
  - Edit is `.btn`; Delete is `.btn`, and becomes `.btn.primary` while confirming (the text is unchanged);
  - New bot is `.btn.primary`;
  - loading uses Loader, and an error uses an `EmptyState` with retry.
- **BotForm:** one `.card` divided into sections.
  - Emoji picker: `.picker` with round chips.
  - Colour swatches: blobs, with a ✓ on the one where `aria-checked=true`.
  - Voice, style and quirk: chip groups (`.picker .chip`). A selected chip bounces once.
  - Rule rows: `.rule-row` with styled selects.
  - Listed and Arena: `.toggle` (the checkbox semantics are unchanged).
  - The live preview `BotCardView` sits in a "preview" frame.
  - Save is `.btn.primary`; Cancel is `.btn.ghost`.
- **BotPage:**
  - loading uses Loader; not found or error uses an `EmptyState` (🤖❓);
  - the card floats gently (an idle loop, allowed here);
  - Copy link shows its status via `Toast`;
  - Remix is `.btn.primary`; the other links are `.btn`.

- [ ] **Step 1: Implement the components and screens above.**
- [ ] **Step 2: Run the unit tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 3: Run the bots e2e.** Run `BACKEND_DIR=backend yarn e2e e2e/bots.spec.ts`. Expected: PASS.
- [ ] **Step 4: Commit** with the message `feat(ui): bots, bot form and bot page`.

---

### Task 13: Top and Match page

**Files:**
- Modify: `src/screens/Top.tsx`, `src/screens/MatchPage.tsx`, `src/styles/pages.css`
- Test: `src/screens/Top.test.tsx`, `src/screens/MatchPage.test.tsx` (must pass)

**Interfaces:**
- **Top:**
  - the tablist becomes `.segmented` (roles unchanged), followed by the hint;
  - rows sit in a `.card` list with `.stagger`. The rank is a medal disc: ranks 1–3 are gold `#f6c445`, silver `#cfd6dc` and bronze `#d99a5b`, and the rest are paper. Each row shows the Avatar, the name and stats (`.wrap`) and an Open `.btn` (small);
  - loading, error and empty states use Loader and EmptyState (🏆 for empty).
- **MatchPage:**
  - loading, not found and error use Loader and EmptyState;
  - the title, then a player strip of avatars plus names (bot links kept);
  - per round: a round `.pill`, then each statement as a `StatementBubble`-styled line. Keep the current text format `name: text`, either rendered inside a bubble with a `.who` label or exactly as today if the tests match on that string. Choose whichever keeps the tests unedited;
  - votes as `voter → target` chips (keeping the `arena.match.vote` text), then the tiebreak label and the out line;
  - the final reveal shows role stamps, the words and a winner banner.

- [ ] **Step 1: Implement the two screens above.**
- [ ] **Step 2: Run the tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 3: Commit** with the message `feat(ui): leaderboard and match replay`.

---

### Task 14: Clan (all states)

**Files:**
- Modify: `src/screens/Clan.tsx`, `src/styles/pages.css`, i18n (`clan.signIn` = "Register / log in" / "注册 / 登录", which reuses the `auth.corner` text if it is identical; if so, use `auth.corner` and add no key. `clan.copy` = "Copy code" / "复制邀请码", `clan.copied` = "Copied!" / "已复制！")
- Test: `src/screens/Clan.test.tsx` (must pass; add tests), `e2e/clans.spec.ts` (must pass)

**Interfaces:**
- **Signed out:** an `EmptyState` with emoji 🔒, title `t('clan.title')` and body `t('clan.registerFirst')`, plus a `.btn.primary` that opens `AuthModal` (local `open` state).
- **Loading and error:** Loader, and an `EmptyState` with `role="alert"` plus Retry.
- **NoClan:**
  - the pitch;
  - a Create `.card` with the name input, the hint (`id="clan-name-hint"` kept), a badge picker as `.picker` chips (radiogroup unchanged) and Create `.btn.primary`;
  - a Join `.card` with the code input styled as a `.ticket`, plus Join;
  - an Open clans `.card` list with `.stagger`, keeping the `aria-label`s.
- **Member:**
  - **Crest header:** a big badge (64px, wobbles once on mount) with the name in Fredoka.
  - **Invite ticket:** the code plus a Copy pill using `navigator.clipboard.writeText` and `Toast` (the same pattern as Lobby; swallow clipboard errors), plus the member count.
  - **This-week scoreboard:** own score and rival score as big numbers. Between them sits a tug-of-war bar: the own share is `own / (own + rival)`, and 0.5 when both are 0. It animates its width. Below: time left and the `🔥` streak.
  - **Members:** a list (`data-testid="clan-member"` kept) where the leader has a 👑 tag with the existing text.
  - **History:** each week (`data-testid="clan-week"` kept) as a chip coloured by result (won mint, lost pink, draw sun), with the details.
  - **Leave:** an inline confirm card.

- [ ] **Step 1: Write the failing tests in `Clan.test.tsx`.**
  - `signed-out page opens the auth sheet`: click the button and `getByRole('dialog')` is present.
  - `tug bar splits by score`: with own 30 and rival 10, the bar's own segment has style `width: 75%`.
  - `tug bar is even at 0–0`: the width is 50%.
  - `copy code shows copied`: mock `navigator.clipboard.writeText` to resolve; after a click, `Copied!` is present.
- [ ] **Step 2: Run them to see them fail.** Run `yarn vitest run src/screens/Clan.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** all the Clan states above.
- [ ] **Step 4: Run the unit tests.** Run `yarn test`. Expected: everything passes.
- [ ] **Step 5: Run the clans e2e.** Run `BACKEND_DIR=backend yarn e2e e2e/clans.spec.ts`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(ui): clan screens`.

---

### Task 15: Sweep, screenshot audit and full e2e

**Files:**
- Create: `e2e/visual.spec.ts` (screenshots only, no pixel asserts)
- Modify: whatever the audit finds

**Interfaces:**
- `e2e/visual.spec.ts` visits each route at the 320×640 and 1280×800 viewports, in `en` and `zh-Hans` (set via the LangPicker). Routes and states:
  - `/`, `/daily` (play, word and result), `/bots` (create a bot first), `/bot/:id`, `/top`, `/clan` (signed out, then after registering: no clan, then member);
  - a room through lobby, table, vote, reveal and result, using bots;
  - one run with `page.emulateMedia({ reducedMotion: 'reduce' })`.

  For each, it asserts `document.documentElement.scrollWidth <= window.innerWidth` and saves `test-results/visual/<name>-<vp>-<lang>.png`.

- [ ] **Step 1: Look for leftover old styles.** Run `grep -rn "var(--panel\|var(--accent\|var(--bg)\|#0f1115\|#5b8cff" src`. Expected: no output. Fix any hits.
- [ ] **Step 2: Write `e2e/visual.spec.ts`** as described above.
- [ ] **Step 3: Run it.** Run `BACKEND_DIR=backend yarn e2e e2e/visual.spec.ts`. Expected: PASS (no horizontal overflow anywhere).
- [ ] **Step 4: Look at every screenshot.** Read each PNG and check it against the spec §5 and the mockup: the cartoon style everywhere, no old grey surface, Chinese readable, long names wrapped, and the reduced-motion run showing the complete content. Fix what you find and re-run.
- [ ] **Step 5: Run everything.** Run `yarn test && yarn build && BACKEND_DIR=backend yarn e2e`. Expected: all unit and e2e specs pass.
- [ ] **Step 6: Commit** with the message `test(ui): visual sweep across every screen`.
