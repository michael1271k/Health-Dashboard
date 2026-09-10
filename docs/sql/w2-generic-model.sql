-- ─────────────────────────────────────────────────────────────────────────────
-- W2 · THE GENERIC DATA MODEL — the DDL half. Paste this file FIRST, then
-- `w2-seed-founder.sql`. The schema is FROZEN after this file: W3–W5 add no
-- columns, so every column those waves need is created here (§ 9 lists them).
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST, which reads and
-- writes ROWS and cannot issue DDL. No `exec_sql` RPC, no `psql`, no Supabase
-- CLI on the build machine — so a new table is a paste-into-the-SQL-editor
-- step by construction, the same shape as `wave-10-set-events.sql`.
--
-- WHAT IT DOES
-- Until now the founder's training plan lived in Swift: the three decks
-- (`Program.onyx5` / `.onyx4` / `.pplLegacy`), the eight dated phases
-- (`Phases.all`), the nutrition ladder (`Levers.all` + `Levers.schedule`), the
-- asserted record book (`PrTruth.book`) and the supplement seed. A second
-- account inherits all of it and cannot change any of it. This file gives each
-- of those a table or a column; the seed file moves the founder's numbers into
-- rows; W2's Swift then reads rows only and the constants are deleted.
--
--   § 1  routines        — the prescription: one row per program day, exercises
--                          in a jsonb payload (decision D1: no child table, the
--                          mirror generator has no child-table support)
--   § 2  plan_phases     — the dated blocks a plan is made of (`Phases.all`)
--   § 2b lever_periods   — when each nutrition rung came into force (`Levers.schedule`)
--   § 3  stress_logs     — the psych self-report W4's "Head" row writes; feeds
--                          the Stress index's `self` term (decision 3 / D6)
--   § 4  exercises       — slug (the legacy `helix5-…` id as an alias column,
--                          D2/D3), secondary_muscles, rep window, archived_at
--   § 5  custom_supplements — structured dose (W4's stack list), sort_order,
--                          archived_at (the mirror fixture already carries it;
--                          the live table did not — 2026-09-10 introspection)
--   § 6  cardio_logs.elevation_m — W5's HealthKit prefill (plan F9)
--   § 7  plans           — blurb, is_legacy, sort: the picker's catalogue entry
--                          (`PlanInfo`) as columns; one row per program per user
--   § 8  plan_phase_goals / target_profiles — the `PhaseGoals` fields with no
--                          column, and the profile KIND that makes a lever a row
--   § 9  verify          — every column W3–W5 read, in one query
--
-- IDEMPOTENT. `if not exists` throughout; policies and triggers are dropped and
-- recreated; the slug backfill only touches rows whose slug is null. Running it
-- twice writes the same schema.
--
-- RLS is the same `auth.uid() = user_id` the other 29 tables use. The service
-- role key the scripts use bypasses it; the phone and the web go through it.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0 · `updated_at`, maintained by the server ──────────────────────────────
-- The mirror's delta pull trusts `updated_at` only when the SERVER stamps it
-- (`native/schema/supabase.json` → strategies.cursor): a phone-written
-- timestamp from a slow device lands in the past and the row is skipped
-- forever. One function, reused by every trigger below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1 · routines ─────────────────────────────────────────────────────────────
-- `routine_templates` stays as it is: it stores the LAST-PERFORMED sets of a
-- day (a cache of the last save), not the prescription. This is the
-- prescription. `accent` is the day's colour as 0xRRGGBB — the same number
-- `ProgramDay.accent` carried — because OnyxCore imports Foundation and
-- nothing else and the view turns it into a colour.
create table if not exists public.routines (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  program_id  text        not null,
  day_key     text        not null,
  label       text        not null,
  sub         text,
  weekday     smallint    not null check (weekday between 0 and 6),
  accent      integer     not null default 9079438,   -- 0x8A8A8E, the "no day" grey
  sort        smallint    not null default 0,
  payload     jsonb       not null default '{"version": 1, "exercises": []}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, program_id, day_key)
);

comment on table public.routines is
  'One row per program day: what the logger shows. `payload` is '
  '{version:1, exercises:[{exerciseId, name, sets, cutSets, reps, restSec, wk1Kg, compound, note}]}; '
  'movers come from the exercise catalogue / MuscleMap by name, never from the payload (D1).';
comment on column public.routines.weekday is '0 = Sunday … 6 = Saturday. Lays out the PLAN; never used to classify a logged session.';
comment on column public.routines.accent is 'The day''s colour as 0xRRGGBB.';

drop trigger if exists routines_set_updated_at on public.routines;
create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

-- The delta pull: "this user's rows since my cursor". The PK leads with
-- user_id but is ordered by (program_id, day_key), so it cannot serve a
-- range on updated_at.
create index if not exists routines_user_updated
  on public.routines (user_id, updated_at);

alter table public.routines enable row level security;
drop policy if exists routines_select_own on public.routines;
create policy routines_select_own on public.routines
  for select using (auth.uid() = user_id);
drop policy if exists routines_insert_own on public.routines;
create policy routines_insert_own on public.routines
  for insert with check (auth.uid() = user_id);
drop policy if exists routines_update_own on public.routines;
create policy routines_update_own on public.routines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists routines_delete_own on public.routines;
create policy routines_delete_own on public.routines
  for delete using (auth.uid() = user_id);

-- ── 2 · plan_phases ──────────────────────────────────────────────────────────
-- `era` is a WIRE value shared with the golden fixtures: the Onyx era is
-- spelled 'helix' there and renaming it would desynchronise every vector to
-- change a string nobody sees (`PhaseEra`).
create table if not exists public.plan_phases (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  plan_id     text        not null,
  start       date        not null,
  kind        text        not null check (kind in ('cut', 'peak', 'bulk', 'deload')),
  name        text        not null,
  short       text,
  weeks       smallint    not null check (weeks > 0),
  numbered    boolean     not null default false,
  first_week  smallint,
  era         text        check (era in ('ppl', 'helix')),
  era_tag     text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, plan_id, start)
);

