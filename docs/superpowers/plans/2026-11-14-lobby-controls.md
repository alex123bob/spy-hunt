# Lobby Controls Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the segmented language switchers with one scalable dropdown, and move room language plus add/remove bot controls into the lobby players card.

**Architecture:** A new `LangMenu` component (button + popup list, closes on outside tap/Esc) replaces `LangPicker` everywhere. A new `AddBotMenu` component renders the dashed add row and its menu. `Lobby.tsx` drops the "Your language" and room-controls sections and composes both into the players card. No backend change.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, Playwright e2e, plain CSS in `src/styles/`.

**Spec:** `docs/superpowers/specs/2026-11-14-lobby-controls-design.md`

## Global Constraints

- Frontend only. Reuse existing endpoints: `POST /rooms/:code/bots` (`{action:'add', bot_id?}` / `{action:'remove', seat?}`), `PATCH /rooms/:code/settings` (`{main_lang}`), `PATCH /me` via `patchMyLang`.
- Room language never touches `preferred_lang` (only the player's own language pick does).
- Remove buttons: min height 44px, text "Remove" with a ✕.
- i18n: every new key exists in both `src/i18n/en.json` and `src/i18n/zh-Hans.json`.
- Menus close on outside pointer-down and on Esc; keyboard reachable; visible focus.
- Language names come from existing keys `lang.<code>` (menu items) and `lang.short.<code>` (top bar button).

## Review Focus

- Host opens add menu in a full room: row is hidden, header shows Full.
- Player owns bots, one already in room: menu shows the "already in" line, no bot rows.
- Player owns no bots and is not host: no add row at all.
- Guest sees room language as plain text, not a button.
- Language menu with one language selected shows a check; Esc closes and returns focus to the button.

---

### Task 1: LangMenu component

**Files:**
- Create: `src/components/LangMenu.tsx`, `src/components/LangMenu.test.tsx`
- Modify: `src/styles/primitives.css` (append `.langmenu*` rules)

**Interfaces:**
- Produces: `export function LangMenu(props: { value: Lang; onChange: (l: Lang) => void; label: string; variant?: 'short' | 'room'; prefix?: string }): JSX.Element`. Renders a button (`aria-haspopup="listbox"`, `aria-expanded`, accessible name = `label`) showing `🌐 {lang.short.<value>} ▾` for `short`, or `{prefix} {lang.<value>} ▾` for `room`. Opens a `role="listbox"` of `LANGS` as `role="option"` items (`aria-selected`, text `lang.<code>`, ✓ on selected). Picking calls `onChange` and closes.

- [ ] **Step 1: Write failing tests** in `LangMenu.test.tsx`: (a) closed by default, button name matches `label`; (b) click opens listbox with options "English" and "简体中文", the current one `aria-selected="true"`; (c) clicking "简体中文" calls `onChange('zh-Hans')` and closes; (d) Esc closes and focus returns to the button; (e) pointerdown outside closes.
- [ ] **Step 2: Run** `npx vitest run src/components/LangMenu.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `LangMenu` in `src/components/LangMenu.tsx` with local `open` state, a ref-based outside-pointerdown listener and Esc keydown listener (attached only while open). Styles: `.langmenu` wrapper `position: relative`; `.langmenu-btn` reuses `.pill` look with `min-height: 44px`; `.langmenu-list` absolutely positioned like `.account-pop`; options min-height 44px; selected option uses `--sun`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/components/LangMenu.* src/styles/primitives.css && git commit -m "feat: add LangMenu dropdown component"`

### Task 2: Use LangMenu in TopBar and Table, delete LangPicker

**Files:**
- Modify: `src/components/TopBar.tsx`, `src/screens/Table.tsx`, `src/styles/primitives.css` (remove `.langpicker.compact` and `.topbar .segmented` rules), `src/styles/game.css` (remove `.segmented.langpicker*` rules), `e2e/visual.spec.ts`
- Delete: `src/components/LangPicker.tsx`
- Test: update `src/components/TopBar.test.tsx` if present, `src/screens/Game.test.tsx`/other tests that click the old radios (find with `grep -rn "radio" src --include=*.test.tsx`)

**Interfaces:**
- Consumes: `LangMenu` from Task 1.

- [ ] **Step 1: Update tests** that pick a language through `radiogroup`/`radio` to open the menu button (name `t('lobby.yourLang')` is being removed, so use new key `lang.menuLabel` = "Language" / "语言") and click the `option`. Keep their existing assertions on `getLang()`, `request` and `patchMyLang`.
- [ ] **Step 2: Run** `npx vitest run`. Expected: those tests FAIL.
- [ ] **Step 3: Replace** `<LangPicker compact …/>` in `TopBar.tsx` and `Table.tsx` with `<LangMenu variant="short" label={t('lang.menuLabel')} …/>`, keeping each file's `pickLang` unchanged. Add `lang.menuLabel` to both json files. Update `e2e/visual.spec.ts` `setLang` to click the menu button then the option.
- [ ] **Step 4: Delete** `LangPicker.tsx` and its CSS; confirm `grep -rn LangPicker src e2e` returns only `Lobby.tsx` (removed in Task 4).
- [ ] **Step 5: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: Lobby tests still fail (fixed in Task 4); all others PASS.
- [ ] **Step 6: Commit** `git commit -am "refactor: top bar and table use LangMenu; remove LangPicker"`

### Task 3: AddBotMenu component

**Files:**
- Create: `src/components/AddBotMenu.tsx`, `src/components/AddBotMenu.test.tsx`
- Modify: `src/styles/game.css` (replace `.bot-picker`/`.bot-btns` rules with `.addbot*` rules)

**Interfaces:**
- Produces: `export function AddBotMenu(props: { isHost: boolean; myBots: BotCard[]; ownBotIn: BotCard | null; onAdd: (botId?: string) => void }): JSX.Element | null`. Returns `null` when `!isHost && myBots.length === 0`. Row button text `t('lobby.addBotRow')`, `aria-expanded`. Menu: if `isHost`, a "Random bot" item calling `onAdd()`; then `myBots` items (`Avatar` + name) calling `onAdd(bot.id)`, or, when `ownBotIn` is set, the text `t('lobby.ownBotIn', { name })` instead of the list. Picking closes the menu. Outside pointerdown and Esc close it.
- `ownBotIn` is the player's bot already seated (so the name can be shown), or `null`.

- [ ] **Step 1: Write failing tests**: (a) host with no bots sees the row and, once opened, only "Random bot"; (b) non-host with no bots renders nothing; (c) non-host with bots lists them, picking one calls `onAdd('b1')` and closes; (d) `ownBotIn` set: shows "Your bot Pixel is already in this room. Remove it to add a different one." and no bot rows; host still sees Random bot; (e) Esc closes.
- [ ] **Step 2: Run** `npx vitest run src/components/AddBotMenu.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component. Dashed row styling: border `2.5px dashed var(--ink)`, min-height 44px, full width; open state solid with `--sun`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/components/AddBotMenu.* src/styles/game.css && git commit -m "feat: add AddBotMenu component"`

### Task 4: Rework Lobby

**Files:**
- Modify: `src/screens/Lobby.tsx`, `src/screens/Lobby.test.tsx`, `src/styles/game.css`, `src/i18n/en.json`, `src/i18n/zh-Hans.json`, `src/i18n/i18n.test.ts`
- Check: `e2e/*.spec.ts` for old lobby labels (`grep -rnE "Add bot|Remove bot|Add my bot|Room language" e2e`)

**Interfaces:**
- Consumes: `LangMenu` (Task 1), `AddBotMenu` (Task 3).

- [ ] **Step 1: Update `Lobby.test.tsx`** to the new behavior, one test each: (a) no "Your language" section; (b) host sees a `Room` language button, picking 简体中文 calls `request('PATCH', '/rooms/ABCD/settings', { main_lang: 'zh-Hans' })`; (c) non-host sees room language as text, no button; (d) header shows Full badge and no add row when `players.length >= max_players`; (e) host add menu → "Random bot" posts `{ action: 'add' }`; (f) my bot item posts `{ action: 'add', bot_id }`; (g) own bot in room shows the "already in" line; (h) player without bots and not host: no add row; (i) each bot seat's Remove posts `{ action: 'remove', seat }`; host sees Remove on every bot, a player only on their own; (j) no "Remove bot" button; (k) Remove buttons have class giving min-height 44px (assert class `remove-btn`). Drop the language-radiogroup tests (the language menu is covered in Task 1/2).
- [ ] **Step 2: Run** `npx vitest run src/screens/Lobby.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Rewrite `Lobby.tsx` JSX**: delete the "Your language" `<section>`, the `room-controls` card, `pickLang`, `WhyButton`, `picking` state and the `bots` count. Players card header = `<div className="cardhead">` with `Players (n/max)` + Full badge, and for the host `<LangMenu variant="room" prefix={t('lobby.roomPrefix')} label={t('lobby.mainLang')} value={state.main_lang} onChange={(l) => call('PATCH','/settings',{ main_lang: l })} />`, for non-hosts a `<span className="roomlang ro">` with `{t('lobby.roomPrefix')} {t(\`lang.${state.main_lang}\`)}`. Seats render as today, with the Remove button `className="btn ghost small remove-btn"` and text `✕ {t('lobby.removeMine')}`. Under the seats, render `<AddBotMenu>` only when `!full`; derive `ownBotIn` from `state.players` and `myBots`. Remove the now-unused `useLang` import only if nothing else uses it (it still triggers re-render on language change, so keep it).
- [ ] **Step 4: i18n**: add `lobby.addBotRow` ("Add a bot" / "添加机器人"), `lobby.randomBot` ("Random bot" / "随机机器人"), `lobby.myBotsHeading` ("Your bots" / "我的机器人"), `lobby.roomPrefix` ("Room" / "房间"), `lobby.fullBadge` ("Full" / "已满"); change `lobby.ownBotIn` to `"Your bot {name} is already in this room. Remove it to add a different one."` (and the zh equivalent). Remove `lobby.addBot`, `lobby.removeBot`, `lobby.addMyBot`, `lobby.yourLang`, `lobby.full` if `grep` shows no remaining use. Add all new keys to the list in `src/i18n/i18n.test.ts`.
- [ ] **Step 5: CSS** in `game.css`: `.cardhead` (flex, space-between, wrap, gap 10px), `.roomlang.ro`, `.remove-btn { min-height: 44px }`, `.full-badge`. Remove dead `.room-controls`/`.bot-btns` rules.
- [ ] **Step 6: Run** `npx vitest run && npx tsc --noEmit && npm run lint --if-present`. Expected: all PASS.
- [ ] **Step 7: Update e2e** specs found by the grep to the new controls, then run `npx playwright test e2e/smoke.spec.ts e2e/bots.spec.ts e2e/visual.spec.ts`. Expected: PASS, no horizontal overflow at 320px.
- [ ] **Step 8: Commit** `git add -A && git commit -m "feat: lobby players card holds room language and bot controls"`

---

## Self-Review notes
- Spec coverage: shared menu (T1), top bar/table/delete LangPicker (T2), add row + menu + own-bot line + host-only random (T3), header with room language/Full, remove "Your language", per-seat Remove ≥44px, drop global Remove bot and controls card (T4).
- Names consistent: `LangMenu`, `AddBotMenu`, `lang.menuLabel`, `lobby.addBotRow`, `lobby.roomPrefix`, `remove-btn`.
- Risk: the Task 4 test list is long; tasks 2 and 4 depend on Task 1's `LangMenu` signature and Task 4 on Task 3's `AddBotMenu` props.
