# Room polish: zoom bug, bot link, bot variety, add-bot discoverability, share redesign

## Intent

Five small-to-medium fixes that landed together because they were all noticed in the
same round of real play: mobile Safari sticks at a zoomed-in level after an input
loses focus; a bot's profile link breaks once the app is served from `/spy-hunt/`
instead of domain root; random bots all sound equally "safe" regardless of persona;
a first-time host (a friend of the project owner) couldn't find the add-bot control;
and the lobby's invite UI repeats itself (link+code at the top, QR at the bottom)
instead of offering one concise, shareable moment. None of these need each other,
but all five are small enough to ship in one pass.

## Goals

- Fix the zoom-stuck-after-blur bug using the same technique already proven in a
  sibling project (`advanced-english-dictionary`), not a blanket viewport hack.
- Fix the bot-profile link so it resolves correctly under the production base path
  (`/spy-hunt/`), the same way every other in-app link already does.
- Give random bots per-bot personality-consistent variety in LLM temperature, so
  games feel less uniform without any one bot flip-flopping between turns.
- Make the "add a bot" control impossible to miss for a first-time host, without
  adding a tutorial/onboarding system.
- Replace the lobby's duplicated link/QR sections with one concise header offering
  a native share (polished image) and a QR popup, reusing the app's existing
  share-card visual system.

## Non-goals

- No onboarding tour, tooltip campaign, or persistent coachmark system for bot
  discovery (goal is a self-evident control, not a guided tour).
- No backend schema/DB changes for bot temperature — it's derived at call time.
- No changes to room language controls, bot removal, or anything else already
  settled by the 2026-11-14 lobby-controls redesign.
- No changes to the Daily or Result share cards' own content or visuals — only a
  new room-invite card variant is added, reusing their drawing code.
- No blanket disabling of pinch-zoom (`maximum-scale=1`/`user-scalable=no`)
  site-wide; that would fix the symptom for everyone at the cost of an
  accessibility feature nobody asked to remove.

## Anti-goals

(Things that would make this a failure even if it technically ships)

- Random bots that feel randomly *broken* (wildly inconsistent turn-to-turn) rather
  than randomly *characterful* (consistently a bit wilder or safer, bot to bot).
- An invite flow whose primary action is still a bare text link, when the user's
  explicit ask was "never too much" polish because it drives new players in.
- Solving add-bot discoverability with a one-time tip that a player taps through
  and forgets — the next new host would be exactly as stuck.

## Constraints

- Frontend (`spy-hunt`) and backend (`PP-AI-Service/ai_svc/spy_hunt`) are separate
  repos; items 1, 2, 4, 5 are frontend-only, item 3 is backend-only.
- Production is served at `https://lijialab.com/spy-hunt/` via `VITE_BASE_PATH`;
  every link must go through the existing `basename`/`import.meta.env.BASE_URL`
  convention, not a hardcoded absolute path.
- Bot replies go through `llm.call_json` in JSON mode against DeepSeek; any new
  temperature value must stay in a range that doesn't materially raise JSON-mode
  parse failures (the call already retries once on bad JSON, but shouldn't need to
  lean on that retry more than today).
- No DB migration appetite: bot temperature must be derivable from data already on
  the `players` row (`player_id`, assigned once when the bot joins and stable for
  that game).

## Approaches

### 1. Mobile zoom stuck after input blur