comment on table public.plan_phases is
  'The dated blocks a plan is made of (`Phases.all` until W2). A phase is a direction '
  '(cut/bulk), a polished end state (peak) or a bounded easing-off (deload); never a diet.';
comment on column public.plan_phases.start is 'YYYY-MM-DD, the week start the block opens on.';

drop trigger if exists plan_phases_set_updated_at on public.plan_phases;
create trigger plan_phases_set_updated_at
  before update on public.plan_phases
  for each row execute function public.set_updated_at();

alter table public.plan_phases enable row level security;
drop policy if exists plan_phases_select_own on public.plan_phases;
create policy plan_phases_select_own on public.plan_phases
  for select using (auth.uid() = user_id);
drop policy if exists plan_phases_insert_own on public.plan_phases;
create policy plan_phases_insert_own on public.plan_phases
  for insert with check (auth.uid() = user_id);
drop policy if exists plan_phases_update_own on public.plan_phases;
create policy plan_phases_update_own on public.plan_phases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists plan_phases_delete_own on public.plan_phases;
create policy plan_phases_delete_own on public.plan_phases
  for delete using (auth.uid() = user_id);

-- ── 2b · lever_periods ───────────────────────────────────────────────────────
-- `Levers.schedule` verbatim: WHEN each rung came into force, newest last.
-- The plan (D4) had this materialised as one `daily_targets` row per past
-- day; the design review (2026-09-10) rejected that because a `daily_targets`
-- row MEANS "the user shaped this day" (the Nutrition tab and the export badge
-- it), and fifty-eight synthetic rows would make the one real override
-- (2026-09-01, Restaurant) indistinguishable from the ladder. A period is what
-- the schedule always was, so it gets its own table and `Targets.resolve` is
-- unchanged.
--
-- `profile_key` names a `target_profiles` row of kind deficit/release; NULL is
-- the `custom` stretch — "back to my own numbers" — and `goals` pins what
-- those numbers were once the stretch is CLOSED by the next row. A release
-- row must always be followed by the rung that resumes, or it is a permanent
-- 2,151 kcal; the app writes the resuming row itself when the lever changes.
create table if not exists public.lever_periods (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  starts_on    date        not null,
  profile_key  text,
  goals        jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, starts_on)
);

comment on table public.lever_periods is
  'The nutrition ladder''s history: the rung (a target_profiles key of kind deficit/release) in force '
  'from `starts_on` until the next row. NULL profile_key = the user''s own numbers, pinned in `goals` '
  '({calorie, protein, carbs, fat, steps}) once the stretch is closed.';

drop trigger if exists lever_periods_set_updated_at on public.lever_periods;
create trigger lever_periods_set_updated_at
  before update on public.lever_periods
  for each row execute function public.set_updated_at();

