-- W1 truth wave — drop what nothing reads any more.
-- Paste into the Supabase SQL editor as ONE script. Every statement is
-- idempotent; a second run is a no-op.
--
-- Live facts on 2026-09-10 (PostgREST introspection): the four tables exist
-- and hold 1 / 0 / 0 / 0 rows; `exercise_history(p_exercise_id uuid)` and
-- `delete_my_account()` both exist. No foreign key points at any of the four.
-- `_bak_20260723` could not be seen through PostgREST (identical 404 for
-- "absent" and "not exposed"), hence IF EXISTS.

-- ── 0. Stop if anything still depends on what is about to go ────────────────
-- Expected: zero rows. A row here names a function whose body mentions one
-- of the tables — `delete_my_account()` is the one to watch, it is an App
-- Review requirement and must keep working. Do NOT run § 1 until this is empty;
-- send the row back instead.
select n.nspname as schema, p.proname as function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prosrc ~* '(widget_tokens|notion_credentials|notion_exports|body_measurements|_bak_20260723|exercise_history)'
  and p.proname <> 'exercise_history';

-- ── 1. The drops ────────────────────────────────────────────────────────────
-- Plain DROP, never CASCADE: a view, trigger or policy nobody knew about
-- fails this loudly instead of vanishing with the table.
drop function if exists public.exercise_history(uuid);
drop table if exists public.widget_tokens;        -- Capacitor widget auth, deleted in Wave 5
drop table if exists public.notion_credentials;   -- Notion export, web-only, never ported
drop table if exists public.notion_exports;
drop table if exists public.body_measurements;    -- tape measurements, superseded by body_composition
drop table if exists public._bak_20260723;

-- ── 2. Confirm ──────────────────────────────────────────────────────────────
-- Expected: 28 rows, none of the five names above.
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
