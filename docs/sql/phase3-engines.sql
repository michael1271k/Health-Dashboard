-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 · E2 — the DDL half of the sleep trim engine.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST with the service
-- role key, which can read and write ROWS and cannot issue DDL. No `exec_sql`
-- RPC, no `psql`, no Supabase CLI on the build machine — so an index is a
-- paste-into-the-SQL-editor step by construction, the same shape as
-- `hotfix-polish.sql` and `e6-auth-deletion.sql`.
--
-- WHAT IT GUARDS
-- `sleep_sessions` is keyed by its night WINDOW (`[prev 12:00Z, D 12:00Z)` on
-- `start_time`), not by a date column, and until E2 the web ingest wrote a
-- night as delete + insert. Two pushes racing each other left two rows for
-- one night — live on 2026-09-06: `2026-09-04T23:46` ×2 and `2026-09-05T22:46`
-- ×2, 22 s apart. Both writers now UPDATE the existing row by id (the phone
-- always did; `dailyLog.ts` does from E2), so this index is the backstop for
-- the race rather than something the code depends on winning. An insert that
-- loses it is refused (23505) instead of duplicating the night: the web
-- reports it in the ingest response; the phone's outbox retries it with
-- backoff and shows it in the Sync Doctor as a failed item until the next
-- window pull brings the server's row down.
--
-- MUST STAY AN INDEX, NOT A CONSTRAINT. The mirror catalogue introspects
-- `pg_constraint` for each table's upsert target (`gen-mirror-swift.mjs`);
-- a UNIQUE constraint here would flip `sleep_sessions` from `conflict: id` to
-- `user_id,start_time`, and every trim that moves `start_time` would then
-- insert a second night beside the first — the exact bug E2 exists to end.
--
-- IDEMPOTENT. The dedupe deletes only rows that have a twin, keeping the
-- longest (then the oldest id); the index is `if not exists`. Running it twice
-- writes the same rows.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · THE DUPLICATE NIGHTS ─────────────────────────────────────────────────
-- Keep one row per (user_id, start_time): the longest duration first, the
-- oldest id second, so a later re-push that happened to be shorter never
-- outranks the fuller reading. A hand-edited night (`hk_uuid` starting
-- `manual-sleep-`) always wins its group — the user's correction is not a
-- duplicate of what HealthKit said.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, start_time
           order by (hk_uuid like 'manual-sleep-%') desc, duration_min desc, created_at asc, id asc
         ) as rn
  from public.sleep_sessions
)
delete from public.sleep_sessions s
using ranked r
where s.id = r.id and r.rn > 1;

-- ── 2 · ONE NIGHT PER BEDTIME ────────────────────────────────────────────────
create unique index if not exists sleep_sessions_user_start
  on public.sleep_sessions (user_id, start_time);

comment on index public.sleep_sessions_user_start is
  'One sleep row per (user, bedtime). Both clients update the night in place; '
  'this is the backstop for the delete+insert race that duplicated two nights '
  'on 2026-09-04/05 (Phase 3 E2).';

commit;

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- Expect zero rows.
select user_id, start_time, count(*)
from public.sleep_sessions
group by user_id, start_time
having count(*) > 1;
