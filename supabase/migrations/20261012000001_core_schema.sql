-- bore-hora-hai-yaar: core schema
-- Identity model: every browser signs in with Supabase *anonymous auth* (auth.uid()).
-- A browser (auth user) is linked to a guest `player` through `player_devices`.
-- A private player code (shown once) lets another browser link itself to the same player.
--
-- All writes go through SECURITY DEFINER functions below. Tables have RLS enabled and
-- expose only harmless SELECTs, so players can never edit each other's rows directly.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Private settings (pepper for player codes, admin PIN hash, tunables).
-- Never readable by anon/authenticated roles.
-- ---------------------------------------------------------------------------
create table if not exists private.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into private.settings (key, value)
values
  ('player_code_pepper', encode(extensions.gen_random_bytes(32), 'hex')),
  ('loop_sort_max_lives', '5'),
  ('loop_sort_regen_seconds', '1200'),
  ('loop_sort_total_levels', '60'),
  ('loop_sort_admin_session_hours', '12')
on conflict (key) do nothing;

create or replace function private.setting(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.settings where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed windows).
-- ---------------------------------------------------------------------------
create table if not exists private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- Returns true when the call is allowed (and records it), false when the limit is hit.
create or replace function private.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- opportunistic cleanup of old windows
  delete from private.rate_limits where window_start < now() - interval '2 days';

  return v_hits <= p_max;
end;
$$;

create or replace function private.client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return 'unknown';
  end;
  if v_headers is null then
    return 'unknown';
  end if;
  return coalesce(
    v_headers ->> 'cf-connecting-ip',
    split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    'unknown'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Games catalogue (drives leaderboard aggregation).
-- aggregation: 'best' = each player's best single result, 'sum' = totals across results,
-- 'progress' = ranked from game_progress (levels completed, then summed best level scores).
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id text primary key,
  name text not null,
  aggregation text not null check (aggregation in ('best', 'sum', 'progress', 'none')),
  boards text[] not null,
  max_levels integer
);

insert into public.games (id, name, aggregation, boards, max_levels) values
  ('ludo', 'Ludo', 'sum', array['easy', 'medium', 'hard'], null),
  ('snake-battle', 'Snake Battle', 'best', array['classic'], null),
  ('tic-tac-toe', 'Tic-Tac-Toe', 'sum', array['easy', 'medium', 'hard'], null),
  ('2048', '2048 Challenge', 'best', array['classic'], null),
  ('dino-run', 'Dino Run', 'best', array['classic'], null),
  ('brick-breaker', 'Brick Breaker', 'best', array['classic'], null),
  ('flappy-style', 'Flappy Udaan', 'best', array['classic'], null),
  ('pong', 'Pong', 'sum', array['easy', 'medium', 'hard'], null),
  ('memory-match', 'Memory Match', 'best', array['easy', 'medium', 'hard'], null),
  ('tetris', 'Tetris Classic', 'best', array['classic'], null),
  ('sudoku', 'Sudoku Classic', 'best', array['easy', 'medium', 'hard'], null),
  ('skater-boy', 'Skater Boy', 'progress', array['campaign'], 90),
  ('typing-racer', 'Typing Racer', 'best', array['easy', 'medium', 'hard'], null),
  ('loop-sort', 'Loop Sort', 'none', array[]::text[], 60),
  ('arrow-go', 'Arrow Go', 'progress', array['classic'], 60)
on conflict (id) do update
  set name = excluded.name, aggregation = excluded.aggregation,
      boards = excluded.boards, max_levels = excluded.max_levels;

