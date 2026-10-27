-- Chakkar Cubes (loop-sort) wallet: coins and a stock of each booster, owned by the server.
-- Adds two new tables and new functions only; no existing table, function, player, code, score,
-- lives or progress row is changed.
--
-- Rules (mirrored for display in src/games/loop-sort/wallet.ts):
--  - a new wallet starts with 500 coins and 2 of each booster
--  - each level completed for the first time earns coins once: 10, Hard 30, Super Hard 50
--    (granted from loop_sort_progress.completed, so it also covers levels finished before this)
--  - using a booster takes one from the stock; with none left it is bought with coins on the spot
--  - Admin Mode uses boosters for free
-- Booster ids: undo, shuffle, extra_truck, extra_slot.

create table if not exists public.loop_sort_wallet (
  player_id uuid primary key references public.players (id) on delete cascade,
  coins integer not null default 500 check (coins >= 0),
  undo integer not null default 2 check (undo >= 0),
  shuffle integer not null default 2 check (shuffle >= 0),
  extra_truck integer not null default 2 check (extra_truck >= 0),
  extra_slot integer not null default 2 check (extra_slot >= 0),
  -- levels whose first-completion coins have been paid
  rewarded integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- every booster use / purchase, by client-made id (retries and offline replays count once)
create table if not exists public.loop_sort_wallet_events (
  id uuid primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('use', 'buy')),
  booster text not null,
  accepted boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.loop_sort_wallet enable row level security;
alter table public.loop_sort_wallet_events enable row level security;
-- no policies: only the security-definer functions below read or write these tables

-- Hard / Super Hard levels; must match difficultyOf() in src/games/loop-sort/logic.ts
create or replace function private.ls_level_reward(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_level >= 50 and p_level % 25 = 0 then 50
    when p_level >= 15 and p_level % 7 = 0 then 30
    else 10
  end
$$;

create or replace function private.ls_booster_price(p_booster text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_booster
    when 'undo' then 300
    when 'shuffle' then 300
    when 'extra_truck' then 900
    when 'extra_slot' then 800
  end
$$;

-- Locks the player's wallet (creating it if needed) and pays coins for newly completed levels.
create or replace function private.ls_wallet(p_player uuid)
returns public.loop_sort_wallet
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.loop_sort_wallet;
  v_completed integer[];
  v_new integer[];
begin
  insert into public.loop_sort_wallet (player_id) values (p_player) on conflict do nothing;
  select * into v_row from public.loop_sort_wallet where player_id = p_player for update;
  select completed into v_completed from public.loop_sort_progress where player_id = p_player;
  select coalesce(array_agg(l order by l), '{}') into v_new
  from unnest(coalesce(v_completed, '{}')) l
  where not (l = any (v_row.rewarded));
  if array_length(v_new, 1) > 0 then
    v_row.coins := v_row.coins + (select sum(private.ls_level_reward(l)) from unnest(v_new) l);
    v_row.rewarded := (select array_agg(l order by l) from unnest(v_row.rewarded || v_new) l);
    update public.loop_sort_wallet set coins = v_row.coins, rewarded = v_row.rewarded, updated_at = now()
    where player_id = p_player;
  end if;
  return v_row;
end;
$$;

create or replace function private.ls_wallet_json(p_row public.loop_sort_wallet)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'coins', p_row.coins,
    'boosters', json_build_object('undo', p_row.undo, 'shuffle', p_row.shuffle, 'extra_truck', p_row.extra_truck, 'extra_slot', p_row.extra_slot)
  )
$$;

-- Current wallet (pays any coins still owed for completed levels).
create or replace function public.loop_sort_wallet()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
begin
  return private.ls_wallet_json(private.ls_wallet(v_player));
end;
$$;

-- Applies booster events. p_events: [{ "id": uuid, "kind": "use"|"buy", "booster": "undo"|... }]
--  use: one from the stock, or bought with coins when the stock is empty (free in Admin Mode)
--  buy: adds one to the stock for its price
create or replace function public.loop_sort_wallet_events(p_events jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := private.require_player();
  v_admin boolean;
  v_row public.loop_sort_wallet;
  v_event jsonb;
  v_id uuid;
  v_kind text;
  v_booster text;
  v_price integer;
  v_stock integer;
  v_accepted boolean;
  v_reason text;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'invalid_events' using errcode = 'P0001';
  end if;
  if not private.rate_limit_hit('ls_wallet:' || v_player::text, 600, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_row := private.ls_wallet(v_player); -- row lock for the whole batch
  v_admin := private.ls_admin_active(v_player);

  for v_event in select * from jsonb_array_elements(p_events) loop
    begin
      v_id := (v_event ->> 'id')::uuid;
      v_kind := v_event ->> 'kind';
      v_booster := v_event ->> 'booster';
    exception when others then
      raise exception 'invalid_events' using errcode = 'P0001';
    end;
    v_price := private.ls_booster_price(v_booster);
    if v_id is null or v_kind not in ('use', 'buy') or v_price is null then
      raise exception 'invalid_events' using errcode = 'P0001';
    end if;

    if exists (select 1 from public.loop_sort_wallet_events where id = v_id) then
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'duplicate');
      continue;
    end if;

    v_accepted := true;
    v_reason := null;
    v_stock := case v_booster when 'undo' then v_row.undo when 'shuffle' then v_row.shuffle
                              when 'extra_truck' then v_row.extra_truck else v_row.extra_slot end;

    if v_kind = 'use' then
      if v_admin then
        null; -- free in Admin Mode
      elsif v_stock > 0 then
        v_stock := v_stock - 1;
      elsif v_row.coins >= v_price then
        v_row.coins := v_row.coins - v_price;
      else
        v_accepted := false; v_reason := 'no_coins';
      end if;
    else -- buy
      if v_row.coins >= v_price then
        v_row.coins := v_row.coins - v_price;
        v_stock := v_stock + 1;
      else
        v_accepted := false; v_reason := 'no_coins';
      end if;
    end if;

    if v_booster = 'undo' then v_row.undo := v_stock;
    elsif v_booster = 'shuffle' then v_row.shuffle := v_stock;
    elsif v_booster = 'extra_truck' then v_row.extra_truck := v_stock;
    else v_row.extra_slot := v_stock;
    end if;

    insert into public.loop_sort_wallet_events (id, player_id, kind, booster, accepted, reason)
    values (v_id, v_player, v_kind, v_booster, v_accepted, v_reason);
    v_results := v_results || jsonb_build_object('id', v_id, 'status', case when v_accepted then 'accepted' else 'rejected' end, 'reason', v_reason);
  end loop;

  update public.loop_sort_wallet
  set coins = v_row.coins, undo = v_row.undo, shuffle = v_row.shuffle,
      extra_truck = v_row.extra_truck, extra_slot = v_row.extra_slot, updated_at = now()
  where player_id = v_player;

  return json_build_object('results', v_results, 'wallet', private.ls_wallet_json(v_row));
end;
$$;

revoke all on function private.ls_level_reward(integer) from public;
revoke all on function private.ls_booster_price(text) from public;
revoke all on function private.ls_wallet(uuid) from public;
revoke all on function private.ls_wallet_json(public.loop_sort_wallet) from public;
revoke execute on function public.loop_sort_wallet() from public, anon;
revoke execute on function public.loop_sort_wallet_events(jsonb) from public, anon;
grant execute on function public.loop_sort_wallet() to authenticated;
grant execute on function public.loop_sort_wallet_events(jsonb) to authenticated;
