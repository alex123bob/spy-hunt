# UI Overhaul: Design

Date: 2026-11-12
Status: Draft for owner approval.
Approved look: `.superpowers/brainstorm/98888-1794451145/content/look-and-feel.html` (the "mockup"). The owner said "all looks good" to its three screens. It is the visual source of truth; copy its tokens, shapes and motion.

Tags: **(owner)** = the owner decided. **(call)** = Claude decided; changeable.

## 1. Intent

The app works end to end, but it looks like a prototype: one 99-line dark stylesheet, the system font, identical grey panels, and no motion anywhere. The owner wants an **overhaul of every screen, modal, banner and state** (owner: "every nook and cranny… clans, login, register, and ALL"). The new feel is **cartoon, cute, playful**, with **smooth, comfortable, interesting animation** (owner).

The inspiration is the owner's Figma prototype (cream paper, forest green, tomato red, thick offset shadows, a "TOP SECRET" word card that flips when tapped) mixed with two Dribbble shots: chunky rounded cards, mascots, bouncy kid-game energy. The Figma prototype is a pass-and-play flow on one phone. This app uses one phone per player, so we take its **look and the flip card, not its flow** (call).

Success: someone opening any URL in the app (`/`, `/daily`, `/r/:code` in every phase, `/bots`, `/bot/:id`, `/top`, `/clan`, `/match/:id`, the error pages, the auth modal) sees the same cohesive cartoon world. Nothing is left in the old grey style.

## 2. Goals, non-goals, anti-goals

**Goals**
- A design system (tokens and primitives) replaces `src/styles/global.css`, and every screen is restyled on it.
- Three signature moments, as in the mockup (owner approved):
  1. **Word card:** a 3D flip between a green "TOP SECRET" back and a paper front showing the word, with a sparkle burst when the word appears. Used on Table and Vote.
  2. **Reveal:** vote tokens drop in one by one, the eliminated player's avatar wobbles, a "SPY!" or "CIVILIAN" stamp slams down, and confetti falls if a spy was caught.
  3. **Result:** both words flip face up side by side. Confetti if *this player* won, a gentle droop if they lost.
- **New decorative copy is allowed** (call), added as new keys in both languages next to existing strings, never replacing them: "Trust nobody" (tape), "Find the spy!" (Landing title; the existing tagline stays as the subtitle), "Top secret" / "Tap to peek" (the back of the word card), "{name} is thinking…" (the typing indicator), and similar short labels. The mockup's "See the words →" button on Reveal is **not** built. Reveal keeps moving on by itself, as today.
- Motion everywhere else: press-down buttons, screen enter transitions, list items that pop in with a stagger, a ring countdown timer, a typing indicator for the current speaker, and hopping mascots on Landing.
- Players always see behavior they know: every existing feature, flow, string and API call keeps working exactly as today.

**Non-goals**
- No change to game rules, the backend, the API, routes or the data shape.
- No sound effects (call).
- No dark theme. The cream "paper" world is the brand, and the old dark palette goes away (call).
- No pass-and-play mode.
- No new custom illustrations or image assets. The "mascots" are the existing emoji-on-colour avatars, restyled as chunky outlined discs (call).

