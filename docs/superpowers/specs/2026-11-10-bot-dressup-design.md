# Phase 2: Bot dress-up, first slice ("bot card"): design

Status: draft for owner approval. Date: 2026-11-10. Tags: **(owner)** decided by the owner, **(call)** my decision, change it if you disagree. Product background: `docs/brainstorm/2026-11-06-brainstorm-record.md` section 4. Earlier phases are built and merged to `main` in both repos.

## 1. Intent

Players dress up their own bot and then both enjoy it and show it off, **and use it in real games** (owner, 2026-11-10: "enjoy their own bot and show-off is as important as using it in the real game"). So a bot must have (a) a visible identity others see, (b) a public page worth sending, and (c) an outfit that really changes how it plays. It is also the base for the later living bot, outfit remixing and clan rivalries.

## 2. Goals, non-goals, anti-goals

Goals
- A guest can create up to 3 bots: name, avatar (emoji and colour), and an outfit of three slot choices.
- A bot's outfit is compiled into the prompt it plays with. Bots with no outfit play exactly as today.
- A bot can be brought into a real room by its owner and shows its avatar and name there.
- Every bot has a public page (`/bot/<id>`) with its card and record, with a copy-link button.

Non-goals (this slice)
- Rule cards (if-then behaviours), memory and grudges, outfit copy/remix, the "top bots" board, the living bot and its recap, clans, accounts, image share cards (link page only), free-text voice and backstory (owner: unlocks with accounts, and moderation comes with it).
- Moving bots between browsers (needs accounts). A cleared browser loses its bots, the same limit as the daily puzzle streak **(call, owner to confirm)**.

Anti-goals (would be a failure even if it technically works)
- An outfit giving a bot information a human player would not have. The firewall in the existing bot code stays the only source of what a bot knows.
- An outfit that can break the game rules: a bot naming its own word, ignoring the output format, or refusing to speak.
- A bot page that exposes who owns it.

## 3. Approaches considered

- **A. Bot card first (chosen by the owner).** Identity plus three slots, saved on the server per guest, public page, usable in rooms.
- B. Behaviour first: slots plus rule cards, no avatar or page. Stronger for competing, weak for showing off, and rule cards need their own engine.
- C. A plus rule cards and remixing: the full vision, too large for one slice. Rule cards and remixing are the planned second slice.

## 4. Design

### 4.1 The outfit (slots) **(call)**

Three slots, one choice each; the server owns the ids and the prompt text, the frontend labels them by id in `en` and `zh-Hans`.

| Slot | Options (id) | What it does |
|---|---|---|
| Voice | cheerful, dry, chatty, terse, pirate, grandma, sleepy_cat, robot | tone of the text (the four existing built-in personalities, plus four new) |
| Clue style | concrete, vague, metaphor, brief, memory, contrast | how it describes the word: physical details, abstract hints, metaphors, 8 words or fewer, a tiny personal memory, describing by contrast |
| Quirk | question, agree, number, emoji, honestly, color | habit in each statement: ends with a question, agrees with the previous speaker, includes a number, ends with an emoji, starts with "Honestly,", mentions a colour |

8 x 6 x 6 = 288 outfits. Principle from the brainstorm record: every option other than voice must change behaviour, not just flavour; voice is allowed to be tone-only because the owner defined it that way.

The server compiles an outfit with a function `compile_outfit(outfit) -> BotProfile` (the type already used by the bot code) into a style paragraph. The game scaffold (rules, "never say your word", the JSON output format) wraps it and always wins a conflict. An unknown or missing option falls back to the default personality.

### 4.2 Bot identity and storage

- Table `custom_bots(id, owner_player_id, name, avatar_emoji, avatar_color, voice, style, quirk, games, wins, spy_games, spy_wins, created_at)`; `id` is a short random code (8 characters, URL safe). Cap: 3 bots per guest **(call)**.
- Name rules are the same as player names (cleaned, 16 characters) **(call)**, because player names are already free text shown to others.
- Avatar: one emoji from a fixed list of about 24, and one colour from 6 swatches. The lists are server constants so nothing arbitrary is stored.
- Edit and delete are owner-only. Deleting makes the public page return 404; rooms already holding a copy are unaffected.

### 4.3 In a room

- Today only the host adds bots (random name and personality). New: **any member in the lobby may add one of their own bots, one per owner per room** **(call)**; the host can still add random bots and can remove any bot.
- When a custom bot is added, the room copies its name, avatar, outfit and `bot_id` into the player row, so later edits or deletion do not change a game in progress.
- A custom bot takes a seat like any bot, is labelled "Bot", and plays with the compiled outfit as its personality. Everything about its knowledge, timing, voting and fallbacks is the existing bot code.
- The public player data gains `avatar` (emoji and colour, or null) and `bot_id` (or null). Lobby, table, vote, result and the player chip show the avatar; the chip links to the bot page.

