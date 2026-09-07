-- ─────────────────────────────────────────────────────────────────────────────
-- THE EVENT LOG, ON THE SERVER — Wave 10, the Watch logging client.
--
-- WHY THIS IS A FILE AND NOT A SCRIPT
-- Everything in this repo reaches Supabase through PostgREST with the service
-- role key, which reads and writes ROWS and cannot issue DDL. There is no
-- `exec_sql` RPC, no `psql` and no Supabase CLI on this machine, so a new table
-- is a paste-into-the-SQL-editor step. Same shape as
-- `docs/sql/cardio-elevation.sql` and `docs/sql/hotfix-polish.sql`.
--
-- WHY THE SERVER NEEDS THE EVENTS AND NOT JUST THE ROWS
-- Until now the server held only the PROJECTION: `workout_sets`, one row per
-- surviving set, written by `SyncEngine`'s row reconcile. That was sufficient
-- while one device wrote, and it stops being sufficient the moment two do.
--
-- `TrainingPuller.applyPulledSets` refuses to write pulled rows into any
-- session that already has local `set_events` — it has to, because those rows
-- are a fold over the log and the very next append would delete them. So with
-- rows alone: the phone logs sets 1-3, the watch logs set 4, the server ends up
-- holding all four, and NEITHER device can adopt the other's. The workout is
-- whole on the server and permanently partial on both clients.
--
-- `AppDatabase.ingest(_:)` has always been the answer — it de-duplicates by
-- event id, pulls the Lamport clock up with `observeClock`, marks the event
-- synced and re-folds. It has simply never had a transport. This table is that
-- transport, and it is the one Appendix B of the migration plan always assumed:
-- "Supabase is the merge point. WCSession is a latency optimisation."
--
-- WHY A DELETE CANNOT DO THIS JOB
-- A voided set is executed against `workout_sets` as a DELETE, so its absence
-- is the only evidence. A device cannot tell "the other device voided it" from
-- "the other device has not drained yet", and `.void` is terminal in the fold —
-- one wrong guess kills a set that no later append can bring back. A tombstone
-- has to travel as a ROW, and that is what `kind = 'void'` is.
--
-- WHY `inserted_at` AND NOT `seq`
-- `seq` is a LAMPORT clock, per device. Two devices legitimately both emit
-- `seq = 41`, so a delta cursor on it steps over events. `inserted_at` is
-- assigned by the server on insert, which makes it the only value in the row
-- that is monotonic across devices. Read it with `gte`, exactly as the mirror
-- reads `updated_at`: the boundary row is re-read, and `ingest` is idempotent,
-- so a millisecond shared by two rows cannot lose one.
--
-- WHY THERE IS NO `UPDATE` POLICY
-- Events are immutable. That is not a convention here, it is the property the
-- whole merge rests on: `SetEventFold` assumes an event never changes after it
-- is written, and every retry is a no-op only because re-sending an event
-- writes the identical row. The client upserts with `ON CONFLICT DO NOTHING`
-- and the policies below allow insert and select. Nothing may rewrite history.
--
-- IDEMPOTENT. `if not exists` throughout; running it twice writes the same
-- schema and re-creates no policy.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.set_events (
  -- The event's OWN id, generated on the device that produced it. Not the set's
  -- id: many events share one `set_id` over the life of a set. Client-supplied
  -- and never defaulted — a server-generated id would break the de-duplication
  -- that makes replaying a delivery a no-op.
  id           uuid        primary key,

  -- RLS's handle. Every other table in this database carries it and the policy
  -- below is the same `user_id = auth.uid()` the other 28 use.
  user_id      uuid        not null references auth.users(id) on delete cascade,

  -- The workout this is about. `on delete cascade` because a session deleted
  -- server-side should not leave its log behind: the projection goes with it,
  -- and an orphan event would re-create a set into a session that is gone.
  session_id   uuid        not null references public.workout_sessions(id) on delete cascade,

  -- The set this event is ABOUT. Deliberately NOT a foreign key to
  -- `workout_sets`: a `void` names a set whose row has already been deleted,
  -- and an `append` may arrive before the row reconcile that creates it. The
  -- log is the authority here, not the projection.
  set_id       uuid        not null,

  -- Which device produced it — also the deterministic tiebreaker in the fold's
  -- total order, so both devices fold an identical log into an identical list.
  device_id    text        not null,

  -- The Lamport clock. Ordering, not time. See the header on why it is not the
  -- cursor.
  seq          bigint      not null,

  -- Denormalised beside the JSON so SQL can filter without decoding a blob, and
  -- constrained so a client that has learned a new kind cannot write one this
  -- schema has never heard of. `pause`/`resume` are listed for completeness;
  -- `EventStore.commit` keeps clock events out of the outbox, so in practice
  -- only the first three ever arrive.
  kind         text        not null
                 check (kind in ('append', 'amend', 'void', 'pause', 'resume')),

  -- The event body, exactly as `SetEvent.Body` encodes it: `{"kind": …,
  -- "payload": {…}}` for append and amend, `{"kind": "void"}` alone otherwise.
  -- jsonb rather than text so a later query can reach into a payload without a
  -- parse, and because it normalises key order — which makes two deliveries of
  -- one event byte-identical on disk.
  body         jsonb       not null,

  -- The DEVICE's wall clock, for display only. Never sort by it: a watch and a
  -- phone disagree by seconds and NTP can step either backwards.
  created_at   timestamptz not null,

  -- THE CURSOR. Server-assigned, never sent by a client. See the header.
  inserted_at  timestamptz not null default now()
);

-- The delta pull: "everything for this user since my cursor". `user_id` leads
-- because RLS filters on it first, and it is the shape every pull uses.
create index if not exists set_events_user_inserted_idx
  on public.set_events (user_id, inserted_at);

-- The session pull: the Watch and the phone both ask for one workout's log when
-- they open it, rather than waiting for the delta to come round.
create index if not exists set_events_session_idx
  on public.set_events (session_id, seq);

alter table public.set_events enable row level security;

-- Read your own.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'set_events'
       and policyname = 'set_events_select_own'
  ) then
    create policy set_events_select_own on public.set_events
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Write your own. INSERT only — see "WHY THERE IS NO UPDATE POLICY" above.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'set_events'
       and policyname = 'set_events_insert_own'
  ) then
    create policy set_events_insert_own on public.set_events
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- Deleting your own is allowed so that erasing an account or a session leaves
-- nothing behind. Nothing in either client calls it; the cascade above does.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'set_events'
       and policyname = 'set_events_delete_own'
  ) then
    create policy set_events_delete_own on public.set_events
      for delete using (auth.uid() = user_id);
  end if;
end $$;

comment on table public.set_events is
  'Append-only log of facts about sets, one row per event, produced by any '
  'device. `workout_sets` is a PROJECTION of this — a fold, rebuilt by '
  'SetEventFold. Events are immutable: an edit appends an amend, a delete '
  'appends a void. Ordered by (seq, device_id, id); `inserted_at` is the '
  'server-assigned delta cursor and the only monotonic value across devices.';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'set_events'
--  order by ordinal_position;
--
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'set_events'
--  order by policyname;
--
-- Expected: 10 columns, `inserted_at` defaulting to now(); three policies —
-- set_events_delete_own (DELETE), set_events_insert_own (INSERT),
-- set_events_select_own (SELECT). No UPDATE policy, on purpose.
