# Result and Reveal screen polish: short design

Part of the quality pass (word pool to 120, deferred minors, these screens). Frontend only, no backend change. Tags: **(owner)** decided by the owner, **(call)** my decision.

## Intent

Today the end of a game says only "Civilians win!" or "Spies win!", then a Words panel and a plain role list. It does not say whether *you* won, does not stand out who the spy was, and gives nothing to send to friends. The vote-result screen lists votes voter by voter. Goal: a finished game answers "did I win?", and gives players a card to share, which also brings new people in (retention goal from the brainstorm record).

## Goals and non-goals

- Goals: personal outcome, the spy highlighted, a spoiler-free-enough share card, vote results grouped by target.
- Non-goals: a per-round recap or awards (needs backend history; deferred until after bot dress-up **(owner chose B, not C)**), accounts, images or canvas share cards (text only, like the daily puzzle).
- Anti-goal: showing a win/lose line for a room that never had a winner.

## Approaches considered

- **A. Personal outcome only.** Cheapest, still nothing to share.
- **B. A plus a share card (chosen by the owner).** Reuses the daily puzzle's `shareResult`; best fit for retention.
- **C. B plus a recap.** Needs per-round history from the backend; separate, larger change.

## Design

**Result screen** (`src/screens/Result.tsx`), top to bottom:

```
        Game over
      You won! 🎉              (or "You lost")
  You were a civilian: piano
  ---------------------------
  The spy
    Finn          conditioner      <- highlighted
  Everyone
    Milo  Civilian   Juno  Civilian ...
  ---------------------------
  Round 2 of the game
  [ share card preview, 3 lines ]
  [ Share ]
  [ Play again ]  or  Waiting for the host…
  [ Leave ]
```

- **Outcome:** `me` = player with `seat === state.me.seat`. Won when `me.role` is spy and `winner === 'spies'`, or civilian and `winner === 'civilians'`. Headline "You won!" / "You lost". When `winner` is null (closed room) show a neutral "Game ended" and no share card **(call, fixes the deferred "Civilians win" bug)**.
- **Spy panel:** all players with role spy, name plus the spy word in the viewer's language (`state.words.spy[lang]`). Players list below stays, with the same role colours.
- **Your role line:** role plus your own word (`state.words[me.role][lang]`).
- **Rounds:** "Round {state.round}" from the snapshot.
- **Share card** (text, viewer language, `shareResult` from `src/daily/share.ts`):
  ```
  Spy Hunt 🕵️ Civilians won in round 2
  Spy: Finn (conditioner) · You: civilian ✅
  <site root URL>
  ```
  ✅ when the viewer won, ❌ when lost. Several spies are joined with ", " **(call)**. Player nicknames appear in the card **(call)**, since they are chosen names, not accounts. The Share button shows Shared / Copied / failed, same wording as the daily puzzle.
- A new pure function `resultShareText(...)` in `src/daily/share.ts` or a new `src/game/share.ts`; the builder picks, following whichever keeps `shareText` untouched **(call)**.

**Reveal screen** (`src/screens/Reveal.tsx`): replace the voter-by-voter list with votes grouped by target, highest first:

```
Pip     ●●● 3 votes
        Milo, Juno, Remy
Nova    ● 1 vote
        Finn
Abstained: Cleo
```

Same data (`reveal.votes`), nothing new from the server. Ties and "nobody eliminated" lines stay as they are.

**New i18n keys** in en and zh-Hans: `result.won`, `result.lost`, `result.ended`, `result.yourRole`, `result.theSpy`, `result.everyone`, `result.rounds`, `result.share`, `result.shared`, `result.copied`, `result.shareFailed`, `result.cardCivilians`, `result.cardSpies`, `reveal.voteCount` (singular and plural).

## Constraints

Match existing screens and styles; keep the 87-test suite green; the e2e smoke test must still pass (it checks no role text on Table and Vote screens only).

## Left to the builder

Exact copy in Chinese, the dot-count display for large vote totals (cap the dots, show the number), spacing and styles, tests for: won/lost for each role and winner, winner null, multiple spies, the share text, vote grouping with ties and abstentions.

## Also in this quality pass (no design needed)

- Word pool from 83 to 120 pairs: regenerate with a "do not repeat these pairs" list in the generator prompt, keep the owner's review step.
- Deferred minors: `reconnectNow` ignores the backoff sleep; the failed-stream reload loop has no backoff; the `.who` name line lacks the wrap class; blocked localStorage creates a ghost seat on reload.
