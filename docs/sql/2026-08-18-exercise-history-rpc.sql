-- Wave D2 · exercise_history RPC — two fixes, one replace.
--
-- 1. FLATLINE. `best_1rm` is max(est_1rm_kg) over the day, so on double
--    progression it freezes the moment set 1 reaches the rep ceiling and never
--    moves again while sets 2..n climb underneath it. DB Hammer Curl read
--    exactly 28.0 for five consecutive sessions (2026-07-21 .. 08-18) while set
--    3 went 9 → 10 → 11 → 11 → 12. `avg_1rm` is added alongside it: the mean
--    over the day's working sets, which moves when the training does.
--
-- 2. UNILATERAL TONNAGE. `session_volume` summed weight×reps over raw rows, so
--    a unilateral pair (two rows, one pair_id) counted twice. Collapsed to one
--    set at the weaker side, matching lib/sessions/volume.ts.
--
-- Safe to re-run. Nothing is dropped; `avg_1rm` is additive and the client
-- falls back to `best_1rm` when it is absent.
create or replace function public.exercise_history(p_exercise_id uuid)
 returns jsonb
 language sql
 set search_path to 'public'
as $function$
with raw as (
  select w.started_at::date as day, s.weight_kg, s.reps, s.est_1rm_kg,
         s.pair_id, s.side
  from workout_sets s join workout_sessions w on w.id = s.session_id
  where s.exercise_id = p_exercise_id and s.user_id = auth.uid()
    and coalesce(s.set_type,'normal') <> 'warmup'
),
collapsed as (
  select day, weight_kg, reps, est_1rm_kg, weight_kg * reps as set_volume
    from raw
   where pair_id is null or side is null or side not in ('L','R')
  union all
  select day, min(weight_kg), min(reps), max(est_1rm_kg),
         min(weight_kg) * min(reps)
    from raw
   where pair_id is not null and side in ('L','R')
   group by day, pair_id
),
daily as (
  select day,
         max(weight_kg)              as top_weight,
         max(est_1rm_kg)             as best_1rm,
         round(avg(est_1rm_kg), 1)   as avg_1rm,
         max(set_volume)             as best_set_volume,
         sum(set_volume)             as session_volume,
         sum(reps)                   as reps
  from collapsed group by day
)
select jsonb_build_object(
  'records', coalesce((select jsonb_build_object(
      'heaviest_weight', max(weight_kg), 'best_1rm', max(est_1rm_kg),
      'best_set_volume', max(set_volume),
      'best_session_volume', (select max(session_volume) from daily),
      'total_reps', coalesce(sum(reps),0)) from collapsed), '{}'::jsonb),
  'timeline', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'top_weight', top_weight, 'best_1rm', best_1rm,
      'avg_1rm', avg_1rm,
      'session_volume', session_volume, 'reps', reps) order by day)
    from daily), '[]'::jsonb));
$function$;
