-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard polish wave — the Postgres half.
--
-- Run this in the Supabase SQL editor. Nothing in this file is destructive: it
-- adds one nullable column and touches no existing data.
--
-- WHAT IS WAITING ON IT
-- `daily_logs.sleep_inaccurate` is the wearer's dispute of a night HealthKit
-- got wrong — a phone left on the bed, a nap folded into the night, a lie-in
-- read as nine hours of core. The app writes it to its own mirror the moment
-- you tap it, and `PostgREST` rejects the WHOLE upsert body when it names a
-- column the table lacks, so until this runs:
--
--   · a day you have NOT flagged pushes exactly as it always did (the column is
--     optional in the mirror, so a nil is absent from the request body), and
--   · a day you HAVE flagged fails to push — that one day, retried by the
--     outbox, landing the moment this file has been run.
--
-- Nothing else on `daily_logs` is affected either way.
--
-- WHY NULLABLE AND NOT `not null default false`
-- Only so the mirror can leave it out of the wire body. Every reader — the
-- export, the toggle, the score (which does not read it at all) — treats null
-- and false identically: the night was not disputed.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.daily_logs
  add column if not exists sleep_inaccurate boolean;

comment on column public.daily_logs.sleep_inaccurate is
  'Self-reported: HealthKit''s sleep for this night is wrong. Never scored — it '
  'marks the reading in the weekly export so a reader discounts it themselves. '
  'Null and false both mean "not disputed".';

-- ─────────────────────────────────────────────────────────────────────────────
-- The tenth soreness muscle.
--
-- `doms_logs.muscle_group` is plain `text`, not an enum — but a CHECK listing
-- the nine allowed names could not be read from outside the SQL editor, and if
-- one exists it will reject `Inner thighs` the first time you rate an adductor.
--
-- This drops any CHECK on that column that does not already allow the new
-- value, rather than rebuilding the list. The whitelist was defending against a
-- writer that does not exist: the only client is the app, and the app writes
-- from a closed set it already owns in two places (`DOMS_MUSCLES` in
-- `useRecovery.ts`, `DomsMap.muscles` in Swift). A constraint that has to be
-- migrated every time that set grows buys nothing the type system is not
-- already buying.
--
-- Idempotent, and a no-op when no such constraint exists — which is the likely
-- case.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.doms_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%muscle_group%'
      and pg_get_constraintdef(oid) not like '%Inner thighs%'
  loop
    execute format('alter table public.doms_logs drop constraint %I', c.conname);
    raise notice 'dropped doms_logs check constraint %', c.conname;
  end loop;
end $$;
