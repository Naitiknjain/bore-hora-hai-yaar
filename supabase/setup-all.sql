-- bore-hora-hai-yaar: all migrations in order (generated from supabase/migrations). Safe to re-run.

-- ===== supabase/migrations/20261012000001_core_schema.sql =====
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

-- ===== supabase/migrations/20261012000002_player_functions.sql =====
-- Guest identity: registration, recovery by private code, rename, code rotation.

create or replace function private.normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if length(v) = 20 and left(v, 4) = 'BHHY' then
    v := substr(v, 5);
  end if;
  -- Crockford-style forgiveness for look-alike characters
  return translate(v, 'OIL', '011');
end;
$$;

create or replace function private.code_hmac(p_code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(private.normalize_code(p_code), private.setting('player_code_pepper'), 'sha256'),
    'hex'
  )
$$;

-- 16 symbols from a 32-symbol alphabet = 80 bits of entropy, formatted BHHY-XXXX-XXXX-XXXX-XXXX
create or replace function private.new_player_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(16);
  v_raw text := '';
  i integer;
begin
  for i in 0..15 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return 'BHHY-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
end;
$$;

create or replace function private.clean_nickname(p_nickname text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) < 2 or char_length(v) > 20 or v ~ '[[:cntrl:]<>]' then
    raise exception 'invalid_nickname' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.require_auth()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.require_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  select player_id into v from public.player_devices where auth_uid = private.require_auth();
  if v is null then
    raise exception 'no_player' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.player_json(p_player uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('player_id', p.id, 'nickname', p.nickname, 'created_at', p.created_at)
  from public.players p where p.id = p_player
$$;

-- ---------------------------------------------------------------------------

create or replace function public.register_player(p_nickname text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_nick text := private.clean_nickname(p_nickname);
  v_player uuid;
  v_code text;
begin
  if exists (select 1 from public.player_devices where auth_uid = v_uid) then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;
  if not private.rate_limit_hit('register:ip:' || private.client_ip(), 30, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.players (nickname) values (v_nick) returning id into v_player;

  loop
    v_code := private.new_player_code();
    begin
      insert into public.player_code_credentials (player_id, code_hmac)
      values (v_player, private.code_hmac(v_code));
      exit;
    exception when unique_violation then
      -- astronomically unlikely; try another code
    end;
  end loop;

  insert into public.player_devices (auth_uid, player_id) values (v_uid, v_player);

  return json_build_object(
    'player_id', v_player,
    'nickname', v_nick,
    'created_at', now(),
    'player_code', v_code
  );
end;
$$;

create or replace function public.me()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select private.player_json(d.player_id)
  from public.player_devices d
  where d.auth_uid = auth.uid()
$$;

create or replace function public.recover_player(p_code text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_player uuid;
begin
  if not private.rate_limit_hit('recover:uid:' || v_uid::text, 5, 900)
     or not private.rate_limit_hit('recover:ip:' || private.client_ip(), 20, 900) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select player_id into v_player
  from public.player_code_credentials
  where code_hmac = private.code_hmac(p_code);

  if v_player is null then
    -- Return (not raise) so the failed attempt stays counted by the rate limiter.
    return json_build_object('error', 'invalid_code');
  end if;

  insert into public.player_devices (auth_uid, player_id)
  values (v_uid, v_player)
  on conflict (auth_uid) do update set player_id = excluded.player_id, linked_at = now();

  -- an admin session belongs to a (device, player) pair; drop it on identity switch
  delete from public.loop_sort_admin_sessions where auth_uid = v_uid and player_id <> v_player;

  return private.player_json(v_player);
end;
$$;

create or replace function public.rename_player(p_nickname text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_nick text := private.clean_nickname(p_nickname);
begin
  if not private.rate_limit_hit('rename:' || v_player::text, 10, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  update public.players set nickname = v_nick, updated_at = now() where id = v_player;
  return private.player_json(v_player);
end;
$$;

-- Issues a brand-new private code; the old one stops working immediately.
create or replace function public.rotate_player_code()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_code text;
begin
  if not private.rate_limit_hit('rotate:' || v_player::text, 5, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  loop
    v_code := private.new_player_code();
    begin
      update public.player_code_credentials
      set code_hmac = private.code_hmac(v_code), rotated_at = now()
      where player_id = v_player;
      exit;
    exception when unique_violation then
    end;
  end loop;
  return json_build_object('player_code', v_code);
end;
$$;

-- Unlinks this browser from its player (the player and its scores remain).
create or replace function public.forget_device()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.player_devices where auth_uid = auth.uid();
$$;

-- ===== supabase/migrations/20261012000003_scores_leaderboards.sql =====
-- Score submission (validated server-side), game sessions, progress and leaderboards.
-- Rank keys are always computed here, never accepted from the client.
-- Convention: higher rank1/rank2 is better (ascending metrics such as time are negated).

create or replace function private.num(p_metrics jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_metrics ->> p_key;
begin
  if v_text is null or jsonb_typeof(p_metrics -> p_key) <> 'number' then
    raise exception 'invalid_metrics:%', p_key using errcode = 'P0001';
  end if;
  return v_text::numeric;
end;
$$;

create or replace function private.int_in(p_metrics jsonb, p_key text, p_min numeric, p_max numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric := private.num(p_metrics, p_key);
begin
  if v <> trunc(v) or v < p_min or v > p_max then
    raise exception 'invalid_metrics:%', p_key using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.num_in(p_metrics jsonb, p_key text, p_min numeric, p_max numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric := private.num(p_metrics, p_key);
begin
  if v < p_min or v > p_max then
    raise exception 'invalid_metrics:%', p_key using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Returns {rank1, rank2, time_ms} for a valid result, raises otherwise.
create or replace function private.validate_score(p_game text, p_board text, m jsonb)
returns table (rank1 double precision, rank2 double precision, time_ms numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  a numeric; b numeric; c numeric; d numeric;
begin
  if jsonb_typeof(m) <> 'object' then
    raise exception 'invalid_metrics' using errcode = 'P0001';
  end if;

  case p_game
  when 'ludo' then
    a := private.int_in(m, 'position', 1, 4);
    b := private.int_in(m, 'points', 0, 10);
    if b <> (case a when 1 then 10 when 2 then 5 else 0 end) then
      raise exception 'invalid_metrics:points' using errcode = 'P0001';
    end if;
    return query select b::float8, (case when a = 1 then 1 else 0 end)::float8, null::numeric;

  when 'snake-battle' then
    a := private.int_in(m, 'score', 0, 397);
    return query select a::float8, 0::float8, null::numeric;

  when 'tic-tac-toe' then
    a := private.int_in(m, 'result', -1, 1);
    return query select (case when a = 1 then 1 else 0 end)::float8, (case when a = 0 then 1 else 0 end)::float8, null::numeric;

  when '2048' then
    a := private.int_in(m, 'score', 0, 4000000);
    b := private.int_in(m, 'maxTile', 2, 131072);
    if (b::bigint & (b::bigint - 1)) <> 0 then
      raise exception 'invalid_metrics:maxTile' using errcode = 'P0001';
    end if;
    return query select a::float8, b::float8, null::numeric;

  when 'dino-run' then
    a := private.int_in(m, 'score', 0, 1000000);
    return query select a::float8, 0::float8, null::numeric;

  when 'brick-breaker' then
    a := private.int_in(m, 'score', 0, 100000);
    b := private.int_in(m, 'level', 1, 10);
    return query select a::float8, b::float8, null::numeric;

  when 'flappy-style' then
    a := private.int_in(m, 'score', 0, 100000);
    return query select a::float8, 0::float8, null::numeric;

  when 'pong' then
    c := private.int_in(m, 'target', 5, 11);
    if c not in (5, 7, 11) then
      raise exception 'invalid_metrics:target' using errcode = 'P0001';
    end if;
    a := private.int_in(m, 'playerScore', 0, c);
    b := private.int_in(m, 'cpuScore', 0, c);
    if not ((a = c and b < c) or (b = c and a < c)) then
      raise exception 'invalid_metrics:score' using errcode = 'P0001';
    end if;
    return query select (case when a = c then 1 else 0 end)::float8, (a - b)::float8, null::numeric;

  when 'memory-match' then
    d := case p_board when 'easy' then 7 when 'medium' then 11 when 'hard' then 15 end;
    a := private.int_in(m, 'pairs', d, d);
    b := private.int_in(m, 'moves', d, 5000);
    c := private.int_in(m, 'timeMs', b * 250, 86400000);
    return query select (-c)::float8, (-b)::float8, c;

  when 'tetris' then
    a := private.int_in(m, 'score', 0, 10000000);
    b := private.int_in(m, 'lines', 0, 100000);
    return query select a::float8, b::float8, null::numeric;

  when 'sudoku' then
    a := private.int_in(m, 'timeMs', 15000, 86400000);
    b := private.int_in(m, 'mistakes', 0, 10000);
    return query select (-a)::float8, (-b)::float8, a;

  when 'typing-racer' then
    a := private.num_in(m, 'wpm', 0, 250);
    b := private.num_in(m, 'accuracy', 0, 100);
    c := private.int_in(m, 'timeMs', 1000, 3600000);
    d := private.int_in(m, 'chars', 1, 10000);
    -- WPM must match the standard formula: (correct chars / 5) / minutes
    if abs(a - round((d / 5.0) / (c / 60000.0), 1)) > 1 then
      raise exception 'invalid_metrics:wpm' using errcode = 'P0001';
    end if;
    return query select round(a, 1)::float8, round(b, 1)::float8, c;

  else
    raise exception 'unknown_game' using errcode = 'P0001';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.start_game_session(p_game text, p_board text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_id uuid;
begin
  if not exists (select 1 from public.games g where g.id = p_game and p_board = any (g.boards)) then
    raise exception 'unknown_board' using errcode = 'P0001';
  end if;
  if not private.rate_limit_hit('session:' || v_player::text, 300, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.game_sessions (player_id, game_id, board) values (v_player, p_game, p_board)
  returning id into v_id;
  delete from public.game_sessions where player_id = v_player and started_at < now() - interval '2 days';
  return v_id;
end;
$$;

create or replace function public.submit_score(
  p_submission_id uuid,
  p_game text,
  p_board text,
  p_metrics jsonb,
  p_played_at timestamptz default null,
  p_session_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_existing public.game_scores;
  v_game public.games;
  v_r1 double precision;
  v_r2 double precision;
  v_time numeric;
  v_session public.game_sessions;
  v_verified boolean := false;
  v_played timestamptz := coalesce(p_played_at, now());
begin
  if p_submission_id is null then
    raise exception 'invalid_submission' using errcode = 'P0001';
  end if;

  -- Idempotency: network retries and offline replays return the original result.
  select * into v_existing from public.game_scores where submission_id = p_submission_id;
  if found then
    if v_existing.player_id <> v_player then
      raise exception 'invalid_submission' using errcode = 'P0001';
    end if;
    return json_build_object('status', 'duplicate', 'rank1', v_existing.rank1, 'rank2', v_existing.rank2);
  end if;

  select * into v_game from public.games where id = p_game;
  if not found or v_game.aggregation not in ('best', 'sum') or not (p_board = any (v_game.boards)) then
    raise exception 'unknown_board' using errcode = 'P0001';
  end if;

  if not private.rate_limit_hit('score:' || v_player::text, 240, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_played > now() + interval '5 minutes' or v_played < now() - interval '30 days' then
    raise exception 'invalid_played_at' using errcode = 'P0001';
  end if;

  select s.rank1, s.rank2, s.time_ms into v_r1, v_r2, v_time
  from private.validate_score(p_game, p_board, p_metrics) s;

  if p_session_id is not null then
    select * into v_session from public.game_sessions
    where id = p_session_id and player_id = v_player and game_id = p_game and board = p_board
    for update;
    if found and v_session.consumed_at is null then
      -- The claimed duration must fit inside the real server-side session window
      -- (pauses can make it shorter, never longer). Minimum plausible durations are
      -- enforced by validate_score. Each session can back exactly one result.
      if v_time is not null and v_time > extract(epoch from (now() - v_session.started_at)) * 1000 + 15000 then
        raise exception 'timing_mismatch' using errcode = 'P0001';
      end if;
      update public.game_sessions set consumed_at = now() where id = v_session.id;
      v_verified := true;
      v_played := least(v_played, now());
    end if;
  end if;

  insert into public.game_scores (submission_id, player_id, game_id, board, rank1, rank2, metrics, timing_verified, played_at)
  values (p_submission_id, v_player, p_game, p_board, v_r1, v_r2, p_metrics, v_verified, v_played);

  if p_game = 'ludo' then
    insert into public.ludo_match_results (submission_id, player_id, bot_difficulty, position, points)
    values (p_submission_id, v_player, p_board, (p_metrics ->> 'position')::int, (p_metrics ->> 'points')::int);
  end if;

  return json_build_object('status', 'accepted', 'rank1', v_r1, 'rank2', v_r2, 'timing_verified', v_verified);
end;
$$;

-- ---------------------------------------------------------------------------
-- Level progress (Skater Boy, Arrow Go): union of completed levels, max per level best.
-- Deterministic merge => devices can sync in any order.
-- ---------------------------------------------------------------------------
create or replace function public.save_progress(p_game text, p_completed integer[], p_best jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_game public.games;
  v_key text;
  v_val jsonb;
  v_row public.game_progress;
  v_merged_best jsonb;
begin
  select * into v_game from public.games where id = p_game;
  if not found or v_game.aggregation <> 'progress' then
    raise exception 'unknown_game' using errcode = 'P0001';
  end if;
  if not private.rate_limit_hit('progress:' || v_player::text, 600, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_completed, '{}')) l where l < 1 or l > v_game.max_levels) then
    raise exception 'invalid_level' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_best, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_best' using errcode = 'P0001';
  end if;

  insert into public.game_progress (player_id, game_id) values (v_player, p_game)
  on conflict do nothing;

  select * into v_row from public.game_progress where player_id = v_player and game_id = p_game for update;

  for v_key, v_val in select * from jsonb_each(coalesce(p_best, '{}'::jsonb)) loop
    if v_key !~ '^[0-9]+$' or v_key::int < 1 or v_key::int > v_game.max_levels
       or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric < 0 or (v_val #>> '{}')::numeric > 50000
       or not (v_key::int = any (v_row.completed || coalesce(p_completed, '{}'))) then
      raise exception 'invalid_best' using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(jsonb_object_agg(k, to_jsonb(v)), '{}'::jsonb) into v_merged_best
  from (
    select k, max(v) as v from (
      select key as k, (value #>> '{}')::numeric as v from jsonb_each(v_row.best)
      union all
      select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_best, '{}'::jsonb))
    ) x group by k
  ) y;

  update public.game_progress
  set completed = (select coalesce(array_agg(distinct l order by l), '{}') from unnest(v_row.completed || coalesce(p_completed, '{}')) l),
      best = v_merged_best,
      updated_at = now()
  where player_id = v_player and game_id = p_game
  returning * into v_row;

  return json_build_object('completed', v_row.completed, 'best', v_row.best);
end;
$$;

create or replace function public.get_progress(p_game text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select json_build_object('completed', completed, 'best', best)
     from public.game_progress where player_id = public.current_player_id() and game_id = p_game),
    json_build_object('completed', '{}'::int[], 'best', '{}'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards: one per (game, board). No combined overall leaderboard.
-- ---------------------------------------------------------------------------
create or replace function private.leaderboard_rows(p_game text, p_board text)
returns table (
  rank bigint, player_id uuid, nickname text, rank1 double precision, rank2 double precision,
  metrics jsonb, achieved_at timestamptz, results bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agg text;
begin
  select g.aggregation into v_agg from public.games g where g.id = p_game and p_board = any (g.boards);
  if v_agg is null then
    raise exception 'unknown_board' using errcode = 'P0001';
  end if;

  if v_agg = 'best' then
    return query
      with best as (
        select distinct on (s.player_id) s.player_id, s.rank1, s.rank2, s.metrics, s.played_at,
               count(*) over (partition by s.player_id) as results
        from public.game_scores s
        where s.game_id = p_game and s.board = p_board
        order by s.player_id, s.rank1 desc, s.rank2 desc, s.played_at asc
      )
      select rank() over (order by b.rank1 desc, b.rank2 desc), b.player_id, p.nickname,
             b.rank1, b.rank2, b.metrics, b.played_at, b.results
      from best b join public.players p on p.id = b.player_id
      order by b.rank1 desc, b.rank2 desc, b.played_at asc;
  elsif v_agg = 'sum' then
    return query
      with totals as (
        select s.player_id, sum(s.rank1) as rank1, sum(s.rank2) as rank2, max(s.played_at) as played_at, count(*) as results
        from public.game_scores s
        where s.game_id = p_game and s.board = p_board
        group by s.player_id
      )
      select rank() over (order by t.rank1 desc, t.rank2 desc), t.player_id, p.nickname,
             t.rank1, t.rank2, '{}'::jsonb, t.played_at, t.results
      from totals t join public.players p on p.id = t.player_id
      order by t.rank1 desc, t.rank2 desc, t.played_at asc;
  elsif v_agg = 'progress' then
    return query
      with prog as (
        select gp.player_id, cardinality(gp.completed)::float8 as rank1,
               coalesce((select sum((value #>> '{}')::numeric) from jsonb_each(gp.best)), 0)::float8 as rank2,
               gp.updated_at
        from public.game_progress gp
        where gp.game_id = p_game and cardinality(gp.completed) > 0
      )
      select rank() over (order by g.rank1 desc, g.rank2 desc), g.player_id, p.nickname,
             g.rank1, g.rank2, '{}'::jsonb, g.updated_at, g.rank1::bigint
      from prog g join public.players p on p.id = g.player_id
      order by g.rank1 desc, g.rank2 desc, g.updated_at asc;
  end if;
end;
$$;

create or replace function public.get_leaderboard(p_game text, p_board text, p_limit integer default 50)
returns table (
  rank bigint, player_id uuid, nickname text, rank1 double precision, rank2 double precision,
  metrics jsonb, achieved_at timestamptz, results bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.leaderboard_rows(p_game, p_board) limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.get_my_leaderboard_position(p_game text, p_board text)
returns table (
  rank bigint, player_id uuid, nickname text, rank1 double precision, rank2 double precision,
  metrics jsonb, achieved_at timestamptz, results bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.leaderboard_rows(p_game, p_board) r where r.player_id = public.current_player_id()
$$;

create or replace function public.get_my_stats()
returns table (game_id text, board text, results bigint, best_rank1 double precision, last_played timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.game_id, s.board, count(*), max(s.rank1), max(s.played_at)
  from public.game_scores s
  where s.player_id = public.current_player_id()
  group by s.game_id, s.board
$$;

-- ===== supabase/migrations/20261012000004_loop_sort.sql =====
-- Loop Sort: server-authoritative lives (server clock), admin mode via PIN, shared progress.

-- Administrator sets/changes the PIN from the SQL editor (never in source control):
--   select private.set_loop_sort_admin_pin('your-pin');
create or replace function private.set_loop_sort_admin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or char_length(p_pin) < 4 or char_length(p_pin) > 32 then
    raise exception 'PIN must be 4-32 characters';
  end if;
  insert into private.settings (key, value, updated_at)
  values ('loop_sort_admin_pin_hash', extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function private.ls_int_setting(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value::integer from private.settings where key = p_key), p_default)
$$;

-- Locks and refreshes the lives row, applying regeneration based on the *server* clock.
create or replace function private.ls_refresh_lives(p_player uuid)
returns public.loop_sort_lives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := private.ls_int_setting('loop_sort_max_lives', 5);
  v_regen integer := private.ls_int_setting('loop_sort_regen_seconds', 1200);
  v_row public.loop_sort_lives;
  v_n integer;
begin
  insert into public.loop_sort_lives (player_id, lives, regen_anchor) values (p_player, v_max, now())
  on conflict do nothing;

  select * into v_row from public.loop_sort_lives where player_id = p_player for update;

  if v_row.lives >= v_max then
    v_row.lives := v_max;
    v_row.regen_anchor := now();
  else
    v_n := floor(extract(epoch from (now() - v_row.regen_anchor)) / v_regen);
    if v_n > 0 then
      v_row.lives := least(v_max, v_row.lives + v_n);
      v_row.regen_anchor := case when v_row.lives >= v_max then now()
                                 else v_row.regen_anchor + make_interval(secs => v_n * v_regen) end;
    end if;
  end if;

  update public.loop_sort_lives
  set lives = v_row.lives, regen_anchor = v_row.regen_anchor, updated_at = now()
  where player_id = p_player;

  return v_row;
end;
$$;

create or replace function private.ls_admin_active(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loop_sort_admin_sessions
    where auth_uid = auth.uid() and player_id = p_player and expires_at > now()
  )
$$;

create or replace function private.ls_state_json(p_player uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lives public.loop_sort_lives := private.ls_refresh_lives(p_player);
  v_max integer := private.ls_int_setting('loop_sort_max_lives', 5);
  v_regen integer := private.ls_int_setting('loop_sort_regen_seconds', 1200);
  v_prog public.loop_sort_progress;
  v_admin_exp timestamptz;
begin
  insert into public.loop_sort_progress (player_id) values (p_player) on conflict do nothing;
  select * into v_prog from public.loop_sort_progress where player_id = p_player;
  select expires_at into v_admin_exp from public.loop_sort_admin_sessions
  where auth_uid = auth.uid() and player_id = p_player and expires_at > now();

  return json_build_object(
    'lives', v_lives.lives,
    'max_lives', v_max,
    'regen_seconds', v_regen,
    'next_life_at', case when v_lives.lives < v_max then v_lives.regen_anchor + make_interval(secs => v_regen) end,
    'server_now', now(),
    'completed', v_prog.completed,
    'current_level', v_prog.current_level,
    'total_levels', private.ls_int_setting('loop_sort_total_levels', 60),
    'admin', v_admin_exp is not null,
    'admin_expires_at', v_admin_exp,
    'admin_configured', exists (select 1 from private.settings where key = 'loop_sort_admin_pin_hash')
  );
end;
$$;

create or replace function public.loop_sort_state()
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.ls_state_json(private.require_player());
end;
$$;

create or replace function public.loop_sort_enter_admin(p_pin text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_player uuid := private.require_player();
  v_hash text := private.setting('loop_sort_admin_pin_hash');
  v_hours integer := private.ls_int_setting('loop_sort_admin_session_hours', 12);
begin
  if v_hash is null then
    return json_build_object('error', 'admin_not_configured');
  end if;
  -- Limits per device, per player and per IP. Wrong attempts are *returned*, not raised,
  -- so the attempt counter is committed.
  if not private.rate_limit_hit('pin:uid:' || v_uid::text, 5, 900)
     or not private.rate_limit_hit('pin:player:' || v_player::text, 10, 3600)
     or not private.rate_limit_hit('pin:ip:' || private.client_ip(), 20, 3600) then
    return json_build_object('error', 'rate_limited');
  end if;
  if p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    return json_build_object('error', 'invalid_pin');
  end if;

  insert into public.loop_sort_admin_sessions (auth_uid, player_id, expires_at)
  values (v_uid, v_player, now() + make_interval(hours => v_hours))
  on conflict (auth_uid) do update
    set player_id = excluded.player_id, started_at = now(), expires_at = excluded.expires_at;

  return private.ls_state_json(v_player);
end;
$$;

-- Back to Normal Mode: lives reset to the maximum, regeneration resumes. Progress untouched.
create or replace function public.loop_sort_exit_admin()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_player uuid := private.require_player();
begin
  perform private.ls_refresh_lives(v_player); -- takes the row lock (serialises concurrent switches)
  delete from public.loop_sort_admin_sessions where auth_uid = v_uid;
  update public.loop_sort_lives
  set lives = private.ls_int_setting('loop_sort_max_lives', 5), regen_anchor = now(), updated_at = now()
  where player_id = v_player;
  return private.ls_state_json(v_player);
end;
$$;

-- Moves the "current level" pointer. Opening a level never marks it completed.
create or replace function public.loop_sort_select_level(p_level integer)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_total integer := private.ls_int_setting('loop_sort_total_levels', 60);
  v_prog public.loop_sort_progress;
  v_unlocked integer;
begin
  insert into public.loop_sort_progress (player_id) values (v_player) on conflict do nothing;
  select * into v_prog from public.loop_sort_progress where player_id = v_player for update;
  v_unlocked := least(v_total, coalesce((select max(l) from unnest(v_prog.completed) l), 0) + 1);
  if p_level < 1 or p_level > v_total or (p_level > v_unlocked and not private.ls_admin_active(v_player)) then
    raise exception 'level_locked' using errcode = 'P0001';
  end if;
  update public.loop_sort_progress set current_level = p_level, updated_at = now() where player_id = v_player;
  return private.ls_state_json(v_player);
end;
$$;

-- Applies level results. p_events: [{ "id": uuid, "kind": "fail"|"complete", "level": int }]
-- Each event id is processed once (safe for retries and offline replays).
create or replace function public.loop_sort_apply_events(p_events jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_total integer := private.ls_int_setting('loop_sort_total_levels', 60);
  v_max integer := private.ls_int_setting('loop_sort_max_lives', 5);
  v_admin boolean;
  v_event jsonb;
  v_id uuid;
  v_kind text;
  v_level integer;
  v_lives public.loop_sort_lives;
  v_prog public.loop_sort_progress;
  v_unlocked integer;
  v_accepted boolean;
  v_reason text;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'invalid_events' using errcode = 'P0001';
  end if;
  if not private.rate_limit_hit('ls_events:' || v_player::text, 600, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_lives := private.ls_refresh_lives(v_player); -- row lock for the whole batch
  insert into public.loop_sort_progress (player_id) values (v_player) on conflict do nothing;
  select * into v_prog from public.loop_sort_progress where player_id = v_player for update;
  v_admin := private.ls_admin_active(v_player);

  for v_event in select * from jsonb_array_elements(p_events) loop
    begin
      v_id := (v_event ->> 'id')::uuid;
      v_kind := v_event ->> 'kind';
      v_level := (v_event ->> 'level')::integer;
    exception when others then
      raise exception 'invalid_events' using errcode = 'P0001';
    end;
    if v_id is null or v_kind not in ('fail', 'complete') or v_level is null then
      raise exception 'invalid_events' using errcode = 'P0001';
    end if;

    if exists (select 1 from public.loop_sort_events where id = v_id) then
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'duplicate');
      continue;
    end if;

    v_accepted := true;
    v_reason := null;

    if v_level < 1 or v_level > v_total then
      v_accepted := false; v_reason := 'invalid_level';
    elsif v_kind = 'fail' then
      if not v_admin then
        if v_lives.lives >= v_max then
          v_lives.regen_anchor := now();
        end if;
        v_lives.lives := greatest(0, v_lives.lives - 1);
      end if;
    else -- complete
      v_unlocked := coalesce((select max(l) from unnest(v_prog.completed) l), 0) + 1;
      if not v_admin and v_level > v_unlocked and not (v_level = any (v_prog.completed)) then
        v_accepted := false; v_reason := 'level_locked';
      elsif not v_admin and v_lives.lives <= 0 then
        v_accepted := false; v_reason := 'no_lives';
      else
        if not (v_level = any (v_prog.completed)) then
          v_prog.completed := (select array_agg(l order by l) from unnest(v_prog.completed || v_level) l);
        end if;
        v_prog.current_level := least(v_total, v_level + 1);
      end if;
    end if;

    insert into public.loop_sort_events (id, player_id, kind, level, accepted, reason)
    values (v_id, v_player, v_kind, v_level, v_accepted, v_reason);
    v_results := v_results || jsonb_build_object('id', v_id, 'status', case when v_accepted then 'accepted' else 'rejected' end, 'reason', v_reason);
  end loop;

  update public.loop_sort_lives set lives = v_lives.lives, regen_anchor = v_lives.regen_anchor, updated_at = now()
  where player_id = v_player;
  update public.loop_sort_progress set completed = v_prog.completed, current_level = v_prog.current_level, updated_at = now()
  where player_id = v_player;

  return json_build_object('results', v_results, 'state', private.ls_state_json(v_player));
end;
$$;

-- ===== supabase/migrations/20261012000005_grants.sql =====
-- Function privileges: nothing in `private` is callable by API roles; only the
-- intended public RPCs are exposed.

revoke all on all functions in schema private from public;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Readable by anyone (leaderboards are public by design; they never include player codes).
grant execute on function public.get_leaderboard(text, text, integer) to anon, authenticated;

-- Require an (anonymous) Supabase auth session.
grant execute on function public.current_player_id() to authenticated;
grant execute on function public.register_player(text) to authenticated;
grant execute on function public.me() to authenticated;
grant execute on function public.recover_player(text) to authenticated;
grant execute on function public.rename_player(text) to authenticated;
grant execute on function public.rotate_player_code() to authenticated;
grant execute on function public.forget_device() to authenticated;
grant execute on function public.start_game_session(text, text) to authenticated;
grant execute on function public.submit_score(uuid, text, text, jsonb, timestamptz, uuid) to authenticated;
grant execute on function public.save_progress(text, integer[], jsonb) to authenticated;
grant execute on function public.get_progress(text) to authenticated;
grant execute on function public.get_my_leaderboard_position(text, text) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.loop_sort_state() to authenticated;
grant execute on function public.loop_sort_enter_admin(text) to authenticated;
grant execute on function public.loop_sort_exit_admin() to authenticated;
grant execute on function public.loop_sort_select_level(integer) to authenticated;
grant execute on function public.loop_sort_apply_events(jsonb) to authenticated;

-- Future functions in public are not executable by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
