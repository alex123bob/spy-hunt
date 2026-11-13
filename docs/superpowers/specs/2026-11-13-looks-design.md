# Player looks and clan badge builder — design

## Why
Players asked to personalise avatars and clan badges. Photo uploads were ruled out
(moderation load, privacy of real faces in a hidden-identity game, upload infra).
Everything here is picked from curated presets, so every combination is safe.

Today human players have no avatar (first letter of their name), only bots get an
emoji + colour, clans pick one of 12 fixed emoji+colour badges, and ranks unlock nothing.

## Goals
- Every player (guest or account) can pick an avatar: emoji + colour + frame.
- Ranks unlock extra emojis and frames — a reason to keep earning credits.
- Clan creators build their badge from any emoji × any colour; the leader can change it later.

## Non-goals / anti-goals
- No uploads, no free text, no user-drawn images.
- No spending credits (unlocks are by lifetime rank, which never goes down).
- Bots keep their own avatar picker and get no frames.

## Approaches considered
1. **Store the look per player, copy into the room's `players` row on join** (picked).
   Rooms already carry `avatar_emoji/avatar_color`; adding `avatar_frame` keeps every
   snapshot/event path unchanged. A look change re-announces the player in live rooms,
   the same way clan badge changes already do.
2. Look up the look at render time in `public_player` — one more query per snapshot and
   every event; rejected.
3. Client-only (localStorage) — others would never see it; rejected.

## Design
- **Catalog (server is the source of truth, `looks.py`)**
  - Emojis: the 24 bot emojis free; 4 more unlock at each rank 1–5.
  - Colours: the 6 existing ones, free.
  - Frames: `none` (rank 0), `leaf` (1), `ribbon` (2), `star` (3), `gold` (4), `crown` (5).
- **Storage:** `player_looks(player_id PK, emoji, color, frame, updated_at)`; `players.avatar_frame`.
- **API:** `GET /looks` → `{emojis:[{emoji,rank}], colors, frames:[{key,rank}], rank, mine}`;
  `PUT /looks {emoji,color,frame}` validates the choice and the rank, saves, refreshes
  live rooms. Guests allowed (they have credits and ranks too).
- **Join:** a human with a saved look gets it copied into their seat.
- **Clan badges:** `POST /clans` also accepts `badge: {emoji, color}` from the larger set
  (old index form still works); `PUT /clans/badge` lets the leader change it, refreshing
  members' live rooms.
- **UI:** Profile page gets a "Your look" picker (locked items show 🔒 + rank needed).
  `Avatar` renders the frame as a CSS ring. Clan create form becomes emoji grid +
  colour swatches with a live preview; leader sees "Change badge" on the clan page.

## Left to the builder
Exact extra emojis, frame CSS, copy.
