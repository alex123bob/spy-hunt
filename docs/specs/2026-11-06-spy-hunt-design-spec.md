# Spy Hunt: Design Spec

Date: 2026-11-06
Status: Draft for owner approval. No changes to PP-AI-Service until approved.
Source: `docs/brainstorm/2026-11-06-brainstorm-record.md` (the "brainstorm"). Section numbers like "B§7a" refer to it.
Companion: `2026-11-06-spy-hunt-implementation-spec.md` (the "implementation spec").

Tags: **(owner)** = decided by the owner in the brainstorm. **(call)** = decided by Claude, changeable. **(default)** = adjustable game-rule default, defined in one config object (see implementation spec §4).

This spec covers **Phase 1 (Core room)** in full. Phases 2 to 4 (B§9) are described only as far as Phase 1 must leave room for them.

---

## 1. Goals and non-goals

**Goals**
- A group on phones can open a link or scan a QR code and be playing in seconds, with no signup (B§2).
- Bots fill empty seats so 3 humans, or 1 human practicing, can play a full game (B§3).
- An AI host picks word pairs, narrates and recaps (B§3, B§7).
- English and Simplified Chinese work from day one, including live translation of chat (B§6).

**Non-goals for Phase 1** (B§10 and B§9)
- Bot dress-up, daily puzzle, accounts, clans, living bot, audio input, dialects, free-text bot voice, highlight feed.
- Native apps, live voice chat.

## 2. Game rules

### 2.1 Roles and words
- Civilians share word A. Each spy gets word B, a similar but different word. A spy is not told they are the spy (B§1).
- Each player sees their word in **their own preferred language** (B§7). Words are never translated during play.
- Per-round reveals show only who is out and their role. Both words, in both languages, are shown only on the result screen after game over (the "look up after reveal" rule, B§7).

### 2.2 Parameters (default, adjustable)
All in one `GameConfig`:

| Parameter | Default | Notes |
|---|---|---|
| `min_players` / `max_players` | 4 / 10 | Counts humans plus bots. Bots may fill seats up to the minimum. |
| `spy_count` | 1; 2 when players >= 8 | Derived from player count at game start. |
| `turn_seconds` | 45 | Description turn timer. |
| `vote_seconds` | 30 | **(call)** Voting timer. |
| `statement_max_chars` | 120 | **(call)** Cap per statement. |
| `bot_fill` | on | Host can turn it off, but the game still needs `min_players`. |

Note: B§3 says 3 people can play with bots. That means 3 humans plus at least 1 bot reaching the 4-player minimum.

### 2.3 Round flow (B§7a)
1. **Describe.** Each alive player, in a shuffled order fixed for the game, gives one statement within `turn_seconds`. Statements may not contain the player's own word (enforced for bots, server-checked for humans, see §2.5). A missed turn records "(no statement)" and play moves on.
2. **Vote.** One vote per alive player, in secret. Voting for yourself is not allowed. Votes are revealed together when all are in or the timer ends. A player who does not vote abstains.
3. **Resolve.** The player with the most votes is out. Their role is revealed.
4. **Check win.** If the game is over, go to the result screen. Otherwise start the next round with the remaining players. Statements from earlier rounds stay visible.

### 2.4 Win conditions and ties (B§7a)
- Civilians win when every spy is out.
- One spy: the spy wins if still in when 2 players remain.
- Two spies: the spies win when spies >= civilians among alive players.
- **Tie:** tied players each give one more statement (same timer), then there is a re-vote among the tied players only. **Tied players do not vote in the re-vote** (a self-vote is banned, so a two-way tie would otherwise deadlock). If every alive player is tied (for example 1-1-1), there is no re-vote and nobody is out. If the re-vote is still tied, nobody is out and the next round begins.
- **Round cap (owner confirmed, scaled by player count):** `max_rounds = (players - 2 × spies) + extra_rounds`, with `extra_rounds` defaulting to 2 **(default)**. The first term is the number of eliminations a game needs to reach a spy win, so the cap allows every round to eliminate someone plus 2 stalled rounds. Examples: 4 players, 1 spy: 4 rounds. 6 players, 1 spy: 6. 10 players, 2 spies: 8. If the cap is reached with a spy still in, the game ends as a **spy win**. Every round counts, including no-elimination and abstain-only rounds, so stalling cannot extend a game.
- **Win check order** (applied after every elimination): (1) all spies out, civilians win; (2) spies >= civilians among alive players, spies win (with one spy this is the "2 players remain" rule; the same single rule is used for two spies); (3) `max_rounds` reached, spies win. A catch in the final round therefore wins for civilians.
- **No spy word-guess** in the base game (owner, B§7a).

### 2.5 Statement validation
- Server rejects an empty statement, one over `statement_max_chars`, or one that contains the sender's own word. Matching is a case-insensitive substring check against the sender's own word **in every supported language** (so a Chinese-language player with 咖啡 cannot type "coffee"). The other pair word is never checked, because rejecting it would reveal it. **(call)** This is a cheap guard, not a full leak detector; the AI host does not police it.
- A rejected statement does not consume the turn. The player can retry until the timer ends.

