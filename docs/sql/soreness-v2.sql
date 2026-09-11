-- ─────────────────────────────────────────────────────────────────────────────
-- Soreness Muscle Contour Map v2 — laterality, sub-regions, joint flags.
--
-- Run in the Supabase SQL editor. Idempotent: safe to run twice.
--
-- Spec: docs/superpowers/specs/2026-09-12-soreness-contour-map-v2-design.md
--
-- ── WHAT CHANGES AND WHY THE KEY HAS TO WIDEN ────────────────────────────────
-- `doms_logs` upserts on (user_id, date, muscle_group). Left Bicep and Right
-- Bicep are two facts about one day, so under that key the second overwrites the
-- first and laterality is simply unstorable. The STORAGE key widens; the SCORING
-- key does not — the readiness engine folds every row for a muscle down to one
-- max severity, which is what keeps historical battery numbers invariant.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.doms_logs
  add column if not exists side       text not null default 'both',
  add column if not exists sub_region text not null default '';

comment on column public.doms_logs.side is
  'left | right | both. ''both'' is the default and the meaning every row '
  'written before 2026-09-12 already had.';
comment on column public.doms_logs.sub_region is
  'A sub-key BELOW muscle_group (''Erectors'', ''Abductors'', …), or '''' for the '
  'whole muscle. Never a member of DOMS_MUSCLES — see SUB_REGIONS in '
  'src/lib/body/subRegions.ts. Record-only: the scoring engine never reads it.';

-- NOT NULL with defaults on purpose. Postgres treats NULLs as DISTINCT in a
-- unique index, so a nullable `side` would let the same (muscle, null) row be
-- inserted without limit. Sentinels ('both', '') make the index actually unique
-- without needing NULLS NOT DISTINCT, which is PG15+ only.

-- Idempotent: `add constraint` has no IF NOT EXISTS, and this file gets re-run.
do $$ begin
  alter table public.doms_logs
    add constraint doms_logs_side_check check (side in ('left','right','both'));
exception when duplicate_object then null; end $$;

-- ── DROP THE NARROW UNIQUE KEY, BY SHAPE ─────────────────────────────────────
-- The existing unique key is referenced only by an `onConflict` STRING, so the
-- app never revealed whether it is a constraint or a bare index, or what it is
-- called. A constraint-backed index cannot be dropped with `drop index`
-- ("cannot drop index … because constraint … requires it"), so handle both.
do $$
declare c record; ix record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.doms_logs'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%muscle_group%'
      and pg_get_constraintdef(oid) not like '%sub_region%'
  loop
    execute format('alter table public.doms_logs drop constraint %I', c.conname);
    raise notice 'dropped doms_logs unique constraint %', c.conname;
  end loop;

  for ix in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'doms_logs'
      and indexdef like '%UNIQUE%'
      and indexdef like '%muscle_group%'
      and indexdef not like '%sub_region%'
  loop
    execute format('drop index public.%I', ix.indexname);
    raise notice 'dropped doms_logs unique index %', ix.indexname;
  end loop;
end $$;

create unique index if not exists doms_logs_row_key
  on public.doms_logs (user_id, date, muscle_group, side, sub_region);

-- ── JOINT FLAGS ──────────────────────────────────────────────────────────────
-- Binary by construction: the row's existence IS the flag. No severity column,
-- because a 1–10 scale nothing reads is a field that only ever rots. Nothing in
-- the scoring engine reads this table, and a test asserts that.
create table if not exists public.joint_flags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  joint      text not null,
  side       text not null default 'both' check (side in ('left','right','both')),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, date, joint, side)
);

comment on table public.joint_flags is
  'Non-muscle discomfort — knees, wrists, elbows, AC joints, the lumbar '
  'junction. Presence is the datum. Never scored, never gates a workout: audit '
  'history and the raw weekly export only.';

alter table public.joint_flags enable row level security;

do $$ begin
  create policy joint_flags_own on public.joint_flags
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists joint_flags_user_date on public.joint_flags (user_id, date);

-- ── THE AUDIT THIS WAVE'S RE-GRADE NEEDS ─────────────────────────────────────
-- The readiness denominator becomes a mean over DISTINCT RECOGNISED muscle
-- groups. Any row whose muscle_group is not one of the ten stops counting.
-- Run this BEFORE trusting the new scores — it is the scope of the change.
--
--   select user_id, muscle_group, count(*)
--   from public.doms_logs
--   where muscle_group not in ('Chest','Back','Arms','Shoulders','Abs',
--                              'Glutes','Quads','Hamstrings','Inner thighs','Calves')
--   group by 1, 2 order by 3 desc;
--
-- The demo account is known to hold 'Quadriceps' and 'Lats' rows, written by
-- scripts/seed-demo-account.mjs. Those rows can never be read back as ratings
-- and have been inflating (or deflating) its battery ever since.
