-- ─────────────────────────────────────────────────────────────────────────────
-- ELEVATION FOR A CARDIO BOUT — one column, and why it is not derived.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST with the service
-- role key, which reads and writes ROWS and cannot issue DDL. There is no
-- `exec_sql` RPC, no `psql` and no Supabase CLI on this machine, so a new
-- column is a paste-into-the-SQL-editor step. Same shape as
-- `docs/sql/hotfix-polish.sql`.
--
-- WHY IT IS STORED RATHER THAN COMPUTED
-- The obvious objection is that ascent is already implied: the 2026-09-07
-- treadmill bout is 0.37 km at 2 %, which is 7.4 m, and a column for a number
-- you can multiply is a column that can disagree with itself.
--
-- It only holds while the incline is CONSTANT. A real bout is walked at 2 %,
-- then 4 % for the middle, then flat to cool down, and `incline` stores one
-- figure — whichever the machine happened to show. Total ascent is the thing
-- the treadmill (and HealthKit, as `HKQuantityTypeIdentifierDistanceWalkingRunning`'s
-- companion `.elevationAscended`) actually measures, and it cannot be recovered
-- from one incline reading and a distance. So it is measured, not derived.
--
-- WHY `workout_sets` AND NOT `cardio_logs`
-- The in-session bout is a `workout_sets` row — that is where the founder's
-- treadmill lives, beside `duration_sec`, `incline` and `distance_km`, at
-- `exercise_order` 0 of the session it opens. `cardio_logs` is the other
-- shape: a bout HealthKit imported that belongs to a day rather than to a
-- session. Adding the column there too would be speculative — nothing reads it
-- and no import writes it yet — so it is deliberately left out. It is one more
-- line on the day something does.
--
-- IDEMPOTENT. `if not exists`; running it twice writes the same schema.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.workout_sets
  add column if not exists elevation_m numeric(6,1);

comment on column public.workout_sets.elevation_m is
  'Total ascent for a cardio bout, in metres. MEASURED, not derived from '
  '`incline` × `distance_km` — a real bout changes incline and `incline` '
  'stores only one reading.';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- select column_name, data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--  where table_name = 'workout_sets'
--    and column_name in ('duration_sec', 'incline', 'distance_km', 'elevation_m')
--  order by column_name;
