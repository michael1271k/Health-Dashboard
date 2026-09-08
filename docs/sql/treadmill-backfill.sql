-- ─────────────────────────────────────────────────────────────────────────────
-- TREADMILL BACKFILL — the 2026-09-08 "Delts & Arms" session.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- The same reason `hotfix-polish.sql` is one, and it is worth restating because
-- this file is DML and could in principle have gone through PostgREST: it has
-- to resolve `exercises.id` by name and `workout_sessions.id` by (user, date,
-- day_key) in the same statement it inserts with, and a script that did that
-- from the client would race the very sync it is repairing. One transaction,
-- one paste, or nothing.
--
-- IDEMPOTENT. Every statement is `on conflict` / `where not exists` / a guarded
-- update. Running it twice writes the same rows.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
-- It does not make the treadmill appear on FUTURE sessions. That is code, and
-- it is in this branch: the web has prepended the block since
-- `templateDraft.withWarmupCardio`, and the phone now does the same in
-- `LoggerModel.withWarmupCardio` against `OnyxCore.WarmupCardio` — the same
-- three numbers on both clients. This file only repairs the day that was
-- logged before that existed.
--
-- ── AND WHY THE BOUT IS A `workout_sets` ROW, NOT A `cardio_logs` ONE ───────
-- Both tables can hold a treadmill and they answer different questions.
-- `cardio_logs` is a standalone bout: it has a `kind`, no name, and is ordered
-- by `created_at`. A block INSIDE the deck is a set — it has an
-- `exercise_order`, it sits in the session report between the movements it was
-- performed between, and `useSessionDetail` reads it from `workout_sets`.
-- 2026-09-07 was backfilled that way by `hotfix-polish.sql § 7` and this is the
-- same shape, so the two days read alike.
--
-- REQUIRES `hotfix-polish.sql` to have been run: `workout_sets.duration_sec`,
-- `.incline` and `.distance_km` are its columns, and the `Treadmill` catalogue
-- row is its § 4. The guard at the top fails loudly rather than half-writing.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0 · PRECONDITIONS ───────────────────────────────────────────────────────
-- A missing column would otherwise surface as a syntax error halfway down, and
-- a missing catalogue row as a NULL `exercise_id` that the NOT NULL constraint
-- rejects with nothing to say about why.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workout_sets' and column_name = 'duration_sec'
  ) then
    raise exception 'run docs/sql/hotfix-polish.sql first — workout_sets.duration_sec is missing';
  end if;
  if not exists (
    select 1 from public.exercises
     where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c' and name = 'Treadmill'
  ) then
    raise exception 'run docs/sql/hotfix-polish.sql first — the Treadmill catalogue row is missing';
  end if;
end $$;

