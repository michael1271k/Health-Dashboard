-- ─────────────────────────────────────────────────────────────────────────────
-- HOTFIX DATA/UI — the 2026-09-10 reconciliation, as SQL.
--
-- ── THIS HAS ALREADY BEEN APPLIED ───────────────────────────────────────────
-- Unlike `hotfix-polish.sql` and `treadmill-backfill.sql`, every statement here
-- is DML that PostgREST can issue, so `scripts/repair-sep-2026-data.mjs` ran it
-- from this machine on 2026-09-10 (dry run, apply, dry run again: 13 changes,
-- then 0). This file is the same repair written out for the record and for the
-- SQL editor — run it and it should report zero rows changed. If it changes
-- anything, the script and the database have drifted and that is worth knowing.
--
-- The script is the executable copy and this is the readable one. They are held
-- together by the assertion in § 4: both compute the tonnage from the rows
-- under `SessionVolume`'s weaker-side rule and both refuse to finish unless it
-- comes to 3,680.75 kg.
--
-- IDEMPOTENT. Every write is an absolute value, never a delta.
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED ────────────────────────────────────────
-- `rpe`, `quality`, `is_pr` and `est_1rm_kg` on every row. Those are the
-- athlete's own record of how a set went; a comparison against another app's
-- export has nothing to say about them.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0 · THE TWO SESSIONS ────────────────────────────────────────────────────
-- Resolved by (user, day_key, local date) rather than pasted as uuids, the same
-- way `treadmill-backfill.sql` does it. Asia/Jerusalem is UTC+3 in September; a
-- naive UTC cast files a late session on the following day.
create temporary table _arms on commit drop as
select s.id, s.user_id
  from public.workout_sessions s
 where s.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
   and s.day_key = 'arms'
   and (s.started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-08'
 order by s.started_at
 limit 1;

create temporary table _upper_b on commit drop as
select s.id, s.started_at
  from public.workout_sessions s
 where s.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
   and s.day_key = 'cb_b'
   and (s.started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-03'
 order by s.started_at
 limit 1;

do $$
begin
  if not exists (select 1 from _arms) then
    raise exception 'no 2026-09-08 arms session for this user';
  end if;
  if not exists (select 1 from _upper_b) then
    raise exception 'no 2026-09-03 cb_b session for this user';
  end if;
end $$;

-- ── 1 · THE ONE REP THAT WAS WRONG ──────────────────────────────────────────
-- Seated Incline DB Curl set 2 stored 16 kg × 13; Hevy records 16 kg × 12. That
-- single rep at 16 kg IS the whole tonnage gap: 3,696.75 − 16 = 3,680.75.
--
-- Every other lifted set already agreed with the record, set for set:
--   Shoulder Press            35×10, 35×9, 35×8
--   Overhead Triceps Ext      11.25×15, 12.5×12, 12.5×11
--   Rope Triceps Pushdown     13.75×15, 13.75×13
--   Hammer Curl               20×12, 20×12, 20×10
--   Reverse EZ-Bar Curl       15×15, 15×13
update public.workout_sets s
   set reps = 12
  from _arms t
  join public.exercises e on e.id = s.exercise_id
 where s.session_id = t.id
   and e.name = 'Seated Incline DB Curl'
   and s.set_number = 2
   and s.weight_kg = 16
   and s.reps <> 12;

-- ── 2 · THE TREADMILL'S DISTANCE ────────────────────────────────────────────
-- The bout was 0.4 km over five minutes; `treadmill-backfill.sql` seeded it
-- with `WARMUP_CARDIO`'s proposed 0.370 because the real figure was not to hand
-- that day. It carries no load (`weight_kg 0, reps 0, set_type 'warmup'`), so
-- this corrects the bout and moves no tonnage.
update public.workout_sets s
   set distance_km = 0.400
  from _arms t
  join public.exercises e on e.id = s.exercise_id
 where s.session_id = t.id
   and e.name = 'Treadmill'
   and s.distance_km is distinct from 0.400;

-- ── 3 · ONE MOVEMENT, ONE POSITION ──────────────────────────────────────────
-- `exercise_order` was scrambled: Seated Incline DB Curl had rows under both 1
-- and 2, and Single Arm Lateral Raise under both 2 and 4. Both clients group a
-- session by this column (`SessionAnalysis.grouped`, `useSessionDetail`), so
-- the summary drew two cards for each — one with three sets and one with a
-- stray. Dense from 0, in the order the workout was performed.
--
-- NOTE the lateral raise is NOT flattened to four rows. Hevy lists four sets;
-- this database holds seven — one unsided and three L/R pairs — and under
-- `sessionVolumeKg`'s weaker-side rule those ARE the same four sets
-- (5×16, 5×15, 3.75×19, 3.75×15). Collapsing them would delete the recorded
-- asymmetry (L 15 / R 16) and change no number at all.
update public.workout_sets s
   set exercise_order = o.position
  from _arms t
  join public.exercises e on true
  join (values
      ('Treadmill', 0),
      ('Shoulder Press', 1),
      ('Seated Incline DB Curl', 2),
      ('Overhead Triceps Extension', 3),
      ('Single Arm Lateral Raise', 4),
      ('Rope Triceps Pushdown', 5),
      ('Hammer Curl', 6),
      ('Reverse EZ-Bar Curl', 7)
    ) as o(name, position) on o.name = e.name
 where s.session_id = t.id
   and s.exercise_id = e.id
   and s.exercise_order is distinct from o.position;

-- ── 4 · THE SESSION'S OWN AGGREGATES ────────────────────────────────────────
-- Recomputed from the rows rather than set to a literal: a literal is right
-- once, a recomputation is right after the next repair too.
--
-- `total_volume_kg` is `src/lib/sessions/volume.ts` in SQL — a genuine two-sided
-- pair scores ONCE at its weaker side (min weight × min reps), a lone side or an
-- unpaired row scores as logged, a ghost weighs nothing and a warm-up counts.
-- `set_count` is `countCommittedSets`: each `pair_id` once, every unpaired row
-- once, warm-ups included (the rule `treadmill-backfill.sql § 4` states).
--
-- `session_score` stays null. `save.ts` writes null there; the day's score is a
-- `daily_scores` row and `scripts/recompute-scores.mjs` owns it.
with unit as (
  select
    case when w.pair_id is not null and w.side in ('L', 'R')
         then w.pair_id else w.id::text end as k,
    (w.pair_id is not null and w.side in ('L', 'R')) as paired,
    w.side, w.weight_kg, w.reps
  from public.workout_sets w
  join _arms t on t.id = w.session_id
  where coalesce(w.set_type, 'normal') <> 'ghost'
),
folded as (
  select
    k,
    bool_and(paired) as paired,
    count(*) filter (where side = 'L') as lefts,
    count(*) filter (where side = 'R') as rights,
    min(weight_kg) * min(reps) as weaker_side,
    sum(weight_kg * reps) as as_logged
  from unit group by k
),
totals as (
  select
    round(sum(case when paired and lefts = 1 and rights = 1
                   then weaker_side else as_logged end), 2) as volume_kg,
    count(*) as set_count
  from folded
)
update public.workout_sessions s
   set total_volume_kg = totals.volume_kg,
       set_count       = totals.set_count,
       updated_at      = now()
  from _arms t, totals
 where s.id = t.id
   and (s.total_volume_kg is distinct from totals.volume_kg
     or s.set_count is distinct from totals.set_count);

-- The assertion the whole file exists to satisfy.
do $$
declare
  got numeric;
begin
  select total_volume_kg into got from public.workout_sessions s join _arms t on t.id = s.id;
  if got is distinct from 3680.75 then
    raise exception '2026-09-08 came to % kg, not 3680.75 — the rows and the record disagree', got;
  end if;
end $$;

-- ── 5 · THE CLOCK THAT WAS WRITTEN AFTER IT STOPPED ─────────────────────────
-- 2026-09-03 Upper B: twelve sets and 3,108.5 kg, stored as `duration_min = 2`
-- with `ended_at` 120 seconds after `started_at`. Both halves are corrupt
-- together, so neither can repair the other and no arithmetic recovers the real
-- figure — it has to be chosen.
--
-- What it cost was not the wrong duration on its own page, which is at least
-- visibly absurd, but the wrong DELTA on the next one: 2026-09-10 read
-- "74 min, +72". `SessionAnalysis.Summary.credibleDurationMin` is the code-side
-- half of this fix and would now suppress that delta on its own; this restores
-- the fact so there is nothing to suppress.
--
-- 60 minutes as instructed. For the record, this session's own neighbours —
-- 12-to-14-set sessions in the same fortnight — ran 46 to 48, so 60 is generous
-- rather than typical. `ended_at` moves with it, or a later `closeSession` or
-- pull re-derives the 2 from the stale timestamps.
update public.workout_sessions s
   set duration_min = 60,
       ended_at     = t.started_at + interval '60 minutes',
       updated_at   = now()
  from _upper_b t
 where s.id = t.id
   and (s.duration_min is distinct from 60
     or s.ended_at is distinct from t.started_at + interval '60 minutes');

commit;

-- ── AFTERWARDS ──────────────────────────────────────────────────────────────
-- The daily scores read `duration_min` and `total_volume_kg`, so they are stale
-- until replayed. Already done for 2026-09-03 → 2026-09-10 on 2026-09-10
-- (8/8 recomputed; every figure came back unchanged, so the corrupted duration
-- turned out not to move the battery — but that is a result, not an assumption):
--
--   npx next build && npx next start -p 3117 &
--   node scripts/recompute-scores.mjs --from 2026-09-03 --to 2026-09-10 \
--     --app-url http://localhost:3117 --dry-run
--   HELIX_APPLY=1 node scripts/recompute-scores.mjs --from 2026-09-03 \
--     --to 2026-09-10 --app-url http://localhost:3117
--
-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Eight movements, dense from 0, one block each, and every rating intact.
--
--   select e.name, s.exercise_order, s.set_number, s.weight_kg, s.reps, s.rpe,
--          s.side, s.duration_sec, s.distance_km
--     from public.workout_sets s
--     join public.exercises e on e.id = s.exercise_id
--     join public.workout_sessions w on w.id = s.session_id
--    where w.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
--      and w.day_key = 'arms'
--      and (w.started_at at time zone 'Asia/Jerusalem')::date = date '2026-09-08'
--    order by s.exercise_order, s.set_number;
--
--   -- 3680.75 kg · 21 sets · 76 min, and 60 min on 2026-09-03.
--   select (started_at at time zone 'Asia/Jerusalem')::date as day,
--          day_key, total_volume_kg, set_count, duration_min, ended_at
--     from public.workout_sessions
--    where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'
--      and started_at >= '2026-09-03'
--    order by started_at;
--
-- ── KNOWN, AND NOT REPAIRED HERE ────────────────────────────────────────────
-- The 2026-09-06 Upper A session (8a780ded) holds 18 sets and carries
-- `total_volume_kg = null` and `set_count = null`. It is the same class of hole
-- as § 4 and out of this hotfix's scope; § 4's CTE repairs it verbatim with
-- `_arms` pointed at that session.
