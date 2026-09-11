# Soreness Muscle Contour Map v2 — design

Date: 2026-09-12
Status: approved for planning
Branch: `onyx/soreness-v2`

## 1. What this is

Soreness today is ten muscles, one severity each, one figure, no laterality and
no joints. v2 adds three things a coach asks for and the log cannot currently
answer: WHICH PART of a muscle group is sore, WHICH SIDE, and whether the
complaint is a joint rather than a muscle at all.

It adds them as RECORD, not as score. The readiness engine keeps reading exactly
one number per muscle group, and every historical battery score stays what it
was. That constraint is the spine of this design; every decision below exists to
hold it.

## 2. Decisions taken (founder, 2026-09-12)

1. Sub-regions are record-only metadata. They do not fragment scoring. They MUST
   appear in the raw weekly export.
2. Laterality stored as `side`, folded into readiness by `max(severity)` per
   distinct recognised muscle group. Must appear in the raw weekly export.
3. Body stays greyscale. Anatomical realism comes from layer 3 strokes. Severity
   remains the only colour channel.
4. Joints are an independent binary event log. Zero scoring impact. Export and
   audit only.
5. One wave: data hardening and UI ship together.

### 2a. The one contradiction, and how it resolves

Decision 2 says "non-key column". Taken literally that is impossible: the upsert
conflict target is `user_id,date,muscle_group` (`src/lib/hooks/useRecovery.ts:181`),
so writing Left Bicep and then Right Bicep would overwrite, and laterality would
be unstorable.

The word is doing two jobs. Split them:

- **Storage key** — `side` and `sub_region` DO join the unique index. Without
  that, two sides cannot coexist on one row set.
- **Scoring key** — stays `muscle_group` alone. The fold to one row per muscle
  happens in the engine, not in the table.

This is what actually delivers the founder's intent: history invariant, sides
recorded.

## 3. Vocabulary — a sub-key, not a fourth taxonomy

`DOMS_MUSCLES` stays at **10**. `LANDMARK_MUSCLES` stays at **16**. Nothing is
added to either.

That is not a stylistic preference. Adding a member to either set touches, at
minimum: `muscleHue.ts:70` (a family ramp silently collapses two steps to one
colour), `OnyxTokens.swift:393` (`members[count/2]` — adding a member CHANGES
that family's colour on every native surface), `useWeeklyLoop.ts:1192` (an
unchecked `as LandmarkMuscle` cast), `AccountSeed.swift:234` (new accounts
seeded, existing accounts left at target 0 forever), two hand-copied
`PROGRAM_TARGETS` tables, and eight exhaustive tests including
`native-token-discipline.test.ts:138`, which pins the exact ordered list of 16
hexes. The evidence that this drift is real and silent: `RecoveryTrackers.tsx:117`
still documents NINE DOMS muscles four days after `Inner thighs` shipped as the
tenth.

So sub-regions live BELOW the DOMS muscle as a sub-key. The fold
`sub_region -> muscle_group` is total and lossless, and drops one level to reach
the existing vocabulary. Nothing upstream learns a new word.

```ts
// src/lib/body/subRegions.ts  (new leaf module, no React, no colour)
export const SUB_REGIONS = {
  Back:           ['Traps', 'Rhomboids', 'Lats', 'Erectors'],
  Shoulders:      ['Front delts', 'Side delts', 'Rear delts'],
  Arms:           ['Biceps', 'Triceps', 'Forearms'],
  'Inner thighs': ['Adductors', 'Abductors'],
} as const
```

Chest, Abs, Glutes, Quads, Hamstrings and Calves have no sub-regions. Rating them
writes `sub_region = ''`. A parent with sub-regions may still be rated whole —
"Back: 2" remains a legal, complete answer.

**Abductors is answered here and nowhere else.** The brief asks for abductors;
`LANDMARK_MUSCLES` has `Adductors` and no abductors, and there is no volume
target, no exercise mapping and no scoring path for one. Adding a landmark to get
it would drag in the entire list above. As a soreness sub-region it costs one
string in the table above and appears in the export exactly as asked.

**Upper back / Lower back** already exist as landmarks, but soreness is reported
in DOMS vocabulary where both fold into `Back`. `Traps`/`Rhomboids` vs `Erectors`
is therefore expressible with zero taxonomy change — which is precisely why the
sub-key wins.

## 4. Schema

### 4.1 `doms_logs` — two columns and a wider unique index