**Anti-goals** (failure even if it technically works)
- Motion that slows play down. No animation may block input or hold up a phase change the server has started. Signature sequences must fit inside the existing reveal hold window (see §6).
- Jittery, constant or seasick motion. Idle loops stay small and slow (the mockup's mascot hop and eye glance are the ceiling).
- Losing anything: a broken test, a string not shown in Chinese, a control that is unreachable at 320px wide, or worse accessibility.
- A half-done overhaul where some screen still looks like the old app.

## 3. Constraints

- React 19 + TypeScript + Vite, as today. Keep the existing component and state structure. This is a presentation overhaul, not a rewrite.
- **Mobile first.** Must work at 320px wide with a 16px gutter and no horizontal scroll. On desktop, keep a centred column (max about 520px) on the dotted cream background (call).
- **Bilingual.** English and Simplified Chinese. Font stack: `Fredoka` (display) and `Nunito` (body), with Latin subsets bundled from npm (`@fontsource/fredoka`, `@fontsource/nunito`), not fetched from Google at runtime (call: privacy and offline). **No Chinese font is bundled** (call: a CJK font adds megabytes, which works against "playing in seconds" on a phone). Chinese falls back to the best system font: `'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Noto Sans SC', 'Microsoft YaHei', system-ui`. The friendliness comes from the shapes, colours, weights and motion, not the CJK glyphs. Digits and Latin text inside Chinese UI still render in Fredoka/Nunito. Any new string goes into both `en.json` and `zh-Hans.json`.
- **Rollout.** Build everything on one branch (`ui-overhaul`) and merge it in one go. `main` never shows a mixed look, and the old stylesheet is deleted, not kept beside the new one (call).
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, all decorative motion stops. Flips become instant swaps or short crossfades, confetti and sparkles are skipped, and stamps just appear. Content and timing are otherwise unchanged.
- **No heavy dependencies.** CSS keyframes and transitions plus small React hooks only. No animation library (call; the mockup proves CSS is enough). Confetti and sparkles are a tiny in-house component.
- **Tests stay green.** Unit tests (Vitest) and e2e tests (Playwright) must pass. Tests may be edited only where the layout legitimately changes (for example, opening the account menu before clicking Log out), never to weaken what they check about behaviour (call). They rely on roles, accessible names, text, `data-testid`s, and these classes, which must survive: `.turnbar`, `.recap-new`, `span.avatar`, `.wrap`, `.bot-item`. The word card's accessible name keeps toggling between `word.hide` and `word.show`. In jsdom, animations must not delay or hide content (animated content is present in the DOM at once; motion is CSS only).
- Accessibility: tap targets of at least 44px, visible focus rings (a thick ink outline matching the style), text contrast of at least AA on cream and on coloured tiles, and the existing aria roles kept.

## 4. Visual system (from the mockup)

**Tokens** (CSS custom properties on `:root`):
- Colours: cream background `#f6ecd9`, paper `#fffaf0`, ink `#1d3b33`, forest green `#1f4a3f`, tomato `#e5533d`. Accents: sun `#f6c445`, sky `#8fd3e8`, pink `#f7a8b8`, mint `#9fe0b5`, lilac `#d9c4f2`. Semantic aliases: danger is tomato, ok is a deeper mint-green that reads on cream (builder picks it, AA contrast).
- Lines: 2–3px ink borders on every interactive surface.
- Shadows: hard offset with no blur (`0 5px 0 ink` for buttons and tiles, `6px 6px 0 ink` for hero cards).
- Radius: 16–24px on cards, 999px on pills.
- Background: cream with a faint ink dot grid.
- Type: Fredoka 600/700 for headings, numbers, buttons and pills. Nunito 500/700/800 for body text. Small caps-style labels use letter spacing (as in "YOUR WORD").

**Primitives** (CSS classes; small components only where behaviour needs them):
- Buttons: `primary` (tomato), `secondary` (forest green), default (paper), `ghost` (dashed outline). All press down on tap: they lift on hover, sink on press, and spring back.
- Card or panel (paper, ink border, offset shadow), tile (coloured, slight tilt on hover), pill or chip, tag (small rounded label), tape label (the yellow, slightly rotated "TRUST NOBODY" strip).
- Inputs: paper fill, thick ink border, focus ring. Select and checkbox styled to match: the checkbox becomes a chunky toggle; selects get a rounded box with a custom arrow.
- Tabs and segmented control (language picker, Register/Log in, Top's Winners/Spies): a sliding highlight pill.
- Modal: a paper sheet with a spring pop-in over a dimmed, slightly blurred backdrop. On phones it slides up from the bottom (call).
- Toast or status line for "Copied!", "Shared" and similar: a small pop-in pill.
- Avatar: an emoji on a colour disc with an ink border and an offset shadow, in sizes S, M and L. An eliminated player is greyed with a little "✕" sticker. The bot marker is a tiny 🤖 tag.
- Countdown: a ring timer (a conic fill drains as time runs out). At 5 seconds or less it turns tomato and pulses. It keeps `role="timer"` and the numeric text.
- Speech bubble: paper, ink border, tail. Mine is mint, the host's is sun with a dashed border, and "ran out of time" is a faded italic line. A translation sits under a dotted divider with a 🌐 mark.
- Loading: a bouncing three-dot loader with a peeking eye-logo, used for every "Loading…" state (keep the text for screen readers). Errors and empty states: a friendly emoji spot illustration, a heading, a body line and the action.

## 5. Every surface

Each bullet must be built in the new style. "Keeps" means behaviour and content stay as they are.

**Global chrome**
- **TopBar:** the eye logo (the pupil glances, as in the mockup) plus "Spy Hunt", linking home. On the right: the language segmented control, plus either "Register / log in" (a pill) or, when signed in, a Clan pill and an account menu showing the email and Log out (a small popover) (call: the email no longer squeezes the bar; `TopBar.test.tsx` and `e2e/accounts.spec.ts` gain an "open menu" step). Keeps every action.
- **NudgeBanner:** a sun-yellow sticky note with a slight tilt that slides in from the top, with a ✕ that spins away on dismiss.
- **Reconnecting banner:** a tomato pill pinned at the top with a pulsing wifi or dots icon.
- **Screen transitions:** each route, and each room phase change (lobby → table → vote → reveal → result), plays a short enter animation (fade and rise, about 250ms). There is no exit animation that could delay a switch (call).

**Landing (`/`)**: as in the mockup. Tape label, the "Find the spy!" title with a bobbing "spy!", a hopping mascot row, three tiles (Daily with the streak 🔥 and a done or play state; My bots with an "N new" badge; Top), a name input, Create room (tomato), "or join with a code", and a code input plus Join (green). Keeps every behaviour, including showing nothing until the daily status is known.

**Auth modal (register / log in)**: a bottom sheet with the tabs as a sliding segmented control, a mascot peeking over the sheet's top edge, register pitch and note copy, chunky inputs, an inline error that shakes once, and a success state ("Signed in") with a check mark that pops before the reload.

**Room: name prompt (needName)**: a big room code on a paper "ticket", the name input, and Join.

**Lobby**: the room code as a big "case file" ticket with Copy (a "Copied!" toast). The QR code sits on a white card with a tape corner. Players appear as a seat grid or list of avatar cards that pop in as players join, with You, Host and Bot tags and the clan badge. Empty seats up to the minimum show as dashed placeholders, and the fill hint sits beside them. The "Add my bot" picker uses avatar cards. Host controls (room language, Add/Remove bot, Start game) sit in a sticky bottom area with a big tomato Start. Non-host players see "Waiting for the host…" with a bouncing loader. Keeps every action and condition.

**Table**: as in the mockup. The round pill, the language picker, the flip **WordCard** (starts on the face showing the word, as today; tapping flips it), a speech-bubble feed that pops in, and a sun-yellow `.turnbar` with the speaker avatar, a typing indicator, the ring countdown, the input and Send. "Your turn" makes the bar glow and bounce once. An eliminated player gets a soft ghost "You're out, keep watching" note. Keeps the scroll-into-view-above-the-bar logic.

**Vote**: the title and ring timer, a compact WordCard, collapsible statement history, and target players as big avatar cards in a grid. Tapping one plays a "stamp" press, then shows the "Vote locked in" state: the chosen card gets a tomato ✓ sticker and the others fade. Abstain is a ghost button. The revote, tied and out states each get a friendly note card.

**Reveal**: as in the mockup. Vote tokens (voter avatars) drop onto each target row in sequence, then the eliminated player's large avatar wobbles, then the role stamp lands, then confetti if a spy was caught. The caught spy's own phone gets no confetti, just the stamp (call). A tie or "nobody out" result gets a shrug illustration (🤷 on a disc) and the tied names. The countdown pill stays visible. The sequence must finish within the available hold time (§6).

**Result**: a big personal banner, keeping today's `result.won` / `result.lost` / `result.ended` text ("You won!" …), with a smaller line underneath saying which side won (call). Confetti if this player won, a droop if they lost. Two **word cards flip face up** side by side (civilian word and spy word, both languages, as `words-panel` shows today). The spy panel (`data-testid="spy-panel"`) is a "wanted poster" style card. Everyone's roles appear as an avatar list with role stamps, then the rounds count, a share preview (`share-preview`) styled as a torn ticket, Share, Rematch (host) or waiting (others), and Home.

**Room errors** (not found, started, full, network, closed): a spot illustration per kind, a heading, body text, Retry (network) and Home.

**Daily (`/daily`)**: loading, no-puzzle ("come back soon" with a sleeping mascot) and error states. **DailyPlay:** a header with the puzzle number and a difficulty pill, the civilian word on a flipped-open word card, an intro, the transcript in bubbles grouped by round, tries left as hearts (2 → 1), and player cards to tap. A wrong guess shakes the card and stamps an ✕. **DailyWord:** option cards and a Skip ghost button. **DailyResult:** a found or missed banner, a "the spy was…" reveal card, a stats trio (score, time, tries) as tiles, solved % and player count, a streak flame, a share ticket, Share, and the two follow-up buttons.

**Bots (`/bots`)**: recaps (`RecapList`) as a stack of small story cards, with new ones marked by `.recap-new` and a glowing dot. Each `.bot-item` is a **trading card** (`BotCardView`): the avatar large at the top, the name, voice, style and quirk as icon rows, rules as little "when → do" chips, and the record as small stat badges. Edit and Delete sit below, and Delete turns into a tomato "Sure?" confirm. Then "New bot" (disabled at 3, with the limit note) and the remix banners.

**BotForm (create, edit, remix)**: one card with sections: a name input, an emoji picker as a grid of chunky round chips, colour swatches as blobs with a ✓ on the selected one, voice, style and quirk as chip groups, and rule rows as two styled selects plus a remove button, with "Add rule". "Listed" and "Arena" are toggles. A **live preview trading card** mirrors the draft. Save and Cancel. Selecting a chip gives a small bounce. Keeps every validation (duplicates, limits, name required).

**Bot page (`/bot/:id`)**: a large trading card centred with a gentle float, then Copy link (toast), Remix or the limit note, Edit (if mine), Top and Home. Loading, not-found and error states.

**Top (`/top`)**: a Winners/Spies segmented control, the hint, and a leaderboard where ranks 1–3 get gold, silver and bronze medal discs. Rows pop in with a stagger and each opens its bot. Loading, error and empty states.

**Clan (`/clan`)**:
- *Signed out:* a friendly lock illustration, the "register first" copy, and a button that opens the auth modal (call: today it is text only; the button is an addition, so the behaviour stays the same plus a shortcut).
- *No clan:* the pitch, then three cards. **Create:** name input, hint and name-rule error, a badge picker of chunky chips, Create. **Join by code:** a code input styled as a ticket, Join. **Open clans:** a list with the badge, name and member count, plus Join.
- *Member:* a big clan crest header (badge, name), an invite-code ticket with Copy (call: a small addition using the same copy-toast pattern as Lobby), and the member count. A **this-week scoreboard** shows our score vs the rival as two big Fredoka numbers with a tug-of-war bar between them, the time left, and the streak flame. Members appear as a list with the leader crown and points. History is shown as 8 week chips (W/L/D coloured) with the details. Leave → an inline confirm.
- Loading and error states.

**Match page (`/match/:id`)**: a replay transcript. The player strip shows avatars, and round sections hold speech bubbles, then vote lines as "A → B" chips, the tiebreak label, and the out line. The final reveal shows roles as stamps, the words, and a winner banner. Loading, not-found and error states.

## 6. Motion rules

- Easing: one springy curve for UI feedback (`cubic-bezier(.34,1.45,.5,1)` or similar) and an ease-out for entrances. Durations: feedback 120–180ms, entrances 250–450ms, flips about 700ms.
- List staggers are capped (for example 40ms per item, at most about 400ms in total) so long lists don't trickle.
- Idle loops (the logo eye, the mascot hop, the "spy!" bob, the floating bot card) only on Landing, the logo and the Bot page. Never on in-game screens except the typing dots and the urgent timer pulse.
- **Reveal and Result sequencing:** the reveal screen is shown while `useHeldScreen` holds it, and the server's reveal phase has a deadline. The choreography (token drops → wobble → stamp → confetti) must finish within about 2.5s, and it scales token delays down when there are many votes. A new snapshot that moves the screen on must never wait for the animation.
- Performance: animate only `transform` and `opacity` (plus the conic timer ring). Confetti uses at most about 40 pieces and cleans itself up.
- Reduced motion: see §3.

## 7. What's left to the builder

- Exact component split (for example `FlipCard`, `Confetti`, `Sparkles`, `RingTimer`, `Sheet`, `Toast`, `EmptyState`), the file layout of the new CSS (one file or split by area), and class names, apart from the preserved ones in §3.
- Exact illustration emoji per empty or error state, pixel spacing, and any extra micro-interactions that follow §6.
- Order of work. Suggested: tokens and primitives first, then global chrome, then the room flow, then everything else, checking at 320px and in both languages.
- Update `index.html` `theme-color` to cream.
