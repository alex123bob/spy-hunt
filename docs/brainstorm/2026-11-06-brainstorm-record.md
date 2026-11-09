# Spy Hunt: Brainstorm Record

Date: 2026-11-06
Status: Brainstorm complete. Design spec and implementation spec come next, in `docs/specs/`.

This file records what was decided in the brainstorm and why. Items marked **(owner)** were stated or approved by the project owner. Items marked **(call)** were decided by Claude on the owner's behalf ("your call") or proposed and not objected to, and the owner can change them.

---

## 1. Concept

A "Who is the Spy" style social deduction game, played on phones through a website, with AI as a core part of the game.

- Each player gets a secret word. Civilians share one word. The spy gets a similar but different word and doesn't know they are the spy.
- Players take turns describing their word without saying it, then vote out who they think is the spy.
- Name: **spy-hunt** **(owner)**.

## 2. Usage and modes **(owner)**

The game is for casual gatherings (after dinner, outdoor camp) and for long-term play (clan leaderboards, social profiles, sharing). It runs mainly on phones, in the browser.

| Mode | Purpose | Notes |
|---|---|---|
| **Gathering mode** | Growth engine | Open a link or scan a QR code, join in seconds, no signup. |
| **Clan mode** | Retention engine | Same game plus persistent identity, leaderboards, seasons, profiles. It grows out of gathering mode. **(call)** "You just played, so keep your score and join a clan." |

No app install. Link or QR join is the front door.

## 3. AI roles **(owner)**

Two categories, confirmed by the owner:

1. **AI as an autonomous player (bot).**
   - Receives a word and doesn't know whether it is the spy.
   - Round 1: describes its word while hedging, considering what the spy's word could be.
   - Later rounds: reads all statements, works out who seems off, and defends itself against suspicion until it survives.
   - **(call)** Bots fill empty seats, so 3 people can play a full game and a solo player can practice any time.
2. **AI as a role (host).**
   - Generates and chooses the word pairs (see section 7).
   - **(call)** Can also narrate, settle disputes and recap the round.

## 4. Bot customization ("dress-up") **(owner's idea, our design)**

The owner's idea: each personality prompt is a piece of clothing that dresses the bot. There is a default template set, and a board for people to customize their own bot and bring it into a room.

Piece types **(call)**:

- **Slots (parallel, like clothes).** Voice, quirk, accessory and so on. One item per slot, and slots stack freely, so conflicts are impossible.
- **Rule cards (chained, if-then).** "When accused, counter-accuse." "When last to speak, copy the safest answer." This is the depth layer: tiny programming without code.
- **Memory (persistent, clan mode).** The bot remembers who burned it and holds grudges across games.

Principles **(call)**:

- Every piece must change behavior, not just flavor.
- The server compiles the outfit into the bot's prompt. Pieces are never pasted together raw. The game scaffold (rules, output format, "never say your word") wraps the outfit and always wins conflicts.
- With 6 slots and about 12 options each there are roughly 3 million combinations, so a limited set is not a real limit.

### Free-text customization

Owner asked whether it is hard to allow it and how to control it. Decision:

> **Free text may change how a bot sounds, never what it knows or the rules.** **(call)**

- **Information firewall:** the server gives a bot only what a human player sees, so prompt injection gains nothing.
- **Strategy lives only in slots and rule cards,** never in free text.
- Free text goes in a single capped "voice and backstory" field with an AI moderation pass before it can be shared.
- Free text unlocks with an account or level, not for anonymous guests.
- Friend rooms allow anything. Ranked play and leaderboards allow only slots, rule cards and the capped voice field.

"Voice" means the **tone of the bot's written text** (pirate, grandma, sleepy cat), not audio.

### Strong custom bots **(call, owner delegated)**

A bot that wins a lot is an earned flex and is not capped. A "top bots" board shows winning outfits, and others can copy and tweak them. If a single piece dominates, balance that piece (like nerfing one card). Never cap the players.

## 5. Retention loops **(owner approved all)**