-- ---------------------------------------------------------------------------
-- Players and credentials
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private code is stored only as an HMAC (pepper lives in private.settings).
create table if not exists public.player_code_credentials (
  player_id uuid primary key references public.players (id) on delete cascade,
  code_hmac text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists public.player_devices (
  auth_uid uuid primary key references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists player_devices_player_idx on public.player_devices (player_id);

-- ---------------------------------------------------------------------------
-- Scores
-- ---------------------------------------------------------------------------
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  board text not null,
  started_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists game_sessions_player_idx on public.game_sessions (player_id, started_at desc);

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  -- client-generated id makes retries/offline replays idempotent
  submission_id uuid not null unique,
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  board text not null,
  rank1 double precision not null,
  rank2 double precision not null default 0,
  metrics jsonb not null,
  timing_verified boolean not null default false,
  played_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_board_idx on public.game_scores (game_id, board, rank1 desc, rank2 desc);
create index if not exists game_scores_player_idx on public.game_scores (player_id, game_id);

-- Per-game level progress (Skater Boy, Arrow Go). Merged server-side, never overwritten blindly.
create table if not exists public.game_progress (
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  completed integer[] not null default '{}',
  best jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

-- Ludo results for solo (1 human + 3 bots) matches.
create table if not exists public.ludo_match_results (
  submission_id uuid primary key references public.game_scores (submission_id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  bot_difficulty text not null check (bot_difficulty in ('easy', 'medium', 'hard')),
  position integer not null check (position between 1 and 4),
  points integer not null check (points in (0, 5, 10)),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Loop Sort: progress, lives and admin sessions are stored separately.
-- ---------------------------------------------------------------------------
create table if not exists public.loop_sort_progress (
  player_id uuid primary key references public.players (id) on delete cascade,
  completed integer[] not null default '{}',
  current_level integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_sort_lives (
  player_id uuid primary key references public.players (id) on delete cascade,
  lives integer not null check (lives >= 0),
  -- regeneration anchor: lives regenerate one per interval counted from this server timestamp
  regen_anchor timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin mode is per device (auth uid) and expires.
create table if not exists public.loop_sort_admin_sessions (
  auth_uid uuid primary key references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Idempotency log for Loop Sort results (online or replayed after being offline).
create table if not exists public.loop_sort_events (
  id uuid primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('fail', 'complete')),
  level integer not null,
  accepted boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: enable everywhere; only harmless reads are granted.
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.player_code_credentials enable row level security;
alter table public.player_devices enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_scores enable row level security;
alter table public.game_progress enable row level security;
alter table public.ludo_match_results enable row level security;
alter table public.loop_sort_progress enable row level security;
alter table public.loop_sort_lives enable row level security;
alter table public.loop_sort_admin_sessions enable row level security;
alter table public.loop_sort_events enable row level security;

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select player_id from public.player_devices where auth_uid = auth.uid()
$$;

drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (true);

drop policy if exists players_read on public.players;
create policy players_read on public.players for select using (true);

drop policy if exists devices_own on public.player_devices;
create policy devices_own on public.player_devices for select using (auth_uid = auth.uid());

drop policy if exists scores_read on public.game_scores;
create policy scores_read on public.game_scores for select using (true);

drop policy if exists progress_own on public.game_progress;
create policy progress_own on public.game_progress for select using (player_id = public.current_player_id());

drop policy if exists ludo_read on public.ludo_match_results;
create policy ludo_read on public.ludo_match_results for select using (true);

drop policy if exists ls_progress_own on public.loop_sort_progress;
create policy ls_progress_own on public.loop_sort_progress for select using (player_id = public.current_player_id());

drop policy if exists ls_lives_own on public.loop_sort_lives;
create policy ls_lives_own on public.loop_sort_lives for select using (player_id = public.current_player_id());
-- player_code_credentials, game_sessions, loop_sort_admin_sessions, loop_sort_events: no policies => no direct access.

revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on public.games, public.players, public.game_scores, public.ludo_match_results to anon, authenticated;
grant select on public.player_devices, public.game_progress, public.loop_sort_progress, public.loop_sort_lives to authenticated;
revoke all on public.player_code_credentials, public.game_sessions, public.loop_sort_admin_sessions, public.loop_sort_events from anon, authenticated;