All inputs already use ≥16px font (the classic "iOS auto-zooms a small input on
focus" cause), so that wasn't it. Checked `advanced-english-dictionary`, which
hit the identical symptom and fixed it with an explicit `inputRef.blur()` call
right after the input's action completes, rather than relying on the browser's own
focus loss to also reset zoom (per that commit's own note: *"mobile browsers [keep]
the input focused (and maintaining zoom)"* through an async UI update).

- **A (chosen):** add an explicit `.blur()` call on the relevant input right after
  its primary action fires, matching the proven fix.
- **B:** force `maximum-scale=1, user-scalable=no` in the viewport meta tag.
  Rejected — kills pinch-zoom for everyone, fixes the symptom everywhere whether or
  not it's actually happening, and the user didn't ask to remove zoom.
- **C:** raise input font-size further. Already ruled out — every input is already
  at or above the 16px threshold that prevents auto-zoom-on-focus; the bug here is
  the zoom sticking after blur, not triggering on focus.

### 2. Bot profile link breaks under `/spy-hunt/`

Found the exact bug: `src/components/PlayerChip.tsx:11` is the one place in the
app that builds a bot link as a raw absolute path (`href={\`/bot/${id}\`}`)
instead of going through routing. Everywhere else (`BotCardView.tsx`,
`MatchPage.tsx`, etc.) uses React Router's `<Link>`, which respects the
`basename={import.meta.env.BASE_URL}` set in `App.tsx`. In dev (`BASE_URL=/`)
the bug is invisible; under the `/spy-hunt/` deploy it sends players to the
domain root.

- **A (chosen):** swap the raw `<a>` for `<Link to={\`/bot/${id}\`} target="_blank" rel="noopener">`,
  identical pattern to every other bot link in the app. `target="_blank"` is kept
  so tapping a bot's name from inside a live room doesn't navigate the room away
  from its SSE connection.
- **B:** manually prepend `import.meta.env.BASE_URL` to the href string, the way
  `Lobby.tsx` does for the invite link. Rejected in favor of A — `Link` is what
  every *other* bot-name link in the app already uses, so A is both less code and
  more consistent.

### 3. Random bot temperature variety

Right now `llm.py`'s `_transport()` never passes `temperature` at all — every bot
call (any persona) uses DeepSeek's own default. There's no existing "flat setting"
to loosen; this introduces temperature control for the first time, scoped to
non-custom ("random") bot personas only — custom bots are a player's own deliberate
creation and keep their current, unmodified behavior.

- **A (chosen):** derive each random bot's temperature deterministically from a
  hash of its `player_id` (assigned once when the bot joins, stable for that
  whole game), mapped into a moderate range (proposed `0.6`–`1.2`). Applied only
  to that bot's `"bot"`-task statement/vote calls.
- **B:** re-roll temperature randomly on every call. Rejected — the same bot would
  swing from cautious to erratic turn to turn, which reads as inconsistent or
  buggy rather than characterful, and undercuts the "friend casually playing"
  experience this is meant to improve.
- **C:** one fixed, slightly higher temperature for all bots. Rejected — doesn't
  deliver the "games feel less uniform" goal; every room would just be uniformly
  "a bit wilder" instead of varied bot to bot.

### 4. Add-bot discoverability

Today it's a dashed, low-contrast "+ Add a bot ▾" row (`AddBotMenu`/`addbot-row`)
placed below the seat list — exactly the kind of secondary-looking control a new
host's eyes skip past, which is what happened to the project owner's friend.

- **A (chosen):** the *first* empty seat tile itself becomes the "+ Add a bot"
  call-to-action — filled, high-contrast, right where a host's eyes already go
  when scanning who's missing. Tapping it opens the existing add-bot menu
  (random/own bots), same visibility rules as today (host-only sees "Random bot";
  players only see it if they have unseated bots). Remaining empty seats (if any)
  stay plain "Empty seat" placeholders, unchanged. The old dashed row is removed —
  one entry point, not two.
- **B:** a one-time coachmark (reusing `Bubble`/`TapTip`) pointing at the existing
  row on first lobby visit. Rejected — a dismissed tip is forgotten, and doesn't
  fix *why* it was missed (low visual weight, buried below a hint paragraph); the
  next new host hits the same wall.
- **C:** a prominent dedicated button elsewhere (e.g. near the header). Rejected —
  competes for attention with Start/Invite and is disconnected from the seat grid
  the host is already looking at to see who's missing.

### 5. Lobby share/invite redesign

Today's lobby has a header with code + "Copy link" pill, and a separate card
lower down repeating the same link as text plus an always-visible QR code —
duplicate functionality, extra scroll, no social share hook.

- **A (chosen):** consolidate into the header: a primary **Invite** button that
  triggers the native share sheet (iOS Messages/WeChat/etc., matching the pattern
  already used for the Daily and Result share cards) with a newly-generated,
  polished image card for the room invite — plus a small **QR icon** button that
  opens the existing `Sheet` modal with the QR code, the raw link, and a copy
  button, for in-person scanning or desktop use. The bottom card is removed
  entirely.
- **B:** keep the QR always visible but move it next to the header, just dropping
  the duplicate link text. Rejected — still costs permanent vertical space for
  something most players use once per room, and doesn't address the user's
  explicit ask to remove the bottom section.
- **C:** QR only via a long-press/tap on the room code itself, no visible icon.
  Rejected — same discoverability problem as item 4: no visible affordance means
  no one finds it.

## Decisions made (my calls, flagged for visibility)

- **Temperature mechanism:** deterministic per-bot (via `player_id` hash), not
  re-rolled per call — picked because a wildly inconsistent bot reads as broken,
  not characterful (see Approach 3, anti-goals).
- **Temperature range:** proposed `0.6`–`1.2`. This is a starting number, not a
  hard requirement — tune down if live testing shows more JSON-mode retries.
- **Share image:** per the user's explicit "never too much when it comes to
  sharing" — a polished PNG card, not just link text, reusing the existing
  `drawCard`/`ShareCardModel`/`shareCard()` machinery from `daily/share.ts`
  (same visual system as the Daily and Result cards) via a new, lobby-specific
  `ShareCardModel` (title "Spy Hunt", room code, player count, "Scan to join"),
  rather than writing a new canvas-drawing function from scratch.
- **Invite button behavior:** always attempts `shareCard()` (native share with
  image, falling back to clipboard+toast on unsupported browsers, exactly as
  `shareResult`/`shareCard` already behave elsewhere). The QR icon is a *separate,
  always-available* action (not conditional on share support) so desktop users at
  a shared screen can still offer a scannable QR without relying on native share.
- **Header button count (confirmed by user):** two buttons, not three — Invite
  and the QR icon. The existing standalone "Copy link" pill (`Lobby.tsx:73`) is
  removed; copying the link lives only inside the QR popup, next to the QR code
  itself. The header stays uncluttered and there's no duplicate copy affordance.
- **Add-bot CTA tile visibility (confirmed by builder check, settled here):** the
  first empty seat shows the CTA look (filled, high-contrast "+ Add a bot") only
  for whoever would actually see a non-empty `AddBotMenu` today — i.e. the host,
  or a player with an unseated bot of their own. For any other player (a guest
  with no bots, viewing a room with open seats), that first empty seat renders as
  today's plain "Empty seat" placeholder, same as the rest. This is a straight
  relocation of `AddBotMenu`'s existing visibility rule (`isHost || myBots.length
  > 0`) onto the first empty-seat tile, not a new rule — nobody who couldn't open
  the menu before gets a CTA that does nothing now.
- **Temperature verification (settled here):** no new metric or dashboard. Launch
  with `0.6`–`1.2` and lean on the existing `log.info("llm call task=%s ...
  result=%s", ...)` lines already in `llm.py` — a spot-check of logs after
  deploy is enough to catch a rise in `ValidationError`/retry outcomes. If that's
  ever not enough signal, that's a follow-up, not part of this change.
- **Blur timing (settled here):** fire `.blur()` unconditionally the moment the
  primary action is dispatched (e.g. right when `send()`/`submit()` starts, not
  gated on success), matching the dictionary app's fix exactly — it blurred right
  after *initiating* the search, before the try/catch resolved either way. A
  failed submit (e.g. a validation error) still leaves the input's value and
  error message visible for the user to fix; it just won't still be focused, so
  it doesn't carry the zoom bug. The user can tap back in to retry.

## Left to the builder

- Exact set of inputs to apply the `.blur()` fix to. Primary candidates, by
  screen: `Table.tsx` (statement input, on send), `Landing.tsx` (name field on
  create, code field on join), `Room.tsx` (needName input, on submit),
  `Clan.tsx` (name/code inputs, on their form submits), `AuthModal.tsx`
  (email/password, on submit). Fires unconditionally on action dispatch (see
  decisions above). Verify on an actual iOS device if possible.
- `Lobby.tsx`'s existing `copy()`/`copied`/`copyTimer` state (today wired to the
  header pill) moves to live inside the new QR `Sheet`, since that pill is
  removed — the copy button there reuses the same clipboard-write-plus-toast
  logic, just relocated.
- Exact temperature bounds and whether they need per-task tuning (statement vs.
  vote) — start with the proposed `0.6`–`1.2` and adjust from observed behavior.
- CSS/spacing for the new empty-seat CTA tile and the header's Invite/QR buttons;
  aria-labels; new i18n keys (en + zh-Hans) — reuse `lobby.invite`, `lobby.copy`,
  `lobby.copied`, `lobby.link` where they already fit.
- Exact tile content for the new room-invite `ShareCardModel` (e.g. players
  "x/max" vs. just the code) — keep it consistent with the existing Daily/Result
  card's visual rhythm.
- Updating `Lobby.test.tsx`, `AddBotMenu.test.tsx`, and any e2e specs
  (`bots.spec.ts`, `smoke.spec.ts`) that assert on the old dashed row, the old
  bottom QR card, or the old header "Copy link" pill — all of which move or
  disappear.
- `call_json`'s new optional `temperature` parameter should default to `None`
  (today's behavior) everywhere else — translation, host, puzzle generation are
  unaffected by this change and must stay exactly as they are.