alter table public.lever_periods enable row level security;
drop policy if exists lever_periods_select_own on public.lever_periods;
create policy lever_periods_select_own on public.lever_periods
  for select using (auth.uid() = user_id);
drop policy if exists lever_periods_insert_own on public.lever_periods;
create policy lever_periods_insert_own on public.lever_periods
  for insert with check (auth.uid() = user_id);
drop policy if exists lever_periods_update_own on public.lever_periods;
create policy lever_periods_update_own on public.lever_periods
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists lever_periods_delete_own on public.lever_periods;
create policy lever_periods_delete_own on public.lever_periods
  for delete using (auth.uid() = user_id);

-- ── 3 · stress_logs ──────────────────────────────────────────────────────────
-- The same shape as `fatigue_logs` — one row per (day, slot), level 1–5 —
-- plus the tag chips W4 offers. NOT a battery input (founder decision 3): the
-- Stress index reads the day mean as the second half of its `self` term.
create table if not exists public.stress_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  date        date        not null,
  slot        text        not null,
  level       smallint    not null check (level between 1 and 5),
  tags        text[]      not null default '{}',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date, slot)
);

comment on table public.stress_logs is
  'Psychological stress self-report, 1 (calm) … 5 (overwhelmed), up to one row per slot per day. '
  'Feeds the Stress index `self` term beside fatigue (D6); never a Battery input.';
comment on column public.stress_logs.tags is 'Free chips: work, study, family, money, health, travel, other.';

drop trigger if exists stress_logs_set_updated_at on public.stress_logs;
create trigger stress_logs_set_updated_at
  before update on public.stress_logs
  for each row execute function public.set_updated_at();

-- The window pull: "this user's rows with date >= window start". The UNIQUE
-- above is (user_id, date, slot) and already serves it; no second index.

alter table public.stress_logs enable row level security;
drop policy if exists stress_logs_select_own on public.stress_logs;
create policy stress_logs_select_own on public.stress_logs
  for select using (auth.uid() = user_id);
drop policy if exists stress_logs_insert_own on public.stress_logs;
create policy stress_logs_insert_own on public.stress_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists stress_logs_update_own on public.stress_logs;
create policy stress_logs_update_own on public.stress_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists stress_logs_delete_own on public.stress_logs;
create policy stress_logs_delete_own on public.stress_logs
  for delete using (auth.uid() = user_id);

-- ── 4 · exercises — the catalogue grows the columns the routine needs ───────
-- `equipment text[]` and `rest_sec` already exist (2026-09-10 introspection),
-- so they are not repeated here.
alter table public.exercises
  add column if not exists slug              text,
  add column if not exists secondary_muscles text[],
  add column if not exists rep_floor         smallint,
  add column if not exists rep_ceiling       smallint,
  add column if not exists archived_at       timestamptz;

comment on column public.exercises.slug is
  'The legacy local id (`helix5-<name-slug>`) this row answers for. A set logged on the phone '
  'before W2 carries it in workout_sets.exercise_id; the app resolves it through this column. '
  'Read-only after W2: new sets carry the uuid.';