```sql
-- docs/sql/soreness-v2.sql   (run by hand in the Supabase SQL editor)
alter table public.doms_logs
  add column if not exists side       text not null default 'both',
  add column if not exists sub_region text not null default '';

-- Idempotent: `add constraint` has no IF NOT EXISTS, and this file gets re-run.
do $$ begin
  alter table public.doms_logs
    add constraint doms_logs_side_check check (side in ('left','right','both'));
exception when duplicate_object then null; end $$;

-- The existing unique index is referenced only by an `onConflict` STRING, so the
-- app never revealed its name. Drop whichever index currently enforces the
-- narrow key, by shape rather than by a guessed name.
-- A constraint-backed index cannot be dropped with `drop index` ("cannot drop
-- index ... because constraint ... requires it"), so handle both shapes.
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
```

Existing rows take the defaults and keep their present meaning: whole muscle,
both sides. No backfill needed beyond the defaults.

`useLogDoms` conflict target becomes
`'user_id,date,muscle_group,side,sub_region'`, and keeps the existing
degrade-quietly retry (`useRecovery.ts:183`): on a `PGRST204`/unknown-column
error it retries against the narrow key, so the app keeps working against an
unmigrated database.

### 4.2 `joint_flags` — a new table, deliberately outside the scoring path

```sql
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

alter table public.joint_flags enable row level security;
create policy joint_flags_own on public.joint_flags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Binary by construction: the row's existence IS the flag. There is no severity
column, because decision 4 says presence/absence and a 1-10 scale that nothing
reads is a field that only ever rots.

`JOINTS` vocabulary (8, fixed): `Knee`, `Hip`, `Ankle`, `Wrist`, `Elbow`,
`AC joint`, `Lumbar junction`, `Neck`.

`docs/sql/e6-auth-deletion.sql` gains `delete from public.joint_flags where
user_id = uid;` alongside the `doms_logs` line at `:132`, or account deletion
silently orphans the rows.

**DDL cannot run from this machine.** Both files are hand-paste steps for the
founder in the Supabase SQL editor, and the wave is not done until they are run.

## 5. Scoring — the fold that keeps history invariant

`domsSeverity` is today the mean severity over ROWS PRESENT
(`src/lib/scoring/computeForDate.ts:348`), with no whitelist at any layer. Two
consequences, one of them already live:

- Laterality would double the row count per complaint and silently re-base every
  battery number, retroactively, since scoring recomputes history.
- `scripts/seed-demo-account.mjs:344` already writes `'Quadriceps'` and `'Lats'`
  — neither is a `DOMS_MUSCLES` member, so neither can ever be read back as a
  rating, and both still count in the denominator today.

New rule, one sentence: **mean over distinct RECOGNISED `muscle_group`, taking
the max severity across that muscle's sides and sub-regions.**

```
domsSeverity = mean over m in distinct(muscle_group) ∩ DOMS_MUSCLES
                 of max(severity of every row for m that day)
```

Three call sites change together:

| Site | File |
|---|---|
| Web scoring | `src/lib/scoring/computeForDate.ts:348` |
| Native scoring | `native/.../OnyxData/Scoring/ScoringInputsBuilder.swift:169` |
| Export derived | `src/lib/reports/derived.ts:231` |

Properties this buys: laterality is row-count-neutral; sub-regions are
row-count-neutral; the seed pollution stops counting; and every future taxonomy
change is immunised by construction rather than by care.

**This is a deliberate re-grade.** Any account holding unrecognised
`muscle_group` rows will see its historical `domsSeverity` — and therefore its
battery — change. On real accounts that set should be empty, since the app only
ever wrote from `DOMS_MUSCLES`; the demo account will move. The migration note
must say so, and the wave ships a one-off audit query counting unrecognised rows
per user before the change lands.

`native/.../OnyxDataTests/ScoringHolesTests.swift:167` pins `domsSeverity == 1`
against the row-count denominator; it is updated with a golden vector that
distinguishes the two rules (two sides of one muscle at 1 and 3 must score 3,
not 2).

Joints touch none of this. A test asserts `computeForDate` output is byte-identical
with and without `joint_flags` rows present.

## 6. Export — the hard requirement

Grammar constraints already in force: ` · ` separates fields, `;` separates items
within a cell, `:` separates parts within an item, trailing empty parts are
stripped (`weeklyExport.ts:1532`, mirrored at `WeeklyExport.swift:434`). No value
may contain `·`.

### 6.1 The `doms` cell

Token becomes `muscle[/subRegion][@L|@R]:severity[:sourceLabel[:sourceDate]]`.

| Case | Token |
|---|---|
| whole muscle, both sides | `Hamstrings:2` |
| sub-region | `Back/Erectors:2` |
| unilateral | `Arms/Biceps@L:3` |
| both, with attribution | `Inner thighs/Abductors@R:1:Legs B:2026-09-09` |

`@` and `/` are chosen because neither can occur in a muscle or sub-region name,
and neither is this column's existing separator. A side PREFIX (`LBack`, matching
the set convention at `weeklyExport.ts:1452`) was rejected: `Lats` is a
sub-region name beginning with `L`, and a prefix rule would make the token
ambiguous the first time anyone parses it.

Bilateral whole-muscle tokens are unchanged, so the existing expectations at
`export-completeness.test.ts:248,269,279` keep passing untouched. That is the
regression test for this section.

Ordering within the cell is stable: DOMS_MUSCLES order, then sub-region
declaration order, then `both`, `left`, `right`.

### 6.2 The `joints` cell

A new column on the `## DAYS` row, after `doms`, rendered with the same `items()`
grammar. No new section and no new parser.

