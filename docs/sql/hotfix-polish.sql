-- ─────────────────────────────────────────────────────────────────────────────
-- HOTFIX POLISH — the DDL half of the 2026-09-07 sprint.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST with the service
-- role key, which can read and write ROWS and cannot issue DDL. There is no
-- `exec_sql` RPC, no `psql` and no Supabase CLI on this machine, so a new
-- column is a paste-into-the-SQL-editor step by construction — the same shape
-- as `e6-auth-deletion.sql`.
--
-- Everything that could be done from a script already HAS been: the fifteen
-- catalogue merges, the 2026-09-07 set list, the session aggregates and the
-- `personal_records` re-key are applied. What is left here is the four new
-- columns and the writes that depend on them.
--
-- IDEMPOTENT. Every statement is `if not exists` / `on conflict` / a guarded
-- update. Running it twice writes the same rows.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · EQUIPMENT BECOMES A TAG ─────────────────────────────────────────────
-- `exercises` is a NAME TABLE — OnyxCore says so in `Timed.swift`: "no equipment
-- column, no laterality column, no timed flag", which is why `isBodyweight`,
-- `isTimed` and `isUnilateral` all answer by regex against the name. Moving
-- Machine / DB / Cable out of the titles therefore needs somewhere for them to
-- go BEFORE the titles change, or the information is destroyed.
alter table public.exercises
  add column if not exists equipment text[] not null default '{}';

comment on column public.exercises.equipment is
  'Equipment tags — Machine / DB / Cable. Extracted from the titles on '
  '2026-09-07 so the name can be the movement and the kit can be a filter.';

-- ── 2 · REST, PRESCRIBED, ON THE CATALOGUE ROW ──────────────────────────────
-- The prescription already exists in code on both sides (`ProgramExercise.
-- restSec` in `programs.ts` and `Program.swift`, resolved by `restTargets.ts`
-- and its Swift twin `RestTargets.swift`), and the two are byte-identical —
-- the sprint's audit found zero drift across both live decks. This column is
-- for the exercises the LIBRARY shows that no deck prescribes.
alter table public.exercises
  add column if not exists rest_sec int;

-- ── 3 · A SET THAT IS NOT REPS AND KILOGRAMS ────────────────────────────────
-- The treadmill is five minutes at incline 2 for 0.37 km and carries no load at
-- all. `workout_sets` had nowhere to put any of that: `Side Plank` has been
-- stored as `reps = 55` meaning 55 SECONDS since March, which is a convention
-- every reader has to know and none of them enforces.
alter table public.workout_sets
  add column if not exists duration_sec int;
alter table public.workout_sets
  add column if not exists incline numeric(4,1);
alter table public.workout_sets
  add column if not exists distance_km numeric(6,3);

comment on column public.workout_sets.duration_sec is
  'Seconds under load, for timed work. Preferred over the reps-as-seconds '
  'convention that Side Plank still uses for its historical rows.';

-- ── 4 · THE TREADMILL ───────────────────────────────────────────────────────
-- Every session opens with it, so it is a catalogue row like any other rather
-- than a special case in the logger.
insert into public.exercises (user_id, name, split_day, muscle_groups, is_compound, equipment, rest_sec)
select 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c', 'Treadmill', 'legs', array['cardio'], false, array['Machine'], 0
where not exists (
  select 1 from public.exercises
  where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c' and name = 'Treadmill'
);

-- ── 5 · EQUIPMENT, EXTRACTED FROM THE TITLES ────────────────────────────────
-- Tag first, rename second, in one transaction: a rename that landed without
-- its tag would lose the fact.
--
-- Only the UNAMBIGUOUS cases are renamed — a parenthetical suffix, or a leading
-- or trailing bare token. A token in the MIDDLE of a name is left alone and
-- only tagged: stripping it turns "Seated Cable Row" into "Seated Row" and
-- "Single Arm Cable Crossover" into "Single Arm Crossover", which are not what
-- those movements are called.
update public.exercises set equipment = array['Machine'] where name in (
  'Chest Press (Machine)', 'Crunch Machine', 'Hip Adduction (Machine)',
  'Hip Thrust (Machine)', 'Preacher Curl (Machine)', 'Machine Lateral Raise',
  'Calf Press', 'Leg Extension', 'Seated Leg Curl', 'Pec Deck', 'Hack Squat',
  'Leg Press', 'Lat Pulldown', 'Neutral-Grip Lat Pulldown'
);
update public.exercises set equipment = array['DB'] where name in (
  'Bicep Curl (DB)', 'Hammer Curl (DB)', 'Shoulder Press (DB)',
  'Romanian Deadlift (DB)', 'Seated Lateral Raise (DB)', 'Incline DB Press',
  'Seated DB Wrist Curl', 'Seated Incline DB Curl'
);
update public.exercises set equipment = array['Cable'] where name in (
  'Overhead Triceps Extension (Cable)', 'Single Arm Lateral Raise (Cable)',
  'Single Arm Triceps Pushdown (Cable)', 'Single Arm Cable Crossover',
  'Single-Arm Cable Fly', 'Cross-Body Cable Extension', 'Seated Cable Row',
  'Seated Cable Row (V-Grip)', 'Seated Cable Row (Wide Grip)',
  'Straight-Arm Pulldown', 'Rope Triceps Pushdown', 'Face Pull'
);

