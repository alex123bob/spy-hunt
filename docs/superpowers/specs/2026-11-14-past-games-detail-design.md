# Past games: expandable detail rows (short design)

## Intent
The Recent games list on Profile shows one summary line per game (role, outcome, credits, date). Seeing anything more means opening a separate page per game. Let a player expand a row in place and see the game's stored detail, so a quick scan and a closer look happen on the same screen.

## Goals
- Each row in the Recent games list on `src/screens/Profile.tsx` is expandable (tap to open, tap again to close, several rows can be open at once).
- Collapsed row, richer than today: result badge (Won / Lost / Draw) and credits, your role, the winning side, and date plus time.
- Expanded row, from the existing `GET /me/games/<room_id>/<game_no>` data: the word pair (your own word marked), every seat with its role (you and bots marked), and your credit breakdown. A "Full recap" link goes to the existing `/games/:roomId/:gameNo` screen.
- Detail is fetched when a row is first opened and kept for the rest of the page's life; reopening does not refetch. A failed fetch shows a short error with a retry in that row only.
- en and zh-Hans copy for every new string.

## Non-goals
- No backend or API changes (the backend lives in the separate PP-AI-Service repo).
- No round-by-round replay of statements and votes: it needs stored data that doesn't exist (see the 2026-11-13 history design, non-goals).
- No fetching of details for all rows on load.
- The existing detail screen `GameDetail.tsx` keeps working as it is.

## Constraints
- Reuse `getMyGameDetail` in `src/games/api.ts` and the `GameDetail`/`GameSummary` types; reuse the word and credit presentation from `GameDetail.tsx` and `CreditBurst` where it can be shared without copying.
- The word is shown in the viewer's language with the same fallback as `GameDetail.tsx` (`wordFor`).
- Rows are keyboard operable: the toggle is a button with `aria-expanded`.
- Works at 320px with no horizontal scroll.

## Approaches
- A (chosen): expand in place, fetch on first open. Fewest requests, quick to scan, keeps the full page for links.
- B: only polish the detail screen. Smallest change, but detail stays one page away from the list.
- C: show details on every row up front. Needs up to 20 requests on load, or a backend change, so it isn't cheap.

## My calls (not yet confirmed by you)
- Several rows may be open at once.
- A "Full recap" link stays in each expanded row.
- Shared presentation is extracted into a small component only if `GameDetail.tsx` and the new row can use it as is; otherwise the row gets its own small view.

## Left to the builder
Component structure and file names, CSS in `src/styles`, exact i18n key names, and tests (`Profile.test.tsx`: toggle, fetch once, error and retry, own-word marking, bot marking).
