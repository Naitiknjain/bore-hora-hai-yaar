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
