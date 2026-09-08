-- ─────────────────────────────────────────────────────────────────────────────
-- SET QUALITY — one column, several tags.
--
-- WHAT CHANGES
-- `workout_sets.quality` keeps its type, its name and every row already in it.
-- What widens is the CHECK: it accepted exactly the six keys, and now accepts a
-- `+`-joined COMBINATION of them, in the enum's own order, with no repeats.
--
--     momentum                       -- still valid, and still what one tag writes
--     momentum+partial_rom           -- new
--     partial_rom+momentum           -- REFUSED: not canonical order
--     momentum+momentum              -- REFUSED: a repeat
--     ''                             -- REFUSED: absence is NULL, as before
--
-- ── WHY A GRAMMAR AND NOT A SECOND COLUMN ───────────────────────────────────
-- A `text[]` or a `jsonb` beside it would have to be threaded through
-- `SetSnapshot`, `SetPatch`, `SetEventFold`, the projection, the delta puller,
-- the outbox translator and two sets of golden vectors — and every one of those
-- is a place the two columns could come to disagree about the same set. The
-- column that already holds this fact keeps holding it.
--
-- ── AND WHY CANONICAL ORDER IS ENFORCED HERE AND NOT ONLY IN THE CLIENT ─────
-- `SessionEditing.amendSet` refuses an amend whose patch does not CHANGE the
-- row, by comparing the patch to the stored value. If two clients could write
-- the same pair of tags in two orders, every sync would look like an edit: a
-- seed of the event log, a PR replay, a recount and an outbox upsert, forever,
-- for a set nobody touched. One order is what makes the string comparable.
-- `SetQuality.join` sorts by `allCases` and this constraint is the same list.
--
-- IDEMPOTENT. Running it twice drops and re-adds the same constraint.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
--
-- ⚠️ UNTIL THIS IS RUN, a set tagged with a COMBINATION is refused by Postgres
-- and its outbox item fails and retries; a set with one tag syncs exactly as it
-- always has. That is the degradation worth having — loud, partial, and never a
-- row that is silently wrong.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0 · DROP WHATEVER THE OLD ONE IS CALLED ─────────────────────────────────
-- The constraint was created inline with the column, so its name is whatever
-- Postgres generated. Found rather than guessed: a hard-coded name that is
-- wrong makes this file a no-op that reports success.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'workout_sets'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%quality%'
  loop
    execute format('alter table public.workout_sets drop constraint %I', c.conname);
  end loop;
end $$;

-- ── 1 · THE VOCABULARY, ONCE ────────────────────────────────────────────────
-- In `SetQuality.allCases` order. This list and that enum are the same list in
-- two languages, and the order is load-bearing (see the header).
create or replace function public.onyx_quality_ok(v text)
returns boolean
language sql
immutable
parallel safe
as $$
  select v is null or (
    -- Non-empty, and every element a known key.
    v <> ''
    and not exists (
      select 1 from unnest(string_to_array(v, '+')) as t(k)
       where k not in (
         'momentum', 'partial_rom', 'form_breakdown', 'needed_warmup', 'assisted', 'cut_short'
       )
    )
    -- Canonical order, no repeats: the array must equal the ordered, distinct
    -- rendering of itself.
    and string_to_array(v, '+') = (
      select coalesce(array_agg(k order by ord), '{}'::text[])
        from (
          select distinct k, ord
            from unnest(string_to_array(v, '+')) as t(k)
            join (values
              ('momentum', 1), ('partial_rom', 2), ('form_breakdown', 3),
              ('needed_warmup', 4), ('assisted', 5), ('cut_short', 6)
            ) as v2(key, ord) on v2.key = t.k
        ) ranked
    )
  );
$$;

-- ── 2 · AND THE CHECK ───────────────────────────────────────────────────────
-- `not valid` then `validate`: the table holds thousands of rows and an inline
-- CHECK takes an ACCESS EXCLUSIVE lock for the whole scan. Every existing value
-- is a single key and passes, so the validation is a formality — but it is a
-- formality that runs while the app can still write.
alter table public.workout_sets
  add constraint workout_sets_quality_check
  check (public.onyx_quality_ok(quality)) not valid;

alter table public.workout_sets validate constraint workout_sets_quality_check;

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select public.onyx_quality_ok('momentum')              as one_tag_ok,        -- t
--          public.onyx_quality_ok('momentum+partial_rom')  as combo_ok,          -- t
--          public.onyx_quality_ok('partial_rom+momentum')  as out_of_order_bad,  -- f
--          public.onyx_quality_ok('momentum+momentum')     as repeat_bad,        -- f
--          public.onyx_quality_ok('sloppy')                as unknown_bad,       -- f
--          public.onyx_quality_ok('')                      as empty_bad,         -- f
--          public.onyx_quality_ok(null)                    as null_ok;           -- t
--
--   select quality, count(*)
--     from public.workout_sets
--    where quality is not null
--    group by quality
--    order by 2 desc;