| Case | Token |
|---|---|
| flag | `Knee@L` |
| flag with note | `Wrist@R:tight after pressing` |
| none logged | `—` |

Notes are user text entering a separator-sensitive document. At the render
boundary: strip `·`, `;`, `:` and newlines, collapse whitespace, truncate to 60
characters. One shared sanitiser, tested against a note containing all four.

### 6.3 Parity

`native/.../OnyxCore/Reports/WeeklyExport.swift` mirrors the TS renderer line for
line (`:505` header, `:517` doms token, `:554` row). Both move together, and both
sides' golden fixtures are regenerated in the same commit.

`WeeklySummary.peakDoms` (`weeklyExport.ts:969`, `WeeklyExport.swift:24`) keeps
its current shape and reads the max-folded severity, so the summary line cannot
disagree with the day rows.

## 7. UI

### 7.1 The figure stays a navigator

The interactive map renders at 110 x 238 CSS px (`RecoveryTrackers.tsx:207`) —
0.917 px per viewBox unit. Of 35 muscle paths, 2 clear 24x24 and none clear
44x44. Sub-dividing them would put the adductor strip at ~1.8 px, and giving it a
24 px narrow axis needs a 720 px wide figure. Per-side sub-muscle TAPPING is not
tight, it is geometrically impossible on a phone.

So the map's job is unchanged: tap a region, open that group's sheet
(`SorenessMap.tsx:36,86`). A mis-tap stays free. Every value is committed in the
sheet on a 44 px target.

Also unchanged for a second reason: on the front view the figure's left is the
VIEWER's right, and nothing labels it (`MuscleAtlas.tsx:187`). Side chosen by
tapping geometry would mis-log silently, with nothing in the data able to detect
it. Side is chosen by a labelled control or not at all.

### 7.2 The group sheet

Three additions, all inside the existing sheet:

1. **L / R / Both** — one more `Segmented` instance. It already supplies
   `role="group"`, a required label, `aria-pressed` per segment, haptic on
   pointer-down, `fluid` thirds, and a 44 px effective target
   (`src/components/ui/Segmented.tsx:55,76,107`), and is already instantiated in
   this sheet for front/back (`RecoveryTrackers.tsx:194`). Defaults to `Both`.
   The selected side is echoed on the figure (unselected side dimmed) — an
   invisible mode is the failure case.
2. **Sub-region rows** — for the four parents that have them, the sheet lists the
   parent first ("Back — whole") then its sub-regions, each a 4-button severity
   row. Rating the parent and rating a sub-region are both legal; they are
   different rows, and the fold makes them agree.
3. **Joints** — a segment alongside the muscle list, listing that region's joints
   as toggles with an optional note field.

Motion: severity commit uses the existing critically-damped transition; feedback
fires on pointer-down, not on commit, matching `Segmented`'s existing haptic
timing.

### 7.3 Layer 3 — where "lifelike" comes from

`DETAIL_SHAPES` is stroked, never filled, never tinted, never a hit target
(`atlas.ts:207`, `MuscleAtlas.tsx:204`). It is the only layer that can gain
anatomical detail for free.

Additions: tendon insertions at the major junctions, fibre direction on the large
bellies, a clavicular/sternal seam on the pec, the serratus digitations, the
iliotibial line. The layer-3 stroke lifts from `rgba(255,255,255,0.22)` toward
`BONE #E6EAF0` at low alpha for tendon and bone lines specifically.

What does NOT change, and why: the flesh and belly gradients stay white/black
stops. They are light and shade, not colour (`MuscleAtlas.tsx:118`). Severity
tints land as alpha over that base, so a saturated red base would turn
EMERALD-mild brown and shift all 16 `MUSCLE` hues; `OXIDE #C4514E` — severe —
would become indistinguishable from an unrated belly; and `GARNET`/`BONE` already
carry data meaning on the body-composition surface (`palette.ts:81`). One body
serves the weekly sheet, the session sheet, two dashboard tiles, the
command-center tile and the iOS widget through the Swift generator, so the
greyscale base is what keeps them in parity.