1. **Living bot.** Your bot plays async matches while you're away and sends a recap ("Mochi was accused twice, survived, fooled 3 humans").
2. **Daily Spy Hunter puzzle** (Wordle style):
   - Once a day everyone gets the same transcript of a finished game (real or bot-vs-bot).
   - Read for about two minutes, tap who the spy is, optionally guess the two words.
   - Score depends on tries and speed. Shareable result card with emoji squares. Streaks.
   - Needs no room and no friends. After it, the game suggests a real round or bot dress-up.
3. **Clan seasons and rivalries.** Weekly leaderboards, clan vs clan, bot-vs-bot rivalries.
4. **Outfit remixing.** Copy and tweak other people's bot personalities, with credit for popular outfits.
5. **Bot-vs-bot highlight feed** (scrollable replays where you guess the spy before the reveal). Later.

**(call)** The heartbeat is loop 1 plus loop 2. Clan seasons sit on top.

## 6. Language and translation **(owner's requirements, our design)**

Requirements **(owner)**:

- Players choose a language when opening the game, guests included. Default is the system language. Language must not be a barrier.
- First version supports **English and Simplified Chinese** only. More are added later.
- Each player sees other players' messages translated into their own language. If a Chinese-language player types English, an English-language viewer should not need translation.
- Audio input is wanted eventually, and dialects (Mandarin, Cantonese, Sichuanese and so on) are an exciting later extension.

Design **(call)**:

- **Detect the language of each message,** not of each sender. If a message's language matches the viewer's, show the original only. Otherwise show the original plus a translation.
- The original text is the real message. Translation is display only. Mixed-language messages are translated whole.
- Translation instruction: **preserve vagueness; do not clarify or embellish,** because a literal translation can leak or distort a clue.
- Bots read original text only, never translations. A bot speaks in the room's main language or its outfit's language and is translated like anyone else.
- The original appears instantly and the translation fills in a moment later.
- UI strings are translated ahead of time. Only live player text goes through the model.
- Language can be changed in the room at any time.
- **Audio:** preferred language is a **hint** for speech recognition and not a hard setting, because people speak languages other than the one they picked. The transcript becomes an ordinary message and uses the same text pipeline. Show the transcript with tap-to-fix before sending. Dialects are a later setting under a language, after testing real model coverage.
- **Audio is out of scope for the first version.** OpenAI Whisper is the likely provider, and PP-AI-Service already has `/api/transcribe` and `/api/speak`.

## 7. Word pairs and the AI host **(owner approved)**

Words are chosen as concepts and then localized, so they work in every language in the room.

1. Read the preferred languages of all players in the room.
2. Propose a concept pair (such as coffee and tea) with a difficulty level and an optional theme.
3. For each language, write the word players will see and check: the two words stay distinct, both are common, neither has a strong cultural or sensitive meaning.
4. Reject or swap any pair that fails in any language. Never ship a pair that works in only one.
5. Keep a vetted pool of passed pairs with per-language versions. Most rooms draw from the pool, and a live AI call is the exception. This cuts cost and wait time and makes daily puzzles reproducible.
6. Learn from play. Adjust a pair's difficulty if it is caught too easily or never caught, and retire broken pairs.

Display rules **(owner confirmed)**:

- Each player sees their secret word **in their own preferred language** (a Chinese-language player sees 咖啡, an English-language player sees coffee). The same concept, so everyone plays the same game.
- The word is never shown translated during play, because that would leak information. Translation applies only to chat messages.
- There is no word-guess in the base game (see section 7a). Guess matching by **concept** across languages (guessing "coffee" against 咖啡 counts as correct) is still needed for the daily puzzle's optional word-guess bonus.
- **Looking up a word in the other language is allowed only after the reveal, not during play.** **(call, owner agreed)**

Later ideas **(call)**: mixed-language rooms get a narrower set of valid pairs, and the host should say so rather than fail silently. A "culture themes" mode could use pairs that are fun because they differ across languages.

## 7a. Game rules