### 2.6 Bots as players (B§11, resolved)
- Bots are full voters. **(call)** This keeps tables of 4 workable with few humans.
- A bot can be the spy. **(call)** A bot spy is told nothing extra: like a human spy it only gets its word. Roles are assigned uniformly at random among all seats. There is no human-civilian guard: with a single human, a guard would tell that player they are a civilian, and solo practice is a goal (B§3). A solo human may be the spy; that is normal play.
- **Seat count:** bots fill empty seats only up to `min_players`. The host may add more bots in the lobby, up to `max_players`. `spy_count` is computed from the final seat count at game start.

## 3. Modes

**Gathering mode (Phase 1).** Host creates a room, gets a link and QR code. Others open it, pick a name and language, and join as guests. Identity is an anonymous token stored on the device (see §7). **(owner)**

**Clan mode (Phase 4).** Not built in Phase 1. Phase 1 leaves room for it: players have a stable `player_id` tied to the guest token, and finished games are stored so scores can be attached to an account later.

## 4. AI roles

### 4.1 AI host (B§3, B§7)
Jobs in Phase 1:
1. **Word pairs:** serve a vetted pair for the room's languages (see §6).
2. **Narration:** one short line at the start of each phase ("Round 2. Two players are left to doubt.") and a recap after each elimination. Narration is generated from game state only, never from secret roles or words. **(call)**
3. **Disputes:** out of scope in Phase 1. **(call)** No dispute button; the host does not rule on anything.

Host lines are translated like player messages (§5).

### 4.2 Bots (B§3)
- A bot receives only what a human in that seat would see: its word, the public statements so far, alive players, past votes and eliminations. It does not know whether it is the spy. **(information firewall, owner/call B§4)**
- Round 1: describe the word in a way that is true but hedged, since the bot may be the odd one out.
- Later rounds: read all statements, decide whom to suspect, and describe or defend accordingly.
- Bot output is structured: `{statement}` on describe turns and `{vote_for, reason}` on vote turns. `reason` is shown to nobody in Phase 1 and is logged for tuning only.
- Bots get a default personality from a small built-in set (cheerful, dry, chatty, terse) so they do not all sound alike. These are plain constants now and become the "default template set" of Phase 2 dress-up. **(call)**
- Bot statements are written in the room's main language (the host's language). Other-language viewers see them translated.
- Bot thinking time is padded with a short random delay (1 to 4 s) so bots do not answer instantly. **(call)**

## 5. Language and translation (B§6)

- Each player chooses a language on joining. Default is the browser's language, mapped to `en` or `zh-Hans`; anything else falls back to `en`. Changeable any time in the room. **(owner)**
- UI strings are pre-translated static resources. Only live player text goes through the model.
- **Per-message detection:** the server detects the language of each statement once (`en`, `zh-Hans`, or `other`). For each viewer: if the message language equals the viewer's language, show the original only; otherwise show the original plus a translation into the viewer's language. `other` is treated as different from both.
- **The original is the real message.** The translation is display only, labeled as translated.
- Translation prompt rule: **preserve vagueness; do not clarify or embellish.** (B§6)
- The original appears immediately. The translation arrives later as a separate event and fills in (§8.2).
- Translations are computed once per (message, target language) and shared by all viewers wanting that language.
- Bots read the original text only.
- Audio is out of scope. The message pipeline is text in, text out, so audio can add a front door later.

## 6. Word pairs (B§7)

- Pairs are **concepts localized per language**, not translated at play time.
- A pair record: `concept_a`, `concept_b`, `difficulty (1-3)`, `theme`, and for each supported language a word for A and a word for B.
- **Validation checks per language** (AI-run, once, at creation): the two words are distinct, both are common, neither is culturally sensitive. A pair that fails in any supported language is rejected. Never stored half-valid.
- **Pool first.** Most rooms draw from the vetted pool. A live AI call to make a new pair happens only when the pool lacks an unused pair for the room (see recently-played tracking in the implementation spec). Phase 1 ships with a **seed pool of at least 120 pairs** **(owner)**, generated and vetted offline by a script, then reviewed by the owner before loading.
- Both supported languages are always stored for every pair, so a room works whatever mix of `en` and `zh-Hans` players joins and a player switching language mid-game still sees their word correctly. **(call)**
- Within a game, which of A or B goes to civilians is random.
- Learning from play (B§7 step 6): Phase 1 only records per-pair outcomes (win side, round count). Automatic difficulty adjustment is later.
- Concept matching across languages for the daily puzzle belongs to Phase 3.

## 7. Identity and rooms