-- The backfill. The expression is `ExerciseSlug.id` in SQL — lower-case,
-- every run of non-alphanumerics to one hyphen, hyphens trimmed — and it must
-- stay byte-identical to the Swift, or a set logged in August stops resolving.
-- One slug per user: where two names collapse to one slug, the older row keeps
-- it and the newer one stays null (the seed file corrects the founder's).
with ranked as (
  select id,
         'helix5-' || trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as slug,
         row_number() over (
           partition by user_id, trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
           order by created_at, id
         ) as rn
  from public.exercises
  where slug is null
)
update public.exercises e
   set slug = r.slug
  from ranked r
 where e.id = r.id and r.rn = 1
   and not exists (select 1 from public.exercises x where x.user_id = e.user_id and x.slug = r.slug);

create unique index if not exists exercises_user_slug
  on public.exercises (user_id, slug) where slug is not null;

-- ── 5 · custom_supplements — a structured dose, an order, an archive ────────
alter table public.custom_supplements
  add column if not exists dose_amount numeric,
  add column if not exists dose_unit   text,
  add column if not exists sort_order  smallint not null default 0,
  add column if not exists archived_at timestamptz;

comment on column public.custom_supplements.dose_amount is 'The number in `dose` ("300 mg" → 300), when the row was written by W4''s list; `dose` stays the display string.';
comment on column public.custom_supplements.dose_unit is 'mg | g | mcg | IU | ml | tab | cap | scoop — the unit in `dose`.';
comment on column public.custom_supplements.archived_at is 'When the item left the stack. Archive, never delete: `supplement_log.item_key` joins to `schedule->>''key''`.';

-- ── 6 · cardio_logs.elevation_m ──────────────────────────────────────────────
-- `workout_sets.elevation_m` exists since `cardio-elevation.sql`; this is the
-- day-keyed HealthKit bout's copy, which W5's cardio sheet prefills.
alter table public.cardio_logs
  add column if not exists elevation_m numeric(6,1);

comment on column public.cardio_logs.elevation_m is 'Total ascent, metres. MEASURED (HealthKit elevationAscended), never derived from incline × distance.';

-- ── 7 · plans — the picker's catalogue entry, as columns ────────────────────
-- `PlanInfo` was id + label + blurb + isLegacy. `name` is the label; the other
-- two get columns; `sort` orders the picker (live plans first, legacy last).
alter table public.plans
  add column if not exists blurb     text,
  add column if not exists is_legacy boolean  not null default false,
  add column if not exists sort      smallint not null default 0;

-- One row per program per user. `program_id` is nullable (the sign-up trigger
-- in `e6-auth-deletion.sql` creates a row with none), so the index is partial.
create unique index if not exists plans_user_program
  on public.plans (user_id, program_id) where program_id is not null;

comment on column public.plans.is_legacy is 'A historical plan — still selectable so old sessions render, sorted below the live ones.';

-- ── 8 · plan_phase_goals / target_profiles ──────────────────────────────────
-- `PhaseGoals` carried three things `plan_phase_goals` had no column for.
alter table public.plan_phase_goals
  add column if not exists label                text,
  add column if not exists fiber_g              integer,
  add column if not exists body_fat_ceiling_pct numeric;

comment on column public.plan_phase_goals.body_fat_ceiling_pct is 'Bulk only — the body-fat percentage at which the bulk ends.';

-- A LEVER is a profile with a kind. `day` is what every existing row is
-- (Home, Restaurant — a shape one day can take); `deficit` rungs are the
-- ordered ladder of a cut; `release` is a planned, bounded week at
-- maintenance. `Levers.all` becomes rows of this table.
alter table public.target_profiles
  add column if not exists kind text not null default 'day'
    check (kind in ('day', 'deficit', 'release'));

comment on column public.target_profiles.kind is 'day = a one-day shape; deficit = a rung of the cut''s ladder; release = a maintenance week. The ladder is the deficit rows in `sort` order.';

commit;

-- PostgREST reloads its schema cache on DDL by itself on Supabase; this is the
-- belt to that brace, and harmless if it is not needed.
notify pgrst, 'reload schema';

-- ── 9 · VERIFY — every column W2–W5 read ─────────────────────────────────────
-- Expect 37 rows. A missing one is a column a later wave will fail on.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (
     ('routines', 'payload'), ('routines', 'accent'), ('routines', 'weekday'), ('routines', 'sort'),
     ('plan_phases', 'start'), ('plan_phases', 'kind'), ('plan_phases', 'era_tag'), ('plan_phases', 'first_week'),
     ('lever_periods', 'starts_on'), ('lever_periods', 'profile_key'), ('lever_periods', 'goals'),
     ('stress_logs', 'slot'), ('stress_logs', 'level'), ('stress_logs', 'tags'), ('stress_logs', 'note'),
     ('exercises', 'slug'), ('exercises', 'secondary_muscles'), ('exercises', 'rest_sec'),
     ('exercises', 'rep_floor'), ('exercises', 'rep_ceiling'), ('exercises', 'archived_at'),
     ('custom_supplements', 'form'), ('custom_supplements', 'dose_amount'), ('custom_supplements', 'dose_unit'),
     ('custom_supplements', 'sort_order'), ('custom_supplements', 'archived_at'),
     ('cardio_logs', 'elevation_m'), ('cardio_logs', 'active_kcal'), ('cardio_logs', 'total_kcal'),
     ('plans', 'blurb'), ('plans', 'is_legacy'), ('plans', 'sort'), ('plans', 'started_on'),
     ('plan_phase_goals', 'label'), ('plan_phase_goals', 'fiber_g'), ('plan_phase_goals', 'body_fat_ceiling_pct'),
     ('target_profiles', 'kind')
   )
 order by table_name, column_name;
