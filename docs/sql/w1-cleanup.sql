-- W1 truth wave — drop what nothing reads any more.
-- Paste into the Supabase SQL editor as ONE script. Every statement is
-- idempotent; a second run is a no-op.
--
-- Live facts on 2026-09-10 (PostgREST introspection, 33 tables exposed): the
-- four tables exist and hold 1 / 0 / 0 / 0 rows; `exercise_history(p_exercise_id
-- uuid)` and `delete_my_account()` both exist. No foreign key points at any of
-- the four. `_bak_20260723` is a SCHEMA (docs/PHASE_2_POLISH_PLAN.md), which
-- is why PostgREST cannot see it and why it is dropped as one below.

-- ── 0. Look before dropping ─────────────────────────────────────────────────
-- (a) Functions whose body mentions anything about to go. Expected: zero
--     rows. `delete_my_account()` is the one to watch — an App Review
--     requirement. A row here means STOP: send it back instead of running § 1.
select n.nspname as schema, p.proname as function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prosrc ~* '(widget_tokens|notion_credentials|notion_exports|body_measurements|_bak_20260723|exercise_history)'
  and p.proname <> 'exercise_history';

-- (b) The RPC's real signature, so the DROP below cannot no-op on a mismatch.
--     Expected: one row, `uuid`.
select oidvectortypes(p.proargtypes) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'exercise_history';

-- (c) What the backup schema still holds. For the record; all of it goes.
select table_name from information_schema.tables where table_schema = '_bak_20260723';

-- ── 1. The drops ────────────────────────────────────────────────────────────
-- Plain DROP on the tables, never CASCADE: a view, trigger or policy nobody
-- knew about fails loudly instead of vanishing with the table. The backup
-- schema is the one place CASCADE is the honest choice — the whole schema IS
-- the thing being deleted.
drop function if exists public.exercise_history(uuid);
drop table if exists public.widget_tokens;        -- Capacitor widget auth, deleted in Wave 5
drop table if exists public.notion_credentials;   -- Notion export, web-only, never ported
drop table if exists public.notion_exports;
drop table if exists public.body_measurements;    -- tape measurements, superseded by body_composition
drop schema if exists _bak_20260723 cascade;      -- the 2026-07-23 backup schema

-- ── 2. Confirm ──────────────────────────────────────────────────────────────
-- Expected: 29 rows (33 today, minus the four), none of the names above; and
-- the second query returns no rows.
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
select nspname from pg_namespace where nspname = '_bak_20260723';
