# Bot voting strategy: design (short)

Status: draft for owner approval. Date: 2026-11-20. Tags: **(owner)** said by the owner, **(call)** my decision. Builds on `2026-11-20-bot-minds-design.md` (built and merged).

## Intent

Owner, 2026-11-20: voting should be customizable on a bot, and random (built-in) bots should have a unified or randomized voting strategy instead of none. Today every bot just asks the model "who do you vote for"; only rule cards and `deep` thinking steer a vote, and built-in bots all vote alike.

## Goals / non-goals / anti-goals

Goals
- A **voting strategy** setting on custom bots, picked on the bot form next to the Mind settings, with the same info bubble and one-line description as the other settings.
- Built-in bots each get a strategy, chosen once per bot at random with most weight on the plain one, stable for that bot for the whole game.
- Strategies that can be decided from public data are decided by the server, with no model call.

Non-goals
- Votes cast in the **current** round. They are hidden until the reveal, so no bot may see them; this is why the strategies below use last round's votes only.
- Arena (bot-vs-bot) voting and the daily puzzle: unchanged.
- New rule-card actions.

Anti-goals
- Any strategy that reads hidden state (current-round votes, roles, other words). Every input is already in `bots.public_view`.
- A bot that cannot vote because its strategy has nothing to act on: every strategy falls back to the plain model vote.

## Approaches

- **A. A rule-card action per strategy.** Reuses the rule engine, but rule cards fire only when a trigger holds (and max 3), while a voting style is a bot's default behavior. Rejected.
- **B. A new outfit field `vote` (chosen).** Stored with the other Mind settings, applies every vote, rule-card vote picks still win when one fires.
- Random bots, **(call)**: strategy derived from a hash of the bot's player id with fixed weights (like `bot_temperature`), so it needs no new column and cannot change between rounds. The alternative, a stored random value, adds a column for no benefit.

## Design

Field `vote` in the outfit and `custom_bots.mind_json` (extends `MIND_DEFAULTS`; default `evidence`; missing or unknown value means `evidence`). Backend catalog gains `votes`.

| id | Label | Behavior |
|---|---|---|
| `evidence` | Follow the evidence | Today: the model decides. |
| `follow_last` | Follow the table | Votes the seat that got the most votes last reveal, if there was a single leader who is a legal target and not itself. Server picks, no model call. Otherwise `evidence`. |
| `grudge` | Hold a grudge | Votes a seat that voted for it last round (random among them) if legal. Server picks, no model call. Otherwise `evidence`. |
| `odd_one_out` | Odd one out | Model call with an added line: vote the player whose statements fit least with the others'. |
| `independent` | Think independently | The model is shown the legal seats **without** last round's leader (when at least 2 others remain), so it never joins the pile-on. |
| `cover` | Cover story | Model call with a conditional line: if you suspect you may be the spy (your word does not fit the others' statements), vote seat N, the table's favorite last round, to stay unnoticed. Added only when a last-round leader exists. |

- Order in `bots._run_vote`: rule-card vote pick first (explicit tactic), then the server-picked strategies, then the model path with any strategy line / filtered seats and the `deep` suspects hint. The existing validity check and random fallback stay.
- Pure functions in `rules.py` / `minds.py`: `vote_strategy_pick(strategy, ctx, valid_targets, rng) -> Optional[int]` and `vote_strategy_line(strategy, ctx) -> str`, plus `vote_targets_for_prompt(strategy, ctx, valid_targets)`. `rules.context` already carries `leader` and `accusers`.
- Built-in weights **(call)**: `evidence` 50, `follow_last` 15, `grudge` 10, `odd_one_out` 10, `independent` 5, `cover` 10; picked by `sha256(player_id)`. Built-in bots stay believable, most play straight.
- Frontend: a "Voting" picker under Mind in `BotForm`, card line on `BotCardView`, `bots.vote*` i18n keys plus `bots.help.vote` and a `.desc` per option, in en and zh-Hans; defaults handled by `withMind`.

## Constraints

- Firewall unchanged; strategy lines mention seats by number only.
- Old stored bots and outfits play as `evidence`; no migration beyond the existing `mind_json`.
- Built-in votes become cheaper on average (about a quarter of them need no model call).

## Left to the builder

Exact prompt wording, zh-Hans labels and descriptions, tests (each strategy on and off its trigger, rule card still wins, no hidden data in any prompt, built-in distribution roughly matches the weights and is stable per player id), and the layout of the new picker.
