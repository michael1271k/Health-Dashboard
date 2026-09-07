-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 · WAVE E6 — SET A: open sign-up and account deletion
--
-- PASTE THIS INTO THE SUPABASE SQL EDITOR BY HAND. No agent runs it.
-- Every statement is idempotent: running the whole file twice is a no-op.
--
-- ── WHAT COULD NOT BE VERIFIED FIRST, AND WHY IT DOES NOT MATTER HERE ────────
-- The schema check for this wave could reach the live database only through
-- PostgREST, which exposes `public` and `graphql_public` and nothing else — so
-- `pg_trigger`, `pg_policies`, `pg_constraint` and the advisors were all out of
-- reach, and NOTHING below is written on an assumption about what is already
-- there. What WAS verified live, with the service key: all 32 public tables
-- exist and every one of them carries a `user_id uuid`; `profiles.role`
-- defaults to `'user'` and the single existing row is `'admin'`; `user_goals`
-- self-fills every NOT NULL column but `user_id`; `plans.name` has no default.
--
-- Consequences, deliberate:
--  · `create or replace` / `drop … if exists` everywhere, so this file does not
--    care whether a trigger or function is already installed.
--  · The delete function names all 32 tables EXPLICITLY rather than looping
--    over a catalog query. It is longer and it is the right trade: no dynamic
--    SQL inside a `security definer` body, and with `search_path = ''` a
--    misspelled table name fails at CREATE time rather than at delete time.
--  · Because the FK graph could not be read, the deletes are ordered
--    children-before-parents on the app's own known references. If any of them
--    is in fact `on delete cascade`, the child delete is simply a no-op.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. A NEW USER GETS THE THREE ROWS THE APP ASSUMES EXIST
--
-- Open sign-up means the app will meet users it did not create by hand. Every
-- screen that reads `profiles`, `user_goals` or `plans` must find a row or it
-- renders a crash instead of an empty state, and a signup that 500s because a
-- downstream insert failed is the worst first impression an app can make.
--
-- `on conflict do nothing` on each insert: the ONE realistic failure is a row
-- that already exists (a re-invited email, a replayed trigger). Any other error
-- is a real bug and is allowed to surface — a trigger that swallows exceptions
-- would let a user sign up into a half-built account, which is worse.
--
-- The conflict clauses name NO TARGET, deliberately. `on conflict (user_id)`
-- requires a unique index on exactly that column, and the constraints could not
-- be read (see the header). `profiles.user_id` is the primary key so a target
-- would work there, but `user_goals`' primary key is `id` — if `user_id` has no
-- unique index, `on conflict (user_id)` raises 42P10 INSIDE THE TRIGGER, and a
-- trigger that raises makes every sign-up fail with a 500. The untargeted form
-- catches any unique violation and cannot fail that way.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 'member' is stated rather than left to the column default, which is 'user'.
  -- The TypeScript type has always said `'admin' | 'member'`, so the default is
  -- drift; naming the value here means a new account is correct whichever of
  -- the two the column eventually settles on.
  insert into public.profiles (user_id, role)
  values (new.id, 'member')
  on conflict do nothing;

  -- Every other NOT NULL column on user_goals carries its own default.
  insert into public.user_goals (user_id)
  values (new.id)
  on conflict do nothing;

  -- `plans.name` is NOT NULL with no default, so the trigger must supply one.
  insert into public.plans (user_id, name)
  values (new.id, 'My Plan')
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. DELETE MY ACCOUNT
--
-- App Store guideline 5.1.1(v): an account that can be created in the app must
-- be deletable in the app. This is that function.
--
-- `security definer` because a user's own JWT cannot touch `auth.users`, and
-- `set search_path = ''` because a definer function that resolves unqualified
-- names through the caller's search_path is a privilege-escalation primitive.
-- Both are load-bearing; do not relax either.
--
-- Execute is granted to `authenticated` ONLY. `anon` must never reach it: the
-- function keys entirely off `auth.uid()`, and an anonymous caller's `auth.uid()`
-- is null, which the guard below turns into an exception rather than a delete of
-- every row whose `user_id` is null.
--
-- THE CLIENT MUST SIGN OUT IMMEDIATELY AFTER CALLING THIS. The row in
-- `auth.users` is gone, but the JWT already issued stays valid until it expires,
-- so a client that keeps using it holds a token for a user that no longer
-- exists. `AppEnvironment.signOut()` and the web `/delete-account` page both do
-- this; anything else calling the RPC must too.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  -- Not an assertion for the developer's benefit: without it, an unauthenticated
  -- caller would run every statement below with `user_id = null`, which matches
  -- nothing today and would match everything the day a nullable user_id appears.
  if uid is null then
    raise exception 'delete_my_account: no authenticated user';
  end if;

  -- Children first. Where a foreign key already cascades, these are no-ops.
  delete from public.workout_sets        where user_id = uid;
  delete from public.personal_records    where user_id = uid;
  delete from public.routine_templates   where user_id = uid;
  delete from public.doms_logs           where user_id = uid;
  delete from public.plan_phase_goals    where user_id = uid;
  delete from public.plan_phase_volume   where user_id = uid;
  delete from public.program_day_layout  where user_id = uid;
  delete from public.schedule_overrides  where user_id = uid;
  delete from public.notion_exports      where user_id = uid;

  -- Everything that describes a DAY, before `daily_logs` itself. Alphabetical
  -- order would have put `daily_logs` first, and if any of the three tables
  -- below turns out to reference it with `on delete restrict`, that ordering
  -- makes the function fail forever — which is a 5.1.1(v) blocker, not a
  -- cosmetic bug. The FK graph could not be read (see the header), so the order
  -- is chosen to be correct under either answer; it costs nothing to be safe.
  delete from public.daily_metrics       where user_id = uid;
  delete from public.daily_scores        where user_id = uid;
  delete from public.daily_targets       where user_id = uid;
  delete from public.nutrition_entries   where user_id = uid;
  delete from public.water_intake        where user_id = uid;
  delete from public.supplement_log      where user_id = uid;
  delete from public.fatigue_logs        where user_id = uid;
  delete from public.cardio_logs         where user_id = uid;
  delete from public.body_composition    where user_id = uid;
  delete from public.body_measurements   where user_id = uid;
  delete from public.sleep_sessions      where user_id = uid;
  delete from public.daily_logs          where user_id = uid;

  -- Leaves: referenced by nothing.
  delete from public.custom_supplements  where user_id = uid;
  delete from public.dashboard_layouts   where user_id = uid;
  delete from public.notion_credentials  where user_id = uid;
  delete from public.reports             where user_id = uid;
  delete from public.target_profiles     where user_id = uid;
  delete from public.widget_tokens       where user_id = uid;

  -- Parents.
  delete from public.workout_sessions    where user_id = uid;
  delete from public.exercises           where user_id = uid;
  delete from public.plans               where user_id = uid;
  delete from public.user_goals          where user_id = uid;
  delete from public.profiles            where user_id = uid;

  -- Last, and only once every row above is gone: the identity itself. If any
  -- delete above raised, the whole function has already rolled back and the
  -- account still exists — which is the correct failure. A half-deleted account
  -- with a live login is not.
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. CLEANUP
--
-- `widget_tokens` held one row and is dead: the widget reads the shared app
-- group store, not a token table. `_bak_20260723` was checked and does not
-- exist. The two `notion_*` tables are empty and belong to the Notion era, but
-- they are LEFT IN PLACE — `delete_my_account` names them, and dropping a table
-- the deletion path depends on is a change that has to be made in that order,
-- not this one.
--
-- Left commented. Uncomment only after confirming nothing reads it.
-- ═════════════════════════════════════════════════════════════════════════════

-- drop table if exists public.widget_tokens;

-- `profiles.role` defaults to 'user', but the TypeScript type has said
-- `'admin' | 'member'` since it was written and nothing in either client
-- understands 'user'. The trigger above names 'member' explicitly so a new
-- account is correct either way; this aligns the column so a row inserted by
-- anything ELSE is correct too. Safe: it changes no existing row.
--
-- alter table public.profiles alter column role set default 'member';


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — run these after the file, and read the output
-- ═════════════════════════════════════════════════════════════════════════════

-- The trigger is installed and fires after insert:
--   select tgname, tgenabled, pg_get_triggerdef(oid)
--   from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- Both functions are definer with an empty search_path:
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in ('handle_new_user', 'delete_my_account');

-- Only `authenticated` can call the delete:
--   select grantee, privilege_type from information_schema.routine_privileges
--   where routine_name = 'delete_my_account';

-- The founder is still admin (this must print exactly one 'admin' row):
--   select user_id, role from public.profiles;