-- ── 6 · AND THE TITLES LOSE THE KIT ─────────────────────────────────────────
-- `personal_records.exercise_key` is a NAME, not a foreign key, so it moves in
-- the same statement or the record book is orphaned again.
--
-- ── `Crunch Machine` IS DELIBERATELY NOT HERE ───────────────────────────────
-- Renaming it to `Crunch` would match `BodyweightExercise.patterns`'
-- `^crunch(es)?$`, and the logger would hide the load column on a 57.5 kg
-- machine — `Flags.swift` anchors that pattern on the assumption that the
-- machine variant carries the word "machine". The rename is safe only once
-- those predicates read `equipment` instead of the name, which is a change to
-- pure OnyxCore with golden vectors behind it. Left for the founder to call.
with renames(old_name, new_name) as (values
  ('Chest Press (Machine)',                'Chest Press'),
  ('Hip Adduction (Machine)',              'Hip Adduction'),
  ('Hip Thrust (Machine)',                 'Hip Thrust'),
  ('Preacher Curl (Machine)',              'Preacher Curl'),
  ('Machine Lateral Raise',                'Lateral Raise'),
  ('Bicep Curl (DB)',                      'Bicep Curl'),
  ('Hammer Curl (DB)',                     'Hammer Curl'),
  ('Shoulder Press (DB)',                  'Shoulder Press'),
  ('Romanian Deadlift (DB)',               'Romanian Deadlift'),
  ('Seated Lateral Raise (DB)',            'Seated Lateral Raise'),
  ('Overhead Triceps Extension (Cable)',   'Overhead Triceps Extension'),
  ('Single Arm Lateral Raise (Cable)',     'Single Arm Lateral Raise'),
  ('Single Arm Triceps Pushdown (Cable)',  'Single Arm Triceps Pushdown')
)
update public.exercises e
   set name = r.new_name
  from renames r
 where e.name = r.old_name
   and not exists (select 1 from public.exercises x where x.name = r.new_name);

with renames(old_name, new_name) as (values
  ('Chest Press (Machine)',                'Chest Press'),
  ('Hip Adduction (Machine)',              'Hip Adduction'),
  ('Hip Thrust (Machine)',                 'Hip Thrust'),
  ('Preacher Curl (Machine)',              'Preacher Curl'),
  ('Machine Lateral Raise',                'Lateral Raise'),
  ('Bicep Curl (DB)',                      'Bicep Curl'),
  ('Hammer Curl (DB)',                     'Hammer Curl'),
  ('Shoulder Press (DB)',                  'Shoulder Press'),
  ('Romanian Deadlift (DB)',               'Romanian Deadlift'),
  ('Seated Lateral Raise (DB)',            'Seated Lateral Raise'),
  ('Overhead Triceps Extension (Cable)',   'Overhead Triceps Extension'),
  ('Single Arm Lateral Raise (Cable)',     'Single Arm Lateral Raise'),
  ('Single Arm Triceps Pushdown (Cable)',  'Single Arm Triceps Pushdown')
)
update public.personal_records p
   set exercise_key = r.new_name
  from renames r
 where p.exercise_key = r.old_name
   and not exists (
     select 1 from public.personal_records x
      where x.user_id = p.user_id and x.exercise_key = r.new_name and x.axis = p.axis
   );

-- ── 7 · THE TREADMILL SET ON 2026-09-07 ─────────────────────────────────────
-- `exercise_order = 0`: it opens the session, ahead of the Leg Press at 1.
-- Zero weight, zero volume — it does not move `total_volume_kg`, which the
-- script already wrote as the founder's own 13,242.5 kg.
insert into public.workout_sets (
  session_id, exercise_id, user_id, set_number, exercise_order,
  weight_kg, reps, rpe, is_pr, set_type, duration_sec, incline, distance_km
)
select
  'b6a936a8-c730-413e-8c27-14575b093983',
  (select id from public.exercises
    where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c' and name = 'Treadmill'),
  'f405d57b-d09f-4a2e-8a33-0c112f2ec34c',
  1, 0, 0, 0, null, false, 'warmup', 300, 2.0, 0.370
where not exists (
  select 1 from public.workout_sets s
    join public.exercises e on e.id = s.exercise_id
   where s.session_id = 'b6a936a8-c730-413e-8c27-14575b093983'
     and e.name = 'Treadmill'
);

-- And the count the founder asked for: 21 weighted sets plus the treadmill.
-- Hevy counts the warm-up and so does this.
update public.workout_sessions
   set set_count = 22
 where id = 'b6a936a8-c730-413e-8c27-14575b093983';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- select name, equipment, rest_sec from public.exercises order by name;
-- select e.name, s.exercise_order, s.set_number, s.weight_kg, s.reps, s.rpe,
--        s.set_type, s.is_pr, s.duration_sec, s.incline, s.distance_km
--   from public.workout_sets s join public.exercises e on e.id = s.exercise_id
--  where s.session_id = 'b6a936a8-c730-413e-8c27-14575b093983'
--  order by s.exercise_order, s.set_number;
-- select set_count, pr_count, total_volume_kg, duration_min, avg_bpm, calories_burned
--   from public.workout_sessions where id = 'b6a936a8-c730-413e-8c27-14575b093983';
