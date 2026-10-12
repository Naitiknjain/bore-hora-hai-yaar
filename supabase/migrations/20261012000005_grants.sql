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