-- ── 1 · THE SESSION ─────────────────────────────────────────────────────────
-- Resolved by (user, day, day_key) rather than pasted as a uuid, because the
-- 2026-09-08 session id is not in the repo — `hotfix-polish.sql` could name
-- 2026-09-07's only because that one had already been read back by hand.
--
-- `started_at` is a timestamptz and the session's DATE is the device's logical
-- day, so the window is the calendar day in the athlete's own zone. Asia/
-- Jerusalem is UTC+3 in September; a session logged at 21:30 local belongs to
-- that day and a naive UTC cast would file it on the next one.
create temporary table _target on commit drop as
select s.id, s.user_id
  from public.workout_sessions s
 where s.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
   and s.day_key = 'arms'
   and (s.started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-08'
 order by s.started_at
 limit 1;

do $$
begin
  if not exists (select 1 from _target) then
    raise exception 'no 2026-09-08 arms session for this user — nothing to backfill';
  end if;
end $$;

-- ── 2 · EVERY OTHER MOVEMENT MOVES DOWN ONE ─────────────────────────────────
-- `exercise_order` is dense from 0 and the treadmill takes 0, so the eight
-- lifts that were logged have to make room. Done BEFORE the insert: doing it
-- after would shift the treadmill too, and `exercise_order` is the column both
-- clients sort the session report by.
--
-- Guarded on the treadmill being absent, which is what makes the whole file
-- safe to run twice — a second run finds the row and shifts nothing.
update public.workout_sets s
   set exercise_order = coalesce(s.exercise_order, 0) + 1
  from _target t
 where s.session_id = t.id
   and not exists (
     select 1 from public.workout_sets x
       join public.exercises e on e.id = x.exercise_id
      where x.session_id = t.id and e.name = 'Treadmill'
   );

-- ── 3 · THE BOUT ────────────────────────────────────────────────────────────
-- The same five minutes at 2 % over 0.37 km that `WARMUP_CARDIO` proposes and
-- that 2026-09-07 carries. `set_type = 'warmup'`, zero weight and zero reps, so
-- it contributes nothing to `total_volume_kg`, nothing to the working-set count
-- the progression engine reads, and nothing to the PR ledger.
insert into public.workout_sets (
  session_id, exercise_id, user_id, set_number, exercise_order,
  weight_kg, reps, rpe, is_pr, set_type, duration_sec, incline, distance_km
)
select
  t.id,
  (select id from public.exercises
    where user_id = t.user_id and name = 'Treadmill'),
  t.user_id,
  1, 0, 0, 0, null, false, 'warmup', 300, 2.0, 0.370
  from _target t
 where not exists (
   select 1 from public.workout_sets s
     join public.exercises e on e.id = s.exercise_id
    where s.session_id = t.id and e.name = 'Treadmill'
 );

-- ── 4 · THE SESSION'S OWN COUNT ─────────────────────────────────────────────
-- `set_count` counts each `pair_id` once and every unpaired row once, warm-ups
-- INCLUDED — `SessionEditing.totals`, and Hevy counts them too. Recomputed
-- rather than incremented, so a second run is a no-op and a session whose count
-- was already wrong for some other reason comes out right.
--
-- `total_volume_kg` is deliberately NOT touched: the bout is 0 kg × 0, so the
-- tonnage this session came to has not changed.
update public.workout_sessions s
   set set_count = (
     select count(distinct coalesce(w.pair_id, w.id::text))
       from public.workout_sets w
      where w.session_id = s.id
        and coalesce(w.set_type, 'normal') <> 'ghost'
   ),
   updated_at = now()
  from _target t
 where s.id = t.id;

-- ── 5 · AND THE DAY'S ROUTINE TEMPLATE ──────────────────────────────────────
-- `routine_templates.payload` is what seeds the next deck on both clients, and
-- its `order` is dense from 0. Without this the backfill fixes the history and
-- the next Delts & Arms still opens without a treadmill on any device that has
-- already stored a template for the day.
--
-- Only the ORDER is touched, and only when a row exists: the payload carries
-- cardio fields, `side`/`pairId` and notes that nothing in this file knows how
-- to rebuild. Same rule as `RoutineOrder.patch` on the phone.
update public.routine_templates rt
   set payload = jsonb_set(
         rt.payload,
         '{exercises}',
         (
           select jsonb_agg(
                    jsonb_set(e.value, '{order}', to_jsonb(e.ord - 1))
                    order by e.ord
                  )
             from (
               select value,
                      row_number() over (
                        order by case when value ->> 'name' = 'Treadmill' then 0 else 1 end,
                                 (value ->> 'order')::int
                      ) as ord
                 from jsonb_array_elements(rt.payload -> 'exercises')
             ) e
         )
       ),
       updated_at = now()
 where rt.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
   and rt.day_key = 'arms'
   and rt.payload -> 'exercises' @> '[{"name": "Treadmill"}]';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- The treadmill opens the session, everything else follows it, and the count
-- agrees with the rows.
--
--   select e.name, s.exercise_order, s.set_type, s.duration_sec, s.incline, s.distance_km
--     from public.workout_sets s
--     join public.exercises e on e.id = s.exercise_id
--     join public.workout_sessions w on w.id = s.session_id
--    where w.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
--      and w.day_key = 'arms'
--      and (w.started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-08'
--    order by s.exercise_order, s.set_number;
--
--   select set_count, total_volume_kg, session_rpe, duration_min, ended_at
--     from public.workout_sessions
--    where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
--      and day_key = 'arms'
--      and (started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-08';
