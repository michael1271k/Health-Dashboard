-- ─────────────────────────────────────────────────────────────────────────────
-- MEASURED REST BETWEEN SETS — one column, and why it is NOT the old one.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST with the service
-- role key, which reads and writes ROWS and cannot issue DDL. There is no
-- `exec_sql` RPC, no `psql` and no Supabase CLI on this machine, so a new
-- column is a paste-into-the-SQL-editor step. Same shape as
-- `docs/sql/cardio-elevation.sql`.
--
-- WHY NOT `rest_sec`, WHICH ALREADY EXISTED
-- `workout_sets.rest_sec` was written by the web deck's client-side stopwatch
-- until 2026-08-19, when both were removed. Across the whole database it never
-- held a value, and the reasoning at the time was sound: what a lifter needs
-- between sets is the plan's TARGET, which `ProgramExercise.restSec` carries.
--
-- What changed is the question. The target answers "how long should I rest";
-- it cannot answer "did I". A block prescribed at 135 s and actually trained at
-- 90 s is a different block, and the difference is invisible in every report
-- the app produces. So this is a SECOND column with a different contract, and
-- the dead one is not resurrected — its name carries the old semantics and the
-- old (empty) history, and reusing it would make "null" ambiguous between
-- "never measured" and "measured by a stopwatch that was removed".
--
-- WHAT WRITES IT
-- The native Live Logger only, as the elapsed gap between COMMITTING one set
-- and committing the next of the same exercise (`LoggerModel.commitSet`). Not
-- the rest TIMER: the timer is a countdown you can skip, ignore or let run out
-- while you take a phone call, so it measures the prescription rather than the
-- behaviour. The gap between two commits is what actually happened.
--
-- WHAT IS DELIBERATELY NULL
--   · every row logged before this column shipped — there is no history to
--     backfill, and inferring one from `set_events.created_at` would be a
--     fabrication (those stamps are seeded from `started_at` for any session
--     pulled from the web, collapsing every gap to zero);
--   · the FIRST set of each exercise, which has no predecessor to rest from;
--   · every set committed from the web, which has no stopwatch any more;
--   · any gap longer than `LoggerModel.restGapCeilingSec` — a set logged after
--     a phone call, a commute or an overnight app suspension is not rest, and
--     one 40-minute outlier would move an average more than the other six sets
--     combined.
--
-- Nullable, no default. A default of 0 would claim every historical set was
-- logged back-to-back, which is the exact class of invented fact this export
-- exists to prevent.
--
-- IDEMPOTENT. `if not exists`; running it twice writes the same schema.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.workout_sets
  add column if not exists actual_rest_sec integer;

comment on column public.workout_sets.actual_rest_sec is
  'MEASURED rest before this set, in seconds — the elapsed gap between '
  'committing the previous set of the same exercise and committing this one. '
  'Written by the native logger only. NULL means not measured: every row '
  'predating the column, every first set of an exercise, every web-committed '
  'set, and any gap above the logger''s outlier ceiling. Distinct from the '
  'dead `rest_sec`, which held the old client stopwatch and never had a value.';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'workout_sets'
--    and column_name in ('actual_rest_sec', 'exercise_order')
--  order by column_name;
--
-- ── ONCE THE LOGGER HAS RUN A FEW SESSIONS ──────────────────────────────────
-- select s.date,
--        e.name,
--        count(w.actual_rest_sec)              as measured_sets,
--        round(avg(w.actual_rest_sec))         as avg_actual_sec
--   from workout_sets w
--   join workout_sessions s on s.id = w.session_id
--   left join exercises e   on e.id = w.exercise_id
--  where w.actual_rest_sec is not null
--  group by s.date, e.name
--  order by s.date desc, e.name;
