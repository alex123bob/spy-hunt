# Bot minds: richer customization and smarter default bots: design

Status: draft for owner approval. Date: 2026-11-20. Tags: **(owner)** said by the owner, **(call)** my decision, change any you disagree with. Builds on `2026-11-10-bot-dressup-design.md` (slots) and `2026-11-10-rule-cards-design.md` (rule cards), both built.

## 1. Intent

Owner, 2026-11-20: customization today is "limited and not creative". They want bots shaped by **how they think and talk**: sometimes a wordy bot; sometimes a bot with few words that is smart about it, working out from each round's clues that it is probably the spy, then saying its word cleverly; "more effort on thinking or less thinking, like an LLM"; and "use your imagination". They also want the **default (random) bots to be smarter**, for example acting differently once they suspect they hold the spy card.

Hard constraint behind the second ask: **a bot is never told its role** (design spec 2.1, information firewall). A bot cannot "know" it is the spy. It can only infer it, the way a human does: "everyone's clues don't fit my word". So "smart" means *inference plus a chosen reaction*, never a peek at the role.

## 2. Goals, non-goals, anti-goals

Goals
- New **Mouth** and **Mind** parts of the outfit: a wordiness dial, a clue form, a thinking level, a suspicion dial and a "when I suspect I'm the spy" reaction.
- A **thinking** mechanism that really changes play: more thinking means the bot reads the table and judges whether its own word fits before it speaks or votes.
- Default bots get a light version of the same self-check, so they are a bit more believable. They stay beatable **(owner approved the "bit more believable" default, delegated to my pick)**.
- Existing bots and outfits play exactly as today until edited.

Non-goals
- Free-text prompts and moderation (owner: "fine for now").
- Bot memory and grudges across games, audio, new rule-card triggers (a `hunch_spy` trigger is a natural follow-up, not in this slice).
- Server checking of how well the model obeyed a style (prompt-only, as for slots).

Anti-goals (a failure even if it technically works)
- Any path where a bot learns its role, another player's word, or hidden state. The analysis step reads the same `bots.public_view` as today and nothing more.
- A bot's private reasoning reaching any player, log shown to players, or share page.
- Deep-thinking bots that stall turns or drain a room's AI budget so that translation and the host stop working.
- A dial that does nothing visible. Each option must change behavior, not only flavor (brainstorm principle).

## 3. Approaches considered

- **A. More menus only** (add slots and options, all prompt text). Cheap and consistent with today, but "think harder" would be a sentence the model may ignore. Does not give the smart-spy behavior. Rejected as the main approach.
- **B. Real thinking pipeline plus dials (chosen).** Dials map to concrete server behavior: token budget and prompt text for the mouth; an extra private analysis step for the mind; the server reads the analysis result (a number) and decides which reaction text to add. Reliable where checkable, expressive in speech.
- **C. A visual "bot brain" graph editor.** Most creative, but a large UI and an engine to match; rule cards already cover simple if-then. Deferred; this slice makes B's building blocks the future graph's nodes.

## 4. Design

### 4.1 The new outfit parts **(call)**

Added to `outfit` next to `voice`, `style`, `quirk`, `rules`. All optional; missing means today's behavior.

| Part | Field | Values | Effect |
|---|---|---|---|
| Wordiness | `words` | 1 to 5 (default 3 = today) | sets the length instruction ("one short clause" up to "two or three sentences with detail") and the statement `max_tokens` (80 to 200). The existing length cap and own-word check still apply. |
| Form | `form` | `plain` (default), `riddle`, `rhyme`, `one_word`, `emoji_only`, `no_adjectives`, `question_only` | a creative constraint on the statement, added as prompt text. `one_word` and `emoji_only` override wordiness. |
| Thinking | `think` | `instinct` (default), `careful`, `deep` | see 4.2 |
| Suspicion | `suspicion` | 1 to 5 (default 3) | how readily the bot decides it might be the spy: maps to the analysis threshold in 4.2 |
| Spy reaction | `reaction` | `blend_in` (default), `go_vague`, `mirror`, `deflect` | what the bot does once it suspects it is the spy: blend in with generic safe clues; stay vague; echo the table's shared theme without its own word's specifics; shift attention by questioning another player |

Option count: the new parts alone multiply the 288 existing outfits by about 5 x 7 x 3 x 5 x 4, before rule cards.

### 4.2 Thinking levels and the spy hunch **(call)**

- **instinct:** one model call per turn, exactly as today.
- **careful:** still one call. The prompt asks for JSON with a private `notes` field (two or three lines on how well the word fits the table) before the `statement`. Same call count, slightly more tokens. The notes are discarded.
- **deep:** two calls per describe turn and per vote. The first call (the **analysis**) receives the same public view and asks for JSON: `{fit: 0..100, suspects: [seat...], note}` where `fit` is how well the bot's own word matches the clues said so far (low fit means the bot may be the spy). The **server** compares `fit` with a threshold from the suspicion dial (1 = fit under 20, 5 = fit under 60, my starting values) and, if crossed, adds the chosen reaction sentence to the statement call. In votes the analysis `suspects` ordering guides the vote prompt; the model's pick still goes through the existing validity check.
- The hunch is computed once per turn and lives only in memory for that call. It is never stored, logged beyond the existing fallback log lines, or sent to clients.
- **careful** reaches the reaction too, but through the prompt, not the server: one call cannot measure fit and react to it, so the prompt carries the chosen reaction as a conditional instruction ("if your word clearly does not fit the other players' statements, then ...; report `fit` 0 to 100"). The server reads `fit` only to tolerate it and discards it (never stored, never logged). The server-side threshold (`minds.hunch`) applies to **deep** only, where the analysis call runs first and the reaction line is applied directly when the hunch fires. **instinct** never reacts (it does not look). *(Changed during planning; the original wording had the server threshold `careful` too.)*
- Failure handling follows the existing rule: any failed or over-budget call falls back to the next-cheaper behavior (deep, then careful, then instinct, then canned), so a turn never stalls.
- **Budget guard:** deep degrades to careful when `llm.budget_fraction_left(room)` is under 40% **(call)**, the same idea as the host narration skip.

