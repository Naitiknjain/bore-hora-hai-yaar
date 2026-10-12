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