- **One vote per round** **(owner)**. A round is one description turn per player, then a vote, and the player with the most votes is out. The next round starts with the remaining players.
- **No spy word-guess** **(owner)**. A voted-out spy simply loses. Reason: after a couple of rounds the civilian word is too easy to guess, which gives the spy too much advantage and is unfair to civilians. A "last stand" guess could return later as an optional hard mode.
- **Win conditions** **(call, follows from the above)**:
  - Civilians win when every spy is voted out.
  - With one spy, the spy wins if still in when 2 players remain. A table of N players has at most N-2 votes.
  - With two spies (8 or more players), the spies win when they equal the civilians in number.
- **Ties** **(call)**: the tied players each give one more statement, then there is a re-vote. If still tied, nobody is out that round.
- Player count, spy count, turn timer: defaults proposed (4 to 10 players, one spy, two at 8 or more, 45-second turns) and not yet confirmed by the owner.

## 8. Technical decisions

- **Front end:** mobile-first web app, in `~/personal_github_repos/spy-hunt/` **(owner: separate folder next to `brainstorm`)**. Stack to be finalized in the design spec **(call: TypeScript)**.
- **Back end: existing Flask app** at `~/personal_github_repos/PP-AI-Service/` **(owner)**.
  - The game gets its own standalone folder (`ai_svc/spy_hunt/`) and a single blueprint under a root route (`/api/spy-hunt/...`). All game requests are sub-routes of it **(owner)**.
  - AI uses DeepSeek for text, as the rest of the service does. OpenAI is available for later audio **(owner)**.
  - The existing service runs `python app.py` (Flask built-in server, no gunicorn, no WebSocket support).
- **Real-time transport: Server-Sent Events plus plain POST for actions, with polling as a fallback.** **(call, owner asked for a recommendation)**
  - Players mostly receive updates and act occasionally, so two-way WebSockets are not needed.
  - SSE is plain HTTP and fits the current Flask service without changing deployment.
  - SSE reconnects automatically and can resume from the last event, which suits phones that lock or lose signal.
  - Audio upload is a single POST, so it needs no WebSocket either.
  - Costs: one thread per open connection, and Nginx needs buffering off for the SSE route. Fine at friend-group scale. If the game outgrows it, the real-time layer can move to a separate service.
  - Room state is stored in SQLite, like the service's existing `cache.db` and `metrics.db`, so restarts don't lose games.
- Bots run server-side so they cannot leak hidden information.
- **No changes to PP-AI-Service until the owner approves the specs.**
- **Local symlink** **(owner asked, call on the precaution)**: `spy-hunt/backend` is a relative symlink to `../PP-AI-Service`, for working on both projects from one place. It is listed in `.gitignore` because it only works on the owner's machine. The front-end repo is initialized by the owner through GitHub Desktop (leave "Git Ignore" on None to keep our `.gitignore`).

## 9. Scope and phases **(call)**

This is a project that needs a written design, and it is large enough to build in phases:

1. **Core room:** join link or QR code, humans plus bots, AI host, English and Simplified Chinese, translation.
2. **Bot dress-up:** slots and rule cards.
3. **Daily puzzle** and share cards.
4. **Accounts, clans and the living bot.**

Later: free-text voice field, audio input, dialects, highlight feed, more languages.

## 10. Non-goals and watch-outs

- Not a native app. No app-store dependency.
- Not live voice chat. Audio means voice messages turned into text.
- Free text must never change what a bot knows or the rules.
- Never ship a word pair that works in only one language.
- Translation must never clarify or embellish a clue.
- Unvetted free-text content must not appear in public shares or leaderboards.

## 11. Open items for the design spec

- Exact front-end framework and hosting.
- Identity for guests (anonymous token) and how it upgrades to an account.
- Rate limits and per-room cost caps for AI calls.
- Moderation approach for free text and shared outfits.
- Confirm player counts, spy counts and the turn timer (section 7a).
- Whether bots count as full voters, and whether a bot can be the spy.
