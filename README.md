# bore-hora-hai-yaar 😴🎮

A friends-first browser gaming site: 15 original, fully playable games, guest profiles without email or passwords, per-game leaderboards, offline play, and a Supabase backend for shared records. Built with React + Vite + TypeScript + Tailwind and deployable on Netlify.

> **Phase 1 only.** The OTT/entertainment section is intentionally **not** included. The navigation (`NAV_ITEMS` in `src/components/layout/AppShell.tsx`) and the game catalogue (`src/games/registry.ts`) are data-driven so new sections can be added later.

---

## Contents

1. [Games](#games)
2. [Quick start](#quick-start)
3. [Scripts](#scripts)
4. [Environment variables](#environment-variables)
5. [Supabase setup](#supabase-setup)
6. [Loop Sort admin PIN](#loop-sort-admin-pin)
7. [Deploying to Netlify](#deploying-to-netlify)
8. [Testing](#testing)
9. [Architecture](#architecture)
10. [Player identity](#player-identity)
11. [Leaderboards & scoring](#leaderboards--scoring)
12. [Offline behaviour](#offline-behaviour)
13. [Security & anti-cheat](#security--anti-cheat)
14. [What is verified and what is not](#what-is-verified-and-what-is-not)
15. [Troubleshooting](#troubleshooting)

---

## Games

| # | Game | Modes | Leaderboard |
|---|------|-------|-------------|
| 1 | **Ludo** | 1-4 local humans + bots (easy/medium/hard) | Solo matches, per bot difficulty, total points |
| 2 | **Snake Battle** | Solo | Best score |
| 3 | **Tic-Tac-Toe** | vs computer (easy/medium/minimax hard), local 2P | vs computer, per difficulty, wins then draws |
| 4 | **2048 Challenge** | Solo | Best score, then best tile |
| 5 | **Dino Run** | Solo | Best score |
| 6 | **Brick Breaker** | Solo, 3 walls, 3 lives | Best score, then wall |
| 7 | **Udta Panchi** (flap-and-dodge) | Solo | Best score |
| 8 | **Pong** | vs computer (3 levels), local 2P | Solo only, per difficulty, wins then point difference |
| 9 | **Memory Match** | Solo, local 2P; 7/11/15 pairs | Solo, per difficulty, fastest time then fewest moves |
| 10 | **Tetris Classic** | Solo | Best score, then lines |
| 11 | **Sudoku Classic** | Easy/medium/hard | Per difficulty, fastest time then fewest mistakes |
| 12 | **Skater Boy** (inspired) | 90-level campaign (Town / Forest / Cemetery) | Levels completed, then summed best level scores |
| 13 | **Typing Racer** | Easy/medium/hard vs 3 rival cars | Per difficulty, WPM then accuracy |
| 14 | **Loop Sort** (inspired) | 60 levels, Normal + Admin Mode | None (see below) |
| 15 | **Arrow Go** (inspired) | 60 levels | Levels completed, then hearts kept |

Full rules, scoring models and design notes for every game: **[docs/GAMES.md](docs/GAMES.md)**.

All artwork is drawn in code (SVG/Canvas), all sounds are synthesised with WebAudio, all text and levels are original. No proprietary assets, source code or level data were used.

---

## Quick start

Requirements: **Node 20.19+** (Node 22/24 recommended) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Supabase variables the site runs in **local-only mode**: every game is playable, results and progress are stored in this browser, leaderboards show "your best on this device" and clearly say the online leaderboard is not configured.

To enable the shared backend, copy `.env.example` to `.env.local`, fill in the two public values (see [Supabase setup](#supabase-setup)) and restart `npm run dev`.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build into `dist/` |
| `npm run preview` | Serve the production build (with SPA fallback) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint over `src` and `tests` |
| `npm test` | Vitest: unit tests, React integration tests and the database tests (PGlite) |
| `npm run test:e2e` | Playwright browser tests (builds + previews automatically) |
| `npm run check:secrets` | Scans `dist/` for service-role keys, PINs and other secrets |
| `npm run levels:generate` | Regenerates and re-verifies the 60 Loop Sort levels (`src/games/loop-sort/levels.json`) |

## Environment variables

| Name | Where | Secret? | Purpose |
|------|-------|---------|---------|
| `VITE_SUPABASE_URL` | Netlify + `.env.local` | No (public) | Your project URL, e.g. `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Netlify + `.env.local` | No (public, RLS-protected) | The project's **anon / publishable** key |

That is all the frontend needs. **Never** put the service-role key, a secret API key, or the admin PIN in any `VITE_` variable; Vite inlines `VITE_` values into the public bundle. The app never needs the service-role key at all, because all privileged logic runs inside Postgres as `SECURITY DEFINER` functions. The admin PIN lives in the database (hashed).

## Supabase setup

1. **Create a project** at https://supabase.com/dashboard (any region near your friends).
2. **Enable anonymous sign-ins**: *Authentication → Sign In / Providers → "Allow anonymous sign-ins"* → on. Guest players are Supabase anonymous users. Without this, registration fails with a clear message in the UI.
   - Optional: under *Authentication → Attack Protection*, enable CAPTCHA if you ever expect abuse. Anonymous sign-ins are rate limited per IP by Supabase (default 30/hour).
3. **Run the migrations** in order. Either:
   - **SQL editor** (simplest): open *SQL Editor*, paste and run each file from `supabase/migrations/` in filename order (`…000001_core_schema.sql` → `…000005_grants.sql`). They are idempotent, so you can re-run them.
   - **Supabase CLI**:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
4. **Set the Loop Sort admin PIN** (next section).
5. **Copy the public keys**: *Project Settings → API* → Project URL and the `anon`/publishable key → put them in `.env.local` locally and in Netlify's environment variables.

What the migrations create:

- Tables: `players`, `player_code_credentials`, `player_devices`, `games`, `game_sessions`, `game_scores`, `game_progress`, `ludo_match_results`, `loop_sort_progress`, `loop_sort_lives`, `loop_sort_admin_sessions`, `loop_sort_events`, plus `private.settings` and `private.rate_limits`.
- **RLS is enabled on every table.** API roles get only harmless `SELECT`s (public nicknames and scores; a player's own progress). All writes go through RPC functions; direct `INSERT/UPDATE/DELETE` is revoked.
- RPC functions (callable with the anon key + the anonymous user's JWT): `register_player`, `me`, `recover_player`, `rename_player`, `rotate_player_code`, `forget_device`, `start_game_session`, `submit_score`, `save_progress`, `get_progress`, `get_leaderboard`, `get_my_leaderboard_position`, `get_my_stats`, `loop_sort_state`, `loop_sort_enter_admin`, `loop_sort_exit_admin`, `loop_sort_select_level`, `loop_sort_apply_events`.
- Everything in the `private` schema (settings, rate limits, PIN/pepper helpers) is not callable from the API.

### Tunables

```sql
-- Loop Sort lives (defaults: 5 lives, one every 20 minutes)
update private.settings set value = '5'    where key = 'loop_sort_max_lives';
update private.settings set value = '1200' where key = 'loop_sort_regen_seconds';
-- how long an admin session lasts on a device (hours)
update private.settings set value = '12'   where key = 'loop_sort_admin_session_hours';
```

The Play Store listing does not state the original game's life count or refill time, so these are documented defaults; change them here without redeploying.

## Loop Sort admin PIN

The PIN is chosen by you, stored only as a bcrypt hash in `private.settings`, verified server-side and never shipped to the browser. Set it (or change it later) in the SQL editor:

```sql
select private.set_loop_sort_admin_pin('your-pin-here');  -- 4-32 characters
```

It stays the same until you run that statement again. Until a PIN is set, the Admin button reports that admin mode is not configured. Wrong attempts are rate limited: 5 per device per 15 minutes, 10 per player per hour, and 20 per IP per hour. Failed attempts are counted even though the call does not error.

## Deploying to Netlify

`netlify.toml` already configures everything:

- Build command: `npm run build && npm run check:secrets`
- Publish directory: `dist`
- SPA fallback: `/* → /index.html (200)`, so direct links and refreshes like `/games/ludo` work. `public/_redirects` contains the same rule as a fallback.
- Long-term caching for hashed assets plus basic security headers.

Steps:

1. Push this folder to a Git repository (GitHub/GitLab/Bitbucket).
2. In Netlify: *Add new site → Import an existing project*, pick the repo. The build settings are read from `netlify.toml`.
3. *Site configuration → Environment variables*: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. After the first deploy, open a deep link (e.g. `https://<site>.netlify.app/games/sudoku`) and refresh to confirm SPA routing.

Alternatively with the CLI: `npx netlify deploy --build --prod` (after `npx netlify login` and linking the site).

## Testing

```bash
npm test            # 122 unit + integration + database tests (Vitest)
npm run test:e2e    # browser tests on desktop, phone and 320px widths (Playwright)
npm run lint
npm run build && npm run check:secrets
```

- **Game logic** (`tests/unit`): rules for all 15 games: Ludo sixes, three-sixes, captures, safe squares, exact home, bots and match end; Sudoku uniqueness; 2048 merges; snake reversal protection; minimax "never loses" (exhaustive); Arrow Go lane blocking and all 60 levels solvable; Loop Sort rules plus every shipped level replayed against its stored solution; Skater Boy physics plus an autopilot that finishes all 90 levels; and more.
- **Database** (`tests/integration/db.test.ts`): runs the real migrations in an in-process Postgres (**PGlite** with pgcrypto) with a stubbed `auth` schema. Covers registration, code hashing, recovery, rate limits, rotation, RLS/permission denials, score validation, idempotent submissions, leaderboard ranking, progress merge, Loop Sort lives regeneration from the server clock, admin PIN, admin/normal switching and cross-device state.
- **React integration** (`tests/integration/app.test.tsx`): onboarding, all routes, search/filters, every game page loads, local-only leaderboards, and a full Memory Match game played to the end.
- **E2E** (`tests/e2e`): no horizontal overflow at 320px / phone / desktop, deep links load directly (SPA fallback), every game starts without console errors, a local Tic-Tac-Toe game, and leave-confirmation.
  - Playwright uses the installed **Microsoft Edge** (`channel: msedge`), so no browser download is needed on Windows. Use `PW_CHANNEL=chrome npm run test:e2e`, or `npx playwright install chromium` and `PW_CHANNEL=chromium`.

## Architecture

```
src/
  app/                 App, providers, router (all routes; game pages lazy-load)
  components/
    layout/            AppShell (header, mobile bottom nav, offline banner)
    game/              GameShell (start/pause/results), CanvasStage, touch controls, game cards
    ui/                Button, Modal/ConfirmDialog, Segmented, Toggle, Badge, ...
  features/
    home/              Home, All Games (search + category filter), game page, 404
    player/            PlayerContext (guest identity), onboarding + code modals, recovery page
    profile/           Profile & stats
    leaderboards/      Per-game leaderboard pages
    settings/          Sound, vibration, reduced motion, on-screen controls
  games/
    registry.ts        Catalogue: metadata, category, leaderboard config, lazy component
    <game>/logic.ts    Pure, tested game rules (no React)
    <game>/index.tsx   UI for that game
  hooks/               game loop (rAF), keyboard, swipe, stopwatch, leave guard, results store
  lib/                 supabase client + rpc wrapper, offline queue, scoring mirror, progress merge, sound, rng
  styles/              Tailwind theme + global styles
supabase/migrations/   SQL schema, RLS, RPC functions
scripts/               level generator, bundle secret scanner
tests/                 unit, integration (React + DB), e2e
```

**Adding a game:** create `src/games/<id>/index.tsx` (default export) and, ideally, `logic.ts` with tests; add one entry to `GAMES` in `registry.ts`. For a leaderboard, add the game to `public.games` and a validation branch in `private.validate_score` (new migration), and mirror it in `src/lib/scoring.ts`.

## Player identity

- First visit: pick a nickname (2-20 chars; duplicates allowed, so players are identified by id, never by nickname).
- With the backend, the browser signs in anonymously and calls `register_player`. The server creates the player and a private code like `BHHY-XXXX-XXXX-XXXX-XXXX` (80 bits of randomness) and returns it **once**. The UI makes you copy or save it before closing.
- The code is stored only as an HMAC with a random server-side pepper. It never appears in leaderboards, URLs or local storage.
- **Another device:** *Recover player* → enter the code → that browser is linked to the same player. Attempts are rate limited per device and per IP.
- **Lost code but still have a linked device:** *Profile → Generate a new code* (the old code stops working).
- **Lost both the code and every linked device:** the profile cannot be recovered. The UI says so plainly.
- Offline first visit: a local profile is created and registered automatically once online; locally saved results are re-keyed to the new id.

## Leaderboards & scoring

Every game has its own leaderboard, and each mode or difficulty is a separate board. There is no combined ranking. Ranking rules (implemented in SQL, mirrored in `src/lib/scoring.ts`):

| Game | Board | Rank by |
|------|-------|---------|
| Ludo | bot difficulty | total points (1st 10, 2nd 5, 3rd/4th 0), then wins. Solo matches only |
| Tic-Tac-Toe | difficulty | wins, then draws (vs computer only) |
| Pong | difficulty | wins, then total point difference (solo vs computer only) |
| Memory Match | difficulty | best time asc, then moves asc (solo only) |
| Sudoku | difficulty | best time asc, then mistakes asc |
| Typing Racer | difficulty | best WPM, then accuracy (completed races) |
| Snake, Dino, Udta Panchi | classic | best score |
| 2048 | classic | best score, then best tile |
| Tetris | classic | best score, then lines |
| Brick Breaker | classic | best score, then wall reached |
| Skater Boy | campaign | levels completed, then sum of best level scores |
| Arrow Go | classic | levels completed, then hearts kept |
| Loop Sort | - | **no leaderboard**: Admin Mode can open and complete any level, so a ranking would be meaningless |

Local multiplayer results are never sent to leaderboards. No points are awarded for unrelated actions (e.g. Ludo captures give an extra turn, not points).

## Offline behaviour

- Every game except Loop Sort Admin Mode works offline. Game code is lazy-loaded, so open a game once while online, or keep the tab open.
- Finished results are written to local storage first with a unique `submissionId`, then sent to the server. If offline they stay **pending**: you'll see "Saved on this device - will sync when online" and a pending count on the profile. They are retried on reconnect, on tab focus and every minute. The server ignores ids it already has, so retries never duplicate.
- Level progress (Skater Boy, Arrow Go) merges deterministically on both sides: completed levels are unioned and each level keeps the maximum best score. Devices can sync in any order.
- Loop Sort online mode: failures and completions are queued as idempotent events. The device never regenerates lives on its own clock; regeneration happens only when the server is reached.
- Shared leaderboards and cross-device sync obviously need a connection; offline screens say so.

## Security & anti-cheat

This is a casual site; the browser runs the games, so a determined cheater can always fake a client result. What is protected:

| Protection | How |
|------------|-----|
| No service-role key anywhere in the frontend | All privileged logic is `SECURITY DEFINER` SQL. `npm run check:secrets` scans the bundle |
| Players cannot modify others' data | RLS on every table, writes revoked, RPCs derive the player from `auth.uid()` |
| Private codes | Only HMACs stored; generated server-side; shown once; rate-limited recovery; rotation |
| Admin PIN | bcrypt hash in a private table; server verification; rate limits; admin sessions per device with expiry |
| Loop Sort lives | Server clock only (`now()` in Postgres); row locks serialise concurrent updates; events idempotent |
| Score structure & ranges | `private.validate_score` checks types, ranges and consistency per game (Ludo points match position, Pong scores match the target, Memory pairs match difficulty, plausible minimum times, WPM equals the formula, 2048 tile is a power of two, ...). Rank keys are computed server-side |
| Replay/duplicate | Unique `submission_id`; each server game session can back exactly one result; durations must fit the session window |
| Abuse | Rate limits on registration, recovery, renames, code rotation, sessions, scores, progress and Loop Sort events |

**Still trusts the client** (documented, not hidden): the actual gameplay of every game. A modified client can submit any result that passes the range and consistency checks: arcade high scores, Sudoku/Memory times above the minimum, Typing WPM ≤ 250, Skater/Arrow Go level completion, and Loop Sort ability usage. Server game sessions only stop durations longer than the real session. Treat leaderboards as friendly, not tournament-grade.

## What is verified and what is not

- ✅ Build, type-check and lint pass; 122 Vitest tests and the Playwright suite pass locally (Windows, Edge).
- ✅ The SQL migrations run and behave correctly against real Postgres (PGlite) in tests.
- ⚠️ **Not yet run against a live Supabase project.** No credentials were available while building. The schema targets standard Supabase (`auth.uid()`, `anon`/`authenticated` roles, `extensions.pgcrypto`, anonymous sign-ins), but please do one smoke test after setup: create a profile, finish a game, check its leaderboard, recover on a second browser, and try the admin PIN.
- ⚠️ Not yet deployed to Netlify (needs your account). Config is in place, and SPA fallback was verified with `vite preview`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Leaderboards say "Online leaderboard not configured" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing at **build time**. Set them in Netlify and redeploy (or in `.env.local` and restart dev) |
| "The backend has anonymous sign-ins disabled" | Enable anonymous sign-ins (Supabase setup, step 2) |
| `permission denied for function ...` | Run `…000005_grants.sql` again (it re-applies grants after new functions) |
| "Admin PIN has not been set up" | Run `select private.set_loop_sort_admin_pin('...');` |
| "Too many attempts" | Rate limit window; wait 15 minutes |
| 404 on refresh at `/games/...` | Make sure `netlify.toml` / `public/_redirects` are deployed; publish dir must be `dist` |
| Results stuck as "waiting to sync" | You're offline, or the server rejected them (Profile shows rejected ones). Pending ones retry automatically |
| Banner "This browser lost its link to your profile" | Browser storage was cleared. Use *Recover player* with your code |
| E2E tests can't find a browser | Install Edge/Chrome, or `npx playwright install chromium` and set `PW_CHANNEL=chromium` |
