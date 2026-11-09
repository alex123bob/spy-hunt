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