### 4.3 Default (random) bots **(call)**

Built-in bots get `careful` thinking, suspicion 3 and `blend_in`, so they self-check cheaply with no extra calls and hedge when their word does not fit. They never use `deep`. Their existing temperature variation stays. Arena (bot-vs-bot) and daily-puzzle generation keep today's plain behavior unless explicitly switched on, to keep puzzle quality gates stable **(call, open for the builder to confirm in tests)**.

### 4.4 Where it runs

- `outfits.py`: new tables and validation (`words`, `form`, `think`, `suspicion`, `reaction`); unknown values give `400 bad_outfit`; `GET /bots/catalog` returns the lists and ranges.
- A new module `minds.py` of pure functions: `plan(outfit, budget_fraction) -> Plan` (effective thinking level, max tokens), `analysis_prompt(view)`, `hunch(analysis, suspicion) -> bool`, `reaction_line(reaction)`, `length_line(words)`, `form_line(form)`.
- `bots.py`: `_run_describe` and `_run_vote` call `minds` before the existing prompt build. `compile_outfit` gains the new lines through its existing `extra` parameter. No change to scheduling, locking, or submit paths.
- Frontend: the bot form gets a "Mouth" and "Mind" section (two sliders, a form picker, a thinking segmented control, a reaction picker), the live card preview and the public bot page show them. All labels in `en` and `zh-Hans`.

### 4.5 Settled after the builder check (all **(call)**)

- **`careful` is not a rewrite.** The statement call already returns JSON through `llm.call_json` with a pydantic schema (`_StatementOut`). `careful` adds optional `notes` and `fit` fields to that schema, so the parse, retry (built into `call_json`) and submit paths are unchanged. If `fit` is missing or malformed the bot simply does not react and speaks normally. No extra call.
- **Minimum evidence.** `fit` is ignored (no spy hunch) until at least 3 statements from other players exist in the current game. The first speakers therefore never hedge from a hunch.
- **Votes.** The reaction lines apply to statements only. In a vote, `deep` passes the analysis `suspects` order into the vote prompt; `careful` and `instinct` vote as today. The model's pick still goes through the existing validity check and random fallback. The hunch does not change votes.
- **Form and length versus existing checks.** The only server-side statement checks stay the own-word check (`engine.contains_own_word`, a 400 then a canned fallback) and the trimming already in the submit path. Style and form are prompt-only. The builder must confirm no existing length or word-count rule rejects `emoji_only` or `one_word` outputs, and relax it for those forms if one does, so the dial never silently turns into canned lines.
- **"Play as today" means stored custom outfits.** An outfit saved before this change has no new fields and plays as `instinct`, 3 words, `plain`. Built-in bots are not stored outfits (they carry a persona key and are built at game time), so they get the new defaults from code, with no migration. This is a deliberate change to default bots, as section 4.3 says.
- **Arena and daily puzzle need no switch.** They call `bots._prompt_describe` and `llm.call_json` directly and never go through `_run_describe` or `_run_vote`, where the new logic lives. They stay unchanged by construction. Keep that boundary and add a test that proves it.
- **Budget and timing for `deep`.** `llm.budget_fraction_left` already exists and the analysis call counts against the same room budget of 300. The analysis call gets its own 5 second timeout; on timeout or failure the turn continues as `careful`. Worst case for a deep turn is that timeout plus one normal 8 second call.

## 5. Constraints

- Information firewall unchanged; analysis input is `public_view` only. Add a test that the analysis prompt contains no role and no other seat's word.
- Prompt-injection stance unchanged: player statements stay inside the untrusted data block; reaction lines refer to seats by number only.
- Model-call budget: instinct and careful add no calls; deep adds at most one per turn. Room budget is 300 calls, so deep is bounded by the guard in 4.2.
- All existing tests keep passing; outfits and rooms stored before this change play as today.
- zh-Hans and en copy for every new label and value.

## 6. Decisions that were the owner's

- Bots should be customizable by wordiness and by thinking effort, including a terse-but-smart spy-aware bot. (Owner's examples.)
- Default bots should get smarter in the "infer you might be the spy and act differently" way. Hard-to-beat versus believable was left to me; I chose believable by default, with the hardest play reserved for player-built bots.
- Free text and moderation are out for now.

## 7. Left to the builder

Exact prompt wording per option and reaction (and zh-Hans labels), the fit thresholds after testing against real transcripts, the slider and layout design, token limits per wordiness level, the migration (built: one new column, `custom_bots.mind_json TEXT`, added by the existing idempotent migration; the room copy in `players.outfit_json` carries the same five keys), a replay/arena harness to measure whether `deep` bots really get caught less often than `instinct`, and tests for each part.
