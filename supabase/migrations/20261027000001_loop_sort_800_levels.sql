-- Chakkar Cubes (loop-sort) grows from 60 to 800 levels.
-- Only two limits change; no tables, functions, players, codes, scores or progress are touched.
--   private.settings 'loop_sort_total_levels': which levels can be unlocked and opened
--   public.games.max_levels for 'loop-sort':  which level numbers saved progress may contain
-- Run this BEFORE deploying a site build with 800 levels (the 60-level build ignores the higher limit).
update private.settings
set value = '800', updated_at = now()
where key = 'loop_sort_total_levels';

update public.games
set max_levels = 800
where id = 'loop-sort';
