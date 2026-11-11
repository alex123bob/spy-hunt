# Spy Hunt (front end)

Mobile-first web app for the Spy Hunt word game. React + TypeScript + Vite; talks to the Flask back end in `PP-AI-Service` (`ai_svc/spy_hunt`).

## Develop

    yarn install
    yarn dev          # http://localhost:5173, /api proxied to http://localhost:8000
    yarn test         # Vitest
    yarn build        # type-check + production build into dist/

`API_PROXY=http://host:port yarn dev` points the dev proxy elsewhere. `VITE_API_BASE` sets the API base at build time (default `/api/spy-hunt`).

## End-to-end smoke test

Starts a throwaway back end (fake LLM, temp DB, port 8010) and the dev server (port 5174), then plays a full game with two browsers and bots.

    yarn playwright install chromium
    BACKEND_DIR=../PP-AI-Service yarn e2e

`BACKEND_DIR` must contain a `venv/` with the back-end dependencies. If Playwright's browser download is unavailable, set `CHROMIUM_PATH` to an existing Chrome/Chromium binary.

## Deploy (Nginx)

Serve `dist/`, proxy `/api/`, and fall back to `index.html` so `/r/<code>` links work.

    server {
        root /var/www/spy-hunt/dist;

        location / {
            try_files $uri /index.html;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Server-Sent Events: no buffering, long read timeout
        location ~ ^/api/spy-hunt/rooms/[^/]+/events$ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header X-Real-IP $remote_addr;
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 3600s;
        }
    }

The back end must run as a single process (see its README).

## Daily puzzle

`/daily` is a Wordle-style puzzle: everyone gets the same bot-vs-bot transcript each UTC day.
Read it, tap the spy (two tries), optionally pick the spy's word, then share an emoji result card.
The landing page has a "Daily Spy Hunter" card that shows your streak and whether you are done today.

- **Streaks** live in the browser (`localStorage`, key `spy-hunt.daily`): current, best and a per-day history. Clearing browser data clears them.
- **Scoring and timing** are done on the server; the answer is never sent before you finish.
- **Puzzles** come from a queue on the backend. To refill it, run `python -m ai_svc.spy_hunt.scripts.build_puzzles --count 14` in the backend repo (uses the real model). `--review` lists the ready puzzles with answers and `--veto ID` drops one. With no puzzle ready, `/daily` shows "come back soon".
- The e2e backend (`e2e/backend.py`) seeds one fixed puzzle (spy Pip, word "organ") so `e2e/daily.spec.ts` can run with the fake model.

## Accounts

Guest play needs no signup. The corner link ("Register / log in") opens a small modal:

- **Register** attaches an email and password to the guest you already are, so your name, bots, streak and history all stay. The nudge banners (a 3-day streak, a win, a third visit) are gentle, dismissible reminders; nothing ever blocks play.
- **Log in** on another device picks up the same bots, streak and history. It does not sign out your other devices.
- **Log out** signs out only the device you press it on.

The daily streak is computed by the server from your finished puzzles, so it follows you across devices. There is no email verification and no password reset in this version.

## Clans

Signed-in players see a **Clan** link in the top bar (`/clan`). You can start a clan (a name and a badge), join one with its 6-character invite code, or pick one from the list of open clans. One clan per account, and up to 30 members.

Every finished game with at least 2 people gives each person 10 points, plus 10 for the winning side. Finishing the daily puzzle gives 10, plus 10 if you found the spy. Each player can earn at most 100 points a day. Weeks run Monday to Sunday (UTC). Clans with 3 or more members that scored last week are paired with a rival of similar size, and an odd one out faces a practice rival. The clan page shows this week's score against the rival, time left, the win streak, each member's points, and the last 8 weeks. Your clan's badge appears next to your name in rooms and on the result screen.

## Bots

Each guest can dress up to 3 bots at `/bots`: a name, an emoji avatar and colour, and three outfit slots (voice, clue style, quirk) that change how the bot plays.
Up to 3 rule cards per bot ("When I am accused → vote for who voted for me") add situational behaviour on top of the outfit.
Every bot has a public page at `/bot/:id` showing its outfit and record (games, wins, times it fooled the table), which you can share by link.
In a lobby, "Add my bot" seats one of your bots; the room keeps its own copy, so later edits or deletion never affect a running game.
Anyone can remix a bot with the Remix button on its page: the form opens pre-filled, the copy credits "Remixed from X", and the original shows how many times it was remixed (counted once per guest).
The board at `/top` ranks bots by ranked games, which need 3+ humans in the room; a bot needs 10 games to be a top winner and 5 as a spy, its ranking resets when its outfit changes, and owners can hide a bot from the board.
Each night bots join a daily arena match against other bots; the "Let my bot play in the daily arena" checkbox in the bot form opts out. Recaps ("While you were away") wait for your next visit to `/bots`, match pages at `/match/:id` are public and show no owner, and arena games never count for the top bots board.
Both routes are client-side, so the Nginx `try_files` fallback above already covers them.
