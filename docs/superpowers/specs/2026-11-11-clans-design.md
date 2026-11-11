# Clans: weekly seasons and rivalries — design

Date: 2026-11-11. Source: brainstorm record §5 loop 3, phase 4. Builds on the accounts spec.
Status: draft. The user said "use your best judgement" for every open point, so every decision below is **my call** unless marked otherwise. The user's only stated input: "I've played Clash Royale, which has a clan and it's fine."

## Intent

Give registered players a reason to come back that is social rather than solitary. A clan is a small group whose everyday play adds up to a shared weekly score, set against one rival clan. The player should feel "my game just helped my clan", and see a clanmate's streak or a rival's lead and want to play one more.

## Goals

- Create, join, and leave a clan. Registered accounts only.
- Finished games and the daily puzzle add points to the player's clan.
- Weekly seasons: each clan faces one rival of similar size, and the higher score wins the week.
- A clan page showing the season score, per-member contributions, the rival's score, and recent weeks.
- A clan badge next to the player's name in the lobby and on the result screen.

## Non-goals

Clan chat, donations, clan-only rooms, promotion tiers or leagues, global leaderboards, clan roles beyond leader/member, kicking, clan merging, moderation tooling, push notifications, rewards or cosmetics for winning (a good follow-up for bot dress-up).

## Anti-goals

- Guests must not be pressured or blocked; the guest experience is unchanged. Only a soft "register to join a clan" prompt, shown where the nudges already live.
- Points must not reward farming: no extra points for bot-only rooms or abandoned games (below).
- A clan must not be a way to see private game information (roles, words). It exposes counts only.

## Decisions (my calls)

1. **Membership.** One clan per account. Max 30 members. A clan has a name (3-20 chars, unique case-insensitively), a badge (emoji + colour chosen from a fixed list, reusing the avatar palette), and an invite code. Join by code, or from a list of up to 20 open clans that have room (newest first). Clans are open by default: anyone with the code or on the list can join. Leader = creator. If the leader leaves, the longest-standing member becomes leader; if the last member leaves, the clan is deleted. A player who leaves keeps nothing; points already added stay with the clan.
2. **Points.** Each finished game with at least 2 human players earns the player: 10 for taking part, +10 more for being on the winning side. The daily puzzle earns 10 when finished and +10 when solved. Bot-only or single-human rooms and games that ended with no winner (abandoned) earn 0. Capped at 100 points per player per day, so spamming rematches can't dominate. Points go to the clan the player belongs to *at the moment of the game*.
3. **Seasons.** One week, Monday 00:00 to Sunday 24:00 UTC, matching the daily puzzle's UTC days. Created lazily: the first request in a new week closes the previous week and pairs clans. No scheduler.
4. **Pairing.** At week start, clans with at least 3 members that were active in the previous week (any points) are sorted by member count then name hash and paired with the neighbour. An odd one out faces a "ghost" with a score that is the average of this week's other clans, floored at 50, so a lone clan still has something to beat; ghost results are labelled as such. Clans with fewer than 3 members still earn points and show a personal season total, but have no rival. Members who join mid-week count from joining.
5. **Result.** Higher total wins; a tie is a draw. Win streak per clan. Closed weeks are kept and the clan page shows the last 8.
6. **Where it shows.** A "Clan" entry in the top bar (registered users). Clan page: badge and name, invite code, this week (your score vs. rival's, time left), a member list sorted by this-week points, last 8 weeks. Badge appears next to the player name in the lobby seat list and the result screen. Lobby/result only gain the badge field, which is public.
7. **Privacy.** Only clan name, badge, member display names, and point counts are exposed. Members are identified by the display names they already use in rooms (the last name used by the account; fall back to "Player"). Emails never leave `/me`.
8. **How.** Same stack and conventions as accounts: new tables in the backend `db.py` (`clans`, `clan_members`, `clan_points`, `clan_weeks`), new module `clans.py`, new routes under the existing blueprint using `require_guest` and the existing rate-limit scopes; frontend screen plus top-bar entry, i18n in `en` and `zh-Hans`. Point awards hook into `game._finish` and the daily result path, in the same transaction.

## Calls added after the builder check (all mine)

- **Leavers.** Points are stored against the clan and the week, with the player id kept for the member list. A leaver's points stay in the clan's total, and they disappear from the member list. Someone who leaves and rejoins gets no points back.
- **No-rival clans** (under 3 members, or not active last week). The rival panel is replaced by a short line: "Get to 3 members to face a rival next week." The season total still shows.
- **Draws.** A draw leaves the win streak unchanged. It is neither a win nor a loss. Only a loss resets the streak to 0.
- **History labels.** Each of the last 8 weeks shows Won, Lost, or Draw, plus both scores. A ghost opponent is shown as "Practice rival", and a win against one counts toward the streak like any other win.
- **Leader succession.** Tenure is measured from a stored `joined_at` on the member row, and the earliest `joined_at` takes over.

## Constraints

- Both repos; backend deployed before frontend; schema changes are additive and idempotent in `init_db()`.
- Guest tokens, `player_id` stability and the Bearer format stay untouched.
- Rate limits on create/join (reuse `action`) and on the clan list (reuse `read`).
- Point awards must be idempotent per game and per daily puzzle (a retried `_finish` must not double count).

## Left to the builder

Table layout details and indexes, the exact badge list, the route shapes, how "active" and "member since" are stored, the visual layout of the clan page within the existing design system, and i18n wording.

## Success

A group of 3-5 friends can create a clan, play a week, and see on Monday whether they beat another clan, with all of it working for logged-in users and invisible to guests apart from an optional prompt.
