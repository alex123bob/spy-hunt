# Phase 2, second slice: Rule cards: design

Status: written under "you pick it" (owner delegated the design, 2026-11-10), so every choice is a **(call)**: change any you disagree with. Builds on `2026-11-10-bot-dressup-design.md` (the bot card, merged). Product background: `docs/brainstorm/2026-11-06-brainstorm-record.md` section 4 ("Rule cards (chained, if-then): the depth layer").

## 1. Intent

A bot's outfit today only changes how it sounds and describes. Rule cards let a player give the bot **tactics**: "when I am accused, counter-accuse", "when I speak last, copy the previous clue", "vote for whoever voted for me". They make bots worth tuning for winning, not just for show, and they are the base for later outfit remixing and the top-bots board.

## 2. Goals, non-goals, anti-goals

Goals
- A custom bot carries up to **3 rule cards**. A card is one `when` condition and one `do` action, both picked from fixed lists.
- The server decides whether a condition holds, from public game state only, and applies the action. The model never decides whether a rule applies.
- Statement actions steer the bot's next statement. Vote actions choose the vote directly, without a model call.
- Rule cards are created, edited, shown on the card and on the public page, and copied into a room with the rest of the outfit.

Non-goals (this slice)
- Chained or nested rules, free-text rules, card priorities beyond list order, rule memory across games (grudges), outfit remixing, the "top bots" board, accounts.
- Server checking that the model obeyed a statement action (prompt-only, like the slot options).

Anti-goals (a failure even if it technically works)
- A rule giving a bot information a human at that seat lacks. Conditions read only what is already public: votes in reveals, who has spoken, round numbers. The information firewall in `bots.public_view` stays the only source.
- A rule breaking the game rules: naming its own word, an illegal vote target, stalling. A vote action that has no legal target falls back to the normal model vote.
- Player-controlled text reaching a prompt as instruction. Rule actions refer to other players by **seat number only**; names stay inside the untrusted data block.

## 3. Approaches considered

- **A. Prompt-only rules.** Turn every card into a sentence always present in the prompt and let the model decide if it applies. Cheapest, but the model often ignores or misapplies conditions, so rules feel random. Rejected.
- **B. Fully deterministic rules** (an engine writes the statement and the vote). Reliable, but statements would be canned and break the bot's voice and the game's feel. Rejected.
- **C. Server-checked conditions, mixed actions (chosen).** The server evaluates each condition on public state. If true, a statement action adds one instruction sentence to that turn's prompt; a vote action picks the target deterministically. Reliable where reliability is checkable (votes), expressive where it is not (speech), no new model calls.

## 4. Design

### 4.1 The cards **(call)**

`when` (evaluated at the bot's turn, from public state only):

| id | holds when |
|---|---|
| `accused` | at least one vote against this bot in the latest voted round, including its re-vote |
| `first_to_speak` | describe phase only: no one has spoken yet in the current describe stage |
| `last_to_speak` | describe phase only, regular stage only (not a tiebreak): every other alive player has spoken in this stage |
| `after_elimination` | someone has already been eliminated in this game |
| `late_game` | the round is within the last two (`round >= max_rounds - 1`, `max_rounds` from the room config, added to `public_view`) |

`do`:

| id | kind | effect |
|---|---|---|
| `counter_accuse` | statement | add: "The players at seats [..] voted for you in the last vote. Voice suspicion toward them in the language of the statement, without revealing your word." Needs `accused`-style data, so it applies only when the latest reveal has voters for this bot; otherwise the card is skipped. |
| `copy_previous` | statement | add: "Stay as close as possible in meaning to the previous speaker's clue." Skipped when nobody has spoken yet. |
| `go_vague` | statement | add: "Make this clue vaguer and safer than usual, naming no distinguishing detail." |
| `vote_accuser` | vote | vote for a player who voted for this bot in the latest reveal and is a legal target now (random among them). |
| `vote_leader` | vote | vote for the seat with the most votes in the latest reveal if there is a single one, it is a legal target and not this bot. |

Any `when` can pair with any `do` (`first_to_speak` and `last_to_speak` never hold in a vote phase, so with a vote action they never fire): a statement action is considered in describe phases, a vote action in vote phases. A card whose action cannot apply (no accusers, no previous speaker, no legal target) is skipped, in list order, and the next card is tried. Statement rules that hold are all applied (at most 3 sentences). For votes, the first applicable vote rule decides and the model is not called.

Fixed order per turn: the existing outfit text, then rule sentences, then the closing "rules and format win" sentence. Rule text is English and says "in the language of the statement" where language matters.

### 4.2 Data and API **(call)**

- `outfit` gains `rules`: a list of 0 to 3 objects `{when, do}`. Missing means `[]`. An `outfit` sent on PATCH replaces the whole outfit, rules included (missing `rules` clears them). Unknown ids, more than 3, duplicates of the same pair, or non-objects give `400 bad_outfit`.
- `custom_bots` gains `rules_json TEXT` (added by the same idempotent migration). The room copy keeps the rules inside `players.outfit_json`, so no new `players` column.
- `GET /bots/catalog` gains `triggers: string[]`, `actions: string[]` and `max_rules: 3`.
- The public card's `outfit` includes `rules`. No other API change.

### 4.3 Where it runs (backend)

A new module `rules.py` with pure functions over the `bots.public_view` dict (no database): `context(view) -> RuleContext` (accusers, leader, speaking position, eliminated flag, late-game flag), `statement_lines(rules, ctx) -> list[str]`, `vote_pick(rules, ctx, valid_targets, my_seat, rng) -> int | None`. `bots.py` calls them: `_run_describe` appends the lines to the persona text for that call, `_run_vote` tries `vote_pick` before the model call and submits through the same `game.submit_vote` path.

### 4.4 Frontend **(call)**

The bot form gets a "Rule cards" section: up to 3 rows of two pickers ("When ..." and "Then ...") with add and remove, and the live preview lists them as `When accused → Counter-accuse`. The card view (list, public page) shows the rules. All labels in `en` and `zh-Hans`. Catalog data comes from `GET /bots/catalog`.

## 5. Constraints

- Information firewall unchanged: conditions use only data already in `public_view`; action text carries seat numbers, never names or roles.
- Model-call budget per room does not grow; a vote rule saves a call.
- Existing bots, outfits without `rules`, built-in personalities and every existing test keep working. A stored outfit with a broken or unknown rule entry plays as if the rule were absent.
- zh-Hans and en copy for every new label.

## 6. Left to the builder

Exact wording of the five action sentences and the zh-Hans labels, the layout of the rule rows, the migration code, and tests for each part.