### 4.4 Public bot page and record

- `GET /api/spy-hunt/bots/<id>` returns `{id, name, avatar, outfit, record}` with no owner information and needs no login (IP rate limit only) **(call)**. Frontend route `/bot/:id`: the card, plus "Copy link" using the existing share helper.
- Record: `games` (finished games the bot played), `wins` (games its side won), `spy_games`, and `spy_wins`, shown as "fooled the table N times". Updated once per finished game for every custom bot in the room.
- Sketch:

```
 [🦊]  Mochi
 Voice: Pirate    Style: Metaphor    Quirk: Ends with a question
 12 games · 7 wins · fooled the table 3 times
 [Copy link]
```

### 4.5 Owner screens (frontend)

- `/bots`: the guest's bots (up to 3) with create, edit, delete. Reached from a "My bots" card on the Landing page and from the end of the daily puzzle ("dress up a bot", as the brainstorm record planned).
- Create/edit form: name, emoji grid, colour swatches, three slot pickers, a live card preview, Save.
- Lobby: an "Add my bot" button for members who own at least one bot; opens a short list to pick from.

### 4.6 API summary (backend, all under `/api/spy-hunt`, guest token required except the public page)

- `GET /bots/catalog`: the slot options and the avatar emoji and colour lists (ids only).
- `GET /bots`: my bots. `POST /bots`: create. `PATCH /bots/<id>`: edit. `DELETE /bots/<id>`.
- `GET /bots/<id>`: public card (no token).
- `POST /rooms/<code>/bots` gains an optional `bot_id` for `action: "add"` and an optional `seat` for `action: "remove"`.

### 4.7 Details settled during review (all **(call)**, change any you disagree with)

- **Ownership in a room.** The player row for a custom bot also stores `bot_owner_id`, used for the "one custom bot per owner per room" check and for removal. If the owner leaves the lobby, their custom bot leaves with them. If the owner leaves mid-game the existing rule applies (their own seat becomes a bot) and the custom bot stays. A rematch keeps custom bots in the room.
- **Who can remove.** The host can remove any bot; an owner can remove their own custom bot, using `action: "remove"` with `seat`. Without `seat` the current behaviour (host removes the last bot) is unchanged.
- **Language.** A custom bot speaks the room's main language at the moment it is added, like built-in bots. Option text is written in English as instructions and says to apply them "in the language of the statement", so "Honestly," becomes the natural equivalent in Chinese, and the pirate voice is rendered in that language.
- **Enforcement.** Prompt only: the model is trusted to follow the outfit, and the server does not validate the output for quirks or style. The server keeps checking what it already checks (empty text, own word, length cap, canned fallback). When options conflict, precedence is scaffold rules first, then clue style, then quirk, then voice, and each option text is written so it can coexist (the brief style says "about 8 words", not a hard limit).
- **Record rules.** Only games that end normally with a winner count. `games` counts every custom bot that played; `wins` counts games its side won even if the bot was voted out; `spy_games` counts games it was the spy; `spy_wins` counts those the spies won, shown as "fooled the table". Whether its owner was present does not matter.
- **Capacity.** Custom bots count toward the room's maximum like any bot, one per owner, and the host can remove them. The start-of-game bot fill still tops the room up to the minimum with random bots, counting custom bots as players.
- **Privacy.** The bot page never shows the owner. Someone can infer an owner from who shares a room with the bot; that is accepted. The page itself is token-free, and the frontend shows "Edit" only when the bot's id is in the viewer's own `GET /bots` list.

## 5. Constraints

- Information firewall unchanged: the compiled outfit is the only new text in a bot prompt and carries no game state.
- Model-call budget per room is unchanged; the outfit adds prompt length, not calls.
- Existing rooms, existing built-in personalities and the 501 + 134 existing tests keep working.
- zh-Hans and en copy for every new label.
- Rate limits: bot create/edit/delete use the existing `action` limiter; the public page uses the IP `flood` limiter.

## 6. Decisions that were the owner's

- First slice is the bot card (approach A). Show-off and real-game use matter equally.
- Free text and moderation wait for accounts. Bots with no accounts live on the server per guest.

## 7. Left to the builder

Exact prompt wording of each option, the emoji and colour lists, copy in both languages, page styling, the migration of the `players` table (new columns for avatar and `bot_id`, outfit copy), the stats update hook at game end, and tests for each part.
