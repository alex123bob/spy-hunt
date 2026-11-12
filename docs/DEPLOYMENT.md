# Deployment

Production runs on the GCP server at `https://lijialab.com`:

- **Backend:** PP-AI-Service (Flask, port 8000) behind Nginx, routes under `/api/spy-hunt/*`.
- **Frontend:** this repo's static build, served by Nginx at `/spy-hunt/`.

Page and API share one origin, so there is no CORS and the existing HTTPS certificate covers both.

Full Nginx config for reference: [nginx.conf.example](nginx.conf.example).
Day-to-day usage: [README](../README.md).

**Checklist (first deployment):** backend pulled and restarted (§1) → Nginx block added and reloaded (§2) →
run the release workflow on GitHub, then `./server-deploy.sh` on the server (§3).

## 1. Backend (PP-AI-Service)

Needed whenever `ai_svc/spy_hunt` changes.

1. On the server, pull the latest code:

   ```bash
   cd <path-to>/PP-AI-Service && git pull
   ```

2. Restart Flask:

   ```bash
   ./stop.sh && ./start.sh        # logs: ~/ppaiservice.log (or flask.log, see start.sh)
   ```

3. Verify:

   ```bash
   curl -i https://lijialab.com/api/spy-hunt/health
   ```

No Nginx change is needed for the backend; `location /api` already proxies to `localhost:8000`, and the
SSE route (`/api/spy-hunt/rooms/<code>/events`) gets its own block so the stream isn't buffered (see §2).

## 2. Nginx (one-time)

Only this project's blocks are needed. Add them inside the existing `server { listen 443 ssl; ... }` block
(anywhere, e.g. next to `/hear-the-color`; Nginx matches the longest matching prefix location, so these win
over the catch-all `location /`). Don't replace the whole config. [nginx.conf.example](nginx.conf.example) is
a full reference copy of the production file with these blocks marked, so you can see where they sit.

```nginx
# SSE stream: a regex location wins over the plain-prefix "location /api" below, so this is
# what actually serves the stream. Without it, Nginx's default 60s read timeout and response
# buffering would silently kill or delay live game updates.
location ~ ^/api/spy-hunt/rooms/[^/]+/events$ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 3600s;
}

location = /spy-hunt {
    return 301 /spy-hunt/;
}
location /spy-hunt/ {
    alias /home/alex123bobo/spy-hunt/dist/;
    index index.html;
    # Client-side routes (/spy-hunt/r/ABCD, /spy-hunt/daily, ...) must fall back to index.html.
    try_files $uri $uri/ /spy-hunt/index.html;
}
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Nginx (user `www-data`) must be able to read `dist/`, so every parent folder needs the execute bit, e.g.
`chmod o+x /home/alex123bobo`. If you'd rather not open your home folder, copy `dist/` to a path such as
`/var/www/spy-hunt/` after each build and point `alias` there instead.

## 3. Frontend (every release)

The server needs **no Node**: releases are built by GitHub Actions and the server only downloads the result.
The build is produced with `VITE_BASE_PATH=/spy-hunt` (set in the workflow) so asset URLs, the router's
`basename`, and the share/QR-code links all resolve under `/spy-hunt/` instead of domain root.

**One click, no laptop step:** on GitHub, **Actions -> release -> Run workflow**, branch `main`, pick a
bump (`patch`/`minor`/`major`, default `patch`). The workflow runs the tests, bumps the version in
`package.json` (committed and pushed to `main` as `github-actions[bot]`), builds the app, creates the
`vX.Y.Z` tag on that commit, and publishes `spy-hunt-dist.tar.gz` as a GitHub Release asset.
(Pushing a `v*` tag by hand also triggers a release, using whatever `main` is at — it skips the version
bump, so use it only to re-publish an existing version, not for a normal release.)

**On the server** (needs only `curl` and `tar`):

```bash
# first time: fetch the script (or git clone the repo, the script is in scripts/)
mkdir -p /home/alex123bobo/spy-hunt && cd /home/alex123bobo/spy-hunt
curl -fsSLO https://raw.githubusercontent.com/alex123bob/spy-hunt/main/scripts/server-deploy.sh
chmod +x server-deploy.sh

# every release
./server-deploy.sh              # latest release, or: ./server-deploy.sh v0.2.0
```

Layout it maintains under `/home/alex123bobo/spy-hunt`: `releases/<tag>/` (the 5 newest are kept) and a
`dist` symlink to the live one. Nginx serves `dist/`, so switching versions is instant and needs no reload.
**Rollback** is just `./server-deploy.sh <older-tag>`. If `dist/` already exists as a real folder from an
earlier manual copy, the script stops and tells you to move it away first.

The repo is public, so no token is needed to download releases.

Open <https://lijialab.com/spy-hunt/> on your phone. Hard-refresh if you still see an old version.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Blank page, 404s for `assets/...` | `alias` path in Nginx is wrong (it must end in `/dist/`, the symlink), or the build wasn't produced with `VITE_BASE_PATH=/spy-hunt` |
| Refreshing `/spy-hunt/r/ABCD` 404s | `try_files` in the `/spy-hunt/` block is missing the `/spy-hunt/index.html` fallback |
| 403 / 404 on the page | Nginx user can't read the folder: check permissions on `/home/alex123bobo` and `spy-hunt` |
| Live game updates stop or lag | The SSE regex location (events route) isn't reloaded, or something upstream is buffering — check `proxy_buffering off` is actually in effect (`curl -N` the stream) |
| QR code / share link points to the domain root instead of `/spy-hunt/...` | Build wasn't produced with `VITE_BASE_PATH=/spy-hunt` |

## Rolling back

- **Frontend:** `./server-deploy.sh <previous-tag>` on the server (instant, no rebuild).
- **Remove the app:** delete the Nginx `location /spy-hunt` and SSE regex blocks and reload; `/api/*` for
  other projects is unaffected.