Face and hair are already shipped (`atlas.ts:85`). That line of the brief needs
no work.

### 7.4 The joint overlay on the figure

Drawn as a fourth layer above layer 3: open ivory rings, r ~= 3 units, ~1 px
stroke, `pointer-events: none` by default — the same rule layer 3 already obeys
so a hairline can never eat a muscle's tap. Flagged joints fill; unflagged stay
open outlines. Joint selection happens in the sheet, so the rings never need a
hit plane at all and the figure never becomes a pincushion.

Rings anchor to geometry that already exists: kneecaps (`atlas.ts:249`), the
deltoid cap seam for AC (`:230`), the fist/forearm junction for wrists (y~148),
elbows at y~108, the erector groove terminus for the lumbar junction (`:256`).

## 8. Parity gates

There is no TS-to-Swift DOMS parity check anywhere: `DomsMap.swift:14` is a
hand-typed `[String]` with no generator, and `AtlasHitTests.swift:156` asserts a
SUBSET, not equality — which is exactly how the Adductors hole shipped. A new
DOMS value lands on web, is invisible on iOS, and both gates stay green.

This wave closes it, because it is the wave that adds three new vocabularies
(sub-regions, sides, joints) that both platforms must agree on.

- `scripts/gen-doms-swift.mjs` — same shape as `gen-atlas-swift.mjs`; emits
  `DomsMap.swift` from `DOMS_MUSCLES`, `SUB_REGIONS` and `JOINTS`.
- `npm run check:doms` — the `--check` mode.
- `npm run check` becomes
  `version:check && check:atlas && check:mirror && check:doms && next lint && tsc --noEmit`.
  `check:atlas` and `check:mirror` exist today but are NOT in `check`
  (`package.json:6`), so they never run in the gate. Adding them here is part of
  the hardening, and may surface pre-existing drift — if it does, that drift is
  fixed in this wave, not deferred.

## 9. Tests

| Test | Pins |
|---|---|
| `sub-regions.test.ts` | every sub-region folds to exactly one DOMS muscle; fold is total |
| `doms.test.ts` (extend) | max-fold: two sides at 1 and 3 scores 3; unrecognised muscle excluded |
| `export-completeness.test.ts` (extend) | the four token cases in 6.1 verbatim; bilateral tokens unchanged |
| `export-completeness.test.ts` (extend) | `joints` column: flag, flag+note, `—`; note sanitiser strips all four chars |
| `scoring-joints.test.ts` | `computeForDate` output identical with and without `joint_flags` |
| `ScoringHolesTests.swift:167` (update) | the same golden vector as the web fold |
| `native-doms-parity.test.ts` | `DomsMap.swift` matches `DOMS_MUSCLES` + `SUB_REGIONS` + `JOINTS` exactly |
| `AtlasHitTests.swift:156` (tighten) | subset becomes equality |
| `RecoveryTrackers` a11y | L/R/Both has an accessible name; figure keyboard stops stay at 19 per view |

## 10. Out of scope

- No new landmark muscle. Abductors is a soreness sub-region only.
- No severity scale for joints. Presence is the datum.
- No per-side volume targets, no per-side scoring dimension.
- No change to the muscle hue palette, the Muscle Focus Map or the widget.
- No red anatomical render.

## 11. Sequencing inside the one wave

1. `docs/sql/soreness-v2.sql` + the `e6-auth-deletion.sql` line (founder pastes).
2. `subRegions.ts`, `JOINTS`, the generator, `npm run check` line.
3. The scoring fold, three call sites, goldens both platforms.
4. `useRecovery` write path + a `useJointFlags` hook.
5. Export: TS renderer, Swift renderer, fixtures.
6. Sheet UI, then layer 3 strokes, then the rings.
7. Fix the `RecoveryTrackers.tsx:117` docstring — it still says nine.
8. Version `2.1.0` (MINOR: new capability), `npm run version:sync`,
   `cd native && xcodegen generate`, changelog section, `npm run version:check`.

## 12. Manual steps this wave cannot do for itself

1. Run `docs/sql/soreness-v2.sql` in the Supabase SQL editor (DDL cannot run from
   this machine).
2. Confirm the notice the index-drop block raises; if it drops nothing, the
   narrow unique index was named or shaped unexpectedly and must be found by hand
   before the new key is trusted.
3. Run the unrecognised-`muscle_group` audit query and confirm the re-grade scope
   before the scoring fold merges.
4. Re-seed or clean the demo account, which currently holds `'Quadriceps'` and
   `'Lats'` rows.