- **Guest identity (B§11 resolved):** on first visit the front end asks the server for a guest, receiving `player_id` and a secret `token`. The token is stored in `localStorage` and sent as a bearer token. It identifies the player across reconnects and, later, upgrades to an account by attaching the guest record to it. **(call)**
- **Room:** 4-character code from an unambiguous alphabet plus a join link `/r/<code>`. QR encodes the link. The first joiner is the host. If the host leaves, the host role passes to the longest-present human. **(call)**
- Rooms are public to anyone with the code. No passwords in Phase 1.
- A room lives until the game ends and everyone leaves, or 6 hours of inactivity.
- **Reconnect:** a player who loses connection stays in the game. Their turn still times out normally. Reopening the link with the same token returns them to the room. **(call)**
- **Leaving mid-game:** a player who leaves during a game is replaced by a bot with the same name and seat, which takes over description and voting. Their role stays. **(call)**
- **Join mid-game:** not allowed. Latecomers can wait for the next game.

## 8. Experience (front end)

Mobile-first, portrait, one-handed.

### 8.1 Screens
1. **Landing:** create room / join with code. Language picker is visible from the first screen.
2. **Lobby:** player list with bot seats, QR and link, host settings (bot fill, language), Start button.
3. **Word card:** after start, the player's word, tap to hide. Nothing about their role.
4. **Table:** the main screen. Statement feed (original plus translation), current speaker with countdown, input box when it is the player's turn.
5. **Vote:** alive players as large tap targets, countdown, "locked in" state.
6. **Reveal:** vote results, who is out and their role, host recap.
7. **Result:** winner, both words in both languages, roles of everyone, play again.

### 8.2 Live updates
- The table subscribes to a server event stream. Updates arrive as small events (new statement, translation ready, phase changed, vote locked, player joined or left).
- Translation events attach to an existing message, so the UI shows the original at once and fills the translation in place.
- On reconnect the client resumes from the last event it saw. If that fails it reloads the room snapshot. If the stream is unavailable, the client falls back to polling the snapshot every 2 seconds.

### 8.3 Visual and interaction notes
- Dark theme default, large type, high contrast for outdoor and low-light use. **(call)**
- Haptic tick in the last 5 seconds of a timer where supported.
- Never display other players' roles or words before the reveal. Spectators of an eliminated player see only what alive players see. **(call)**
- Eliminated humans can keep watching; their input is disabled.

## 9. Safety, cost and abuse

- **Information firewall:** the server never sends secret data (roles, other players' words) to a client or to a bot prompt. The only exception is the result screen after the game ends.
- **Prompt injection:** player text is passed to the model only as quoted data, never as instructions (see implementation spec §7). Because bots see only public information, injection cannot extract secrets.
- **Rate limits (B§11 resolved, defaults):** per IP and per player, using the existing sliding-window limiter. Per-room AI budget of 300 model calls. Degradation order, cheapest to lose first: (1) host narration stops, (2) translation stops (originals still show), (3) bots fall back to short canned statements. This is the one order used everywhere. **(call)**
- **Content:** statements are length-capped. No free-text bot content exists in Phase 1, which defers moderation (B§11) to Phase 2. Chat text from players is shown only to room members, never in public shares.
- **Name moderation:** player names are capped at 16 characters and stripped of control characters. **(call)**

## 10. Front-end technology (B§11 resolved, all call)

- TypeScript, React, Vite, React Router, **yarn** as the package manager **(owner)**. State by a small store over the room snapshot plus event patching. Plain CSS modules, no heavy UI kit.
- i18n: simple key-value JSON files for `en` and `zh-Hans`.
- Hosted as static files (`yarn build` output). **(call)** Default: serve them from the same Nginx that already fronts the Flask app on GCP, with `/api/` proxied to Flask and everything else falling back to `index.html`. Same origin means no CORS concerns and no second host to run. A separate static host remains possible because the API base URL is a build-time setting and the back end already enables CORS.
- QR generation on the client with a small library.
- Tests: Vitest for logic, Playwright for one end-to-end smoke test against a local back end.

## 11. Success checks for Phase 1

- 3 humans plus 1 bot finish a full game on phones with no errors.
- A zh-Hans and an en player in one room both see their own-language word and read each other's messages translated, with the original shown.
- Killing the browser tab mid-game and reopening the link returns the player to the table.
- Median bot reply under 6 seconds; median translation under 3 seconds.

## 12. Later phases (so Phase 1 does not block them)

| Phase | Hooks left in Phase 1 |
|---|---|
| 2 Bot dress-up | Bot prompt built by a compiler function from a `BotProfile` object; Phase 1 passes the built-in personality as the profile. |
| 3 Daily puzzle | Full game transcripts stored; word pairs carry concept IDs. |
| 4 Accounts, clans | Stable `player_id`; finished games stored with player ids. |
| Audio | Message pipeline accepts plain text; a transcription route can feed it later. |

## 13. Decisions closed by the owner (2026-11-06)

- Round cap scales with player count (§2.4).
- Seed pool is at least 120 pairs (§6).
- Front end is React with yarn (§10); hosting defaults to the existing Nginx (§10).
- Game database stays under `ai_svc/spy_hunt/` (implementation spec §2).

No open questions remain for Phase 1 beyond approving these specs.
