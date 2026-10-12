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
