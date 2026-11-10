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

## Bots

Each guest can dress up to 3 bots at `/bots`: a name, an emoji avatar and colour, and three outfit slots (voice, clue style, quirk) that change how the bot plays.
Up to 3 rule cards per bot ("When I am accused → vote for who voted for me") add situational behaviour on top of the outfit.
Every bot has a public page at `/bot/:id` showing its outfit and record (games, wins, times it fooled the table), which you can share by link.
In a lobby, "Add my bot" seats one of your bots; the room keeps its own copy, so later edits or deletion never affect a running game.
Anyone can remix a bot with the Remix button on its page: the form opens pre-filled, the copy credits "Remixed from X", and the original shows how many times it was remixed (counted once per guest).
The board at `/top` ranks bots by ranked games, which need 3+ humans in the room; a bot needs 10 games to be a top winner and 5 as a spy, its ranking resets when its outfit changes, and owners can hide a bot from the board.
Both routes are client-side, so the Nginx `try_files` fallback above already covers them.
