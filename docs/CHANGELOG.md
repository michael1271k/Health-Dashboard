# Changelog

All notable changes to **Onyx** — the native iOS/watchOS app and the Helix web
app it shares a database with.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How a version works here

`package.json` → `"version"` is the **single source of truth**. Nothing else is
hand-edited:

| Surface | Where the number comes from |
|---|---|
| Web app (`/settings` → About, `/api/version`) | `NEXT_PUBLIC_APP_VERSION`, inlined at build time from `package.json` by `next.config.ts` |
| Native app, widget extension, watch app | `MARKETING_VERSION` in `native/project.yml`, written by `scripts/sync-version.mjs` and read through `$(MARKETING_VERSION)` in each `Info.plist` |
| Capacitor shell (`ios/App`) | `MARKETING_VERSION` in `App.xcodeproj/project.pbxproj`, written by the same script |
| Settings → Version (native) | `Bundle.main.infoDictionary` at runtime — `OnyxLinks.versionString` |

```bash
# bump the SSoT, then push it everywhere
npm version 1.4.0 --no-git-tag-version   # or edit package.json by hand
npm run version:sync                     # writes both Xcode projects
cd native && xcodegen generate           # regenerate, never hand-edit the .xcodeproj
```

`npm run version:check` fails when any surface has drifted, and `npm run check`
runs it. The build number (`CURRENT_PROJECT_VERSION`) is **derived**, not
stored: `1.3.0` → `10300`. It is monotonic for as long as the marketing version
is, which is all App Store Connect asks for, and there is no second field to rot
out of step with the first.

**Semver, as this project reads it**

- **MAJOR** — a migration the user has to be told about: a schema change that is
  not backward compatible, a plan/scoring model whose numbers move, a removed
  screen.
- **MINOR** — a wave, sprint, or engine lands. New surface, new capability.
- **PATCH** — a hotfix wave: defects, layout, copy. No new capability.

---

## [Unreleased]

_Nothing yet._

---

## [1.8.0] — 2026-09-11 · Before, During and After the Workout

A hotfix sprint against one real session (Legs & Core B, 11 Sep). Three screens
— the plan card you read before a workout, the deck you log it on, and the
summary you read after — plus the two numbers that turned out to be wrong
underneath them.

### Added
- **The plan card shows LAST TIME, not the rep window** (Train tab). Every
  movement's row printed `3 × 10-15`, which is the prescription and has not
  moved in eight weeks. It now prints the top set from the last session of the
  same split — `Last: 72.5 kg × 15 @ 8.5` — heaviest working set, ties broken
  by reps, a unilateral pair scored at its weaker side, a hold in seconds. A
  movement that was not in that session prints nothing rather than a number
  from some other day.
- **"Open last · Thu 4 Sep"** on the same card opens that whole session's
  summary in a sheet, over the plan you are about to perform.
- **A set stopwatch** in the logger's timer sheet (tap the elapsed reading).
  Start / Stop / Lap / Reset, for timing a plank or a hollow hold; read it and
  type the number into the set. It is anchored to a date rather than driven by
  a repeating timer, so it is the system clock the phone and the watch already
  share — it cannot drift, and it survives the screen locking.
- **Muscle tags on the session summary header**, derived from the muscle credit
  the session actually earned. A Legs & Core B holding a Side Plank and a
  Hanging Knee Raise was missing its Abs/core tag; nothing up there had ever
  asked what was trained, only what the calendar said. Nothing is truncated —
  core work is always the smallest share, so any "top four" drops exactly the
  tag this fixes.
- **The trophy is the set's badge on the summary**, and long-pressing a record
  row opens the record sheet the live deck has had since E4 — which axis, the
  new figure, and what it beat. VoiceOver reaches it through a "What it beat"
  rotor action.

### Fixed
- **One session, one tonnage.** 11 Sep read **8,815 kg** on the Train tab and
  the Pulse card, and **9,715 kg** on its own summary page — the gap was a
  single 60 kg × 15 warm-up on the leg press. `SessionVolume`'s rule is one
  sentence ("a ghost weighs nothing; a warm-up still counts") and five call
  sites in three files were filtering warm-ups out before calling it. They no
  longer do, so every surface now agrees with `workout_sessions.total_volume_kg`
  and with the close path. Set COUNTS still exclude warm-ups, deliberately —
  that is a different question. `src/tests/session-tonnage-discipline.test.ts`
  fails the next call site that re-adds the filter.
- **Records that never got filed.** 11 Sep stored `pr_count = 1` where a replay
  of the whole ledger finds five: Leg Press volume (72.5 × 15), Calf Press
  volume and 1RM (70 × 15), Hanging Knee Raise reps (18), Side Plank duration
  (66 s). `PrRecorder.baselines` gathered the bar under the session's OWN
  exercise ids, so a movement whose history sits under a second id — a
  catalogue uuid from the web beside a `helix5-` slug from the phone, which
  `nameResolver` calls routine — was judged against an empty bar, and an empty
  bar awards nothing at all. The bar is now gathered under every id that
  resolves to the same canonical name. It can only ever raise a bar or fill an
  empty one, so it removes false positives and cannot invent a record; the
  ledger's filing key is unchanged.
- **A split set was scored twice.** The PR engine folds an L/R pair on `L`/`R`,
  and the phone's own rows spell the sides `left`/`right` — so `volumeCredits`
  saw no pair and credited each arm its own tonnage, both at close and on the
  live deck (which was not passing `pair_id` or `side` at all). An asymmetric
  pair could take a volume record the same work logged unsided never would.
- **Splitting a set now does something visible.** A pair whose two sides agreed
  drew as the single row it replaced, and the one effort control wrote to both
  of them — so "split the Side Plank, rate the left arm harder" was a dead end
  with no way out of it. A completed pair now always draws its two efforts
  (`L 8 · R 9`) over one value line, which is what the web has always done.
- **"Fin…"** — the Finish button truncated in the navigation bar. The word is
  incompressible now.
- **Dead space on unloaded movements.** With no kg column, the reps/time track
  kept its floor beside the badge and the effort word stayed pinned right,
  leaving ~90 pt of nothing between them on Side Plank and Hanging Knee Raise.
  The surviving track takes the vacated width, in the row and in its header.
- **A split set kept its measurements.** `splitSet` copied load, reps and effort
  to both halves and dropped `duration_sec`, `incline`, `distance_km` and
  `elevation_m`; `mergeSet` dropped them the other way.
- **`scripts/backfill-prs.mjs` could not run at all.** `workout_sets` passed
  1,000 rows, PostgREST truncated the read silently, and the script's own
  preflight — correctly — refused to proceed, because a truncated read prunes
  the ledger of every session it cannot see. The read is paged now.

### Data
- The record book was replayed over the full ledger (`backfill-prs.mjs`):
  120 rows written, 3 superseded rows pruned, 9 `is_pr` flags and 3 `pr_count`s
  corrected — 11 Sep from 1 to 5, 10 Sep from 10 to 5, 8 Sep from 4 to 1.

---

## [1.7.0] — 2026-09-11 · The Generic Model

W2 of the epic sprint (`docs/EPIC_SPRINT_PLAN.md` D1–D6). No new screens; the
app stops being one athlete's plan compiled into a binary. Every reader —
the logger deck, the muscle targets, the phase label, the nutrition lever, the
supplement stack, the PR floors — now takes rows, and a second account starts
empty instead of inheriting the founder's.

### Added
- **Four tables** (`docs/sql/w2-generic-model.sql`, founder pastes): `routines`
  (one row per program day, exercises in a jsonb payload), `plan_phases` (the
  dated blocks), `lever_periods` (when each nutrition rung came into force),
  `stress_logs` (the psych self-report W4 writes). Columns W4/W5 need on
  `exercises` (`slug`, `secondary_muscles`, `rep_floor`, `rep_ceiling`,
  `archived_at`), `custom_supplements` (`dose_amount`, `dose_unit`,
  `sort_order`, `archived_at`), `cardio_logs.elevation_m`, `plans` (`blurb`,
  `is_legacy`, `sort`), `plan_phase_goals` (`label`, `fiber_g`,
  `body_fat_ceiling_pct`), `target_profiles.kind`. The schema is frozen from
  here to W5.
- **The founder's seed** (`docs/sql/w2-seed-founder.sql`), generated from the
  constants before they were deleted — 3 plans, 14 routine rows with catalogue
  uuids, 8 phases, 4 rungs, 5 lever periods, 6 phase-goal rows, 96 weekly set
  targets, the netted PR floors — scoped to one account and never overwriting
  an edit.
- **Stress index** — the `self` term reads the day's `stress_logs` mean beside
  the fatigue mean (mean of the two that answered, weights unchanged);
  `docs/STRESS_MODEL.md` §2.3.
- **Levers screen** — changing the rung records a `lever_periods` row, so the
  schedule of rungs maintains itself from now on.
- `plan-templates.json` in the app bundle: the same three decks as the
  template W5's onboarding seeds a new account from.

### Changed
- `ScheduleContext` carries the decks, the plan entries and the phases; the
  plan that owns a date is the one whose block covers it, else the latest
  `started_on` before it (the compiled era boundary is gone). The watch reads
  the deck from the context the phone sends.
- Legacy `helix5-…` set ids resolve through `exercises.slug` (data), not through
  the deck; new sets carry the catalogue uuid from the routine payload.
- PR floors are `personal_records` rows with no session; a replay never
  deletes them. A record that beats a floor carries it in `floor_value`
  (`docs/sql/w2-pr-floor-value.sql`, founder pastes third), and deleting
  that session hands the axis back to the floor instead of emptying it.
- The weekly export's programme line names the plan from its row
  ("Onyx-5 Cut").

### Removed
- From OnyxCore: `Program.onyx5/onyx4/pplLegacy`, `Programs.all/goals/
  weeklySetTargets`, `PhaseGoals.cut/bulk`, `NutritionPresets`, `Phases.all`,
  `Levers.all/schedule`, `LeverId`, `PrSeed`, `PrTruth.book`,
  `Supplements.protocolSeed`, `TargetProfiles.builtin`, `Week.week0Start`,
  `Era`, and the golden fixtures that pinned them.

---

## [1.6.0] — 2026-09-10 · The Truth Wave

W1 of the epic sprint (`docs/EPIC_SPRINT_PLAN.md`). No new screens; six things
the numbers were quietly getting wrong stop being wrong.

### Fixed
- **Muscle focus (dashboard sheet, Trends, widget tile)** — a set logged on the
  phone now counts towards its muscles. Phone-logged sets carry `helix5-` slug
  ids, not catalogue uuids, and the one map both readers share only knew the
  catalogue: "Side delts 0/7" after an Upper B was every lateral raise dropped.
- **Sync** — a PostgREST schema-cache miss (`PGRST205`/`PGRST204`/`42703`) is
  held and retried, never acknowledged; only Postgres's own `42P01` is
  permanent. The retry now jitters by up to a quarter-step so two devices
  that failed together do not knock again together.
- **Stress index, battery wellness, weekly export** — a day's fatigue folds by
  the day the athlete HAD: a session logged on a scheduled rest day makes it a
  training day, so a `noon` reading is "before training" and a stale legacy
  row can no longer merge away the answer actually given.
- **Set quality** — one parser in OnyxCore for the `+` grammar
  (`momentum+partial_rom`); the logger's typed view delegates to it, and the
  guard refuses exactly what the CHECK constraint refuses.
- **Session duration** — a session pulled from the server and finished on the
  phone is timed by its sets. Seeded events carry the server's `created_at`
  instead of the seed's clock; the 2-minute Pec Deck session cannot recur.
- **HealthKit ingest** — an HRV reading beyond the athlete's own 42-night band
  (median ± max(3.5 MAD, half the median)) or outside 5–300 ms is declined and
  reported, not stored. Body fat outside 2–70 %, muscle 10–70 %, visceral fat
  1–30 are refused on ingest and on the InBody sheet.

### Changed
- **Golden fixtures are Swift-owned.** `npm run golden` and the TypeScript
  generator are gone; `Fixtures/*.json` are frozen test resources with
  hand-computed cases.

### Removed
- `docs/sql/w1-cleanup.sql` (founder pastes) drops `widget_tokens`,
  `notion_credentials`, `notion_exports`, `body_measurements`,
  the `_bak_20260723` backup schema and the `exercise_history()` RPC.

---

## [1.5.0] — 2026-09-10 · One Set, One Box

The live logger stops disagreeing with the rest of the app about what a set is.
A movement trained one arm at a time is one row per set, the treadmill asks for
the two numbers a walk actually has, and the trophy finally says what it beat.

### Added
- **A pair is one set box** (native logger). L and R share a set number, a
  checkmark and a trophy. How much of the box splits depends on how much the two
  sides disagree: nothing when they match, the effort alone when only the rating
  differs (`L 9.5 · R 8.5`), and two value lines under one badge when the load
  or the reps do. The rule is `SetPairLayout` in OnyxCore, with vectors.
- **Duration and distance on a cardio set** (native logger). The treadmill block
  asked for kilograms and reps and showed `0 kg × 0`; it now shows minutes and
  kilometres, with the same coarse/fine stepper grammar as a load (1 min / 30 s,
  100 m / 50 m) — and it can be ticked, which a zero-rep row could not.
- **The record sheet, on the phone** (native logger). Tapping a set that holds a
  record slides up what it won, by how much, and what it beat — the web's
  `PrRecordSheet`, one for one.
- **Add set on a unilateral movement adds a pair**, so the fourth set is the
  same shape as the three the deck seeded.

### Changed
- **The PRs card groups by movement** (native Live Stats). One sub-card per
  lift, its name once at the top, a count of the claims it is carrying, and the
  axes underneath — instead of a flat list repeating the same exercise name on
  every row.
- **The Finish button lost its box** (native logger). Built against the iOS 26
  SDK a toolbar item is given a glass capsule of its own, under the filled one
  this item draws; the item now declares its own background.

### Fixed
- **A set list that read `1, L, R, 4`** (native logger). The deck numbered rows;
  it numbers sets.
- **Half-empty completion dots** (native Live Stats). A three-set unilateral
  movement counted six rows against three ticks and reported a finished lift as
  half done.
- **The rest timer survived an untick** (native logger + watch). Ticking the
  wrong set and immediately unticking it left the countdown running on the deck
  and a full-screen rest cover on the wrist. The phone now also *mirrors* its
  rest clock to the watch at all — `PhoneWatchBridge.send(rest:)` had no caller
  since Wave 10, so a phone-started rest never reached the wrist either.
- **A tap into a load selects it** (native logger). The caret used to land
  behind the number, so changing 40 to 47 meant tap, Done, tap, backspace twice.
- **The steppers stepped twice on a fast tap** (native logger). Touch-down and
  touch-up inside one frame delivered the button's action before the press edge,
  and both applied the step: reps by 2 where the control says 1, load by 5 where
  it says 2.5. The coarse step is now idempotent within one activation instead
  of dependent on a delivery order SwiftUI does not promise.

---

## [1.4.1] — 2026-09-10 · What The Summary Says Happened

Four defects on the post-workout page, and every one of them turned out to be
about something other than what it looked like. A grayed-out Edit button that
had nothing to do with dates, a duration delta that was a claim about a
different workout, an internal key printed as a movement's name, and half of
every set row belonging to another day.

### Fixed
- **Any past session can be edited again** (native, History → session → Edit).
  The button was disabled for every session containing a unilateral L/R pair —
  which is every Delts & Arms day — so the whole split had been uncorrectable
  and the symptom read as a date lock. The gate was written when the logger
  could not carry a `side`; it has carried one for some time
  (`restoreLoggedSets`, `snapshot`, and `ExerciseState.volumeKg` all handle a
  pair), and the gate was never lifted with it. Sessions with no `day_key` — the
  74 Notion-era workouts — are editable now too: the deck is built from the
  session's own movements when the program cannot name the day.
- **"74 min, +72" is gone** (native, session summary). The 2026-09-03 Upper B
  session recorded twelve sets as two minutes, and the page printed the
  difference as if it were a fact about Thursday. The stored figure is repaired
  and, so the next corrupt clock cannot do it again, a duration delta is now
  suppressed when the session it is measured against recorded less than 20
  seconds per set — a reserved blank line rather than an invented number.
- **The treadmill is called Treadmill** (native, session summary), not
  `helix5-treadmill`. `WarmupCardio` is deliberately outside `Program.onyx5`, so
  the slug the deck stamps on the bout was in no name table and the page fell
  back to printing the key. The same one-line miss meant a treadmill logged on
  the phone threw `unknownExercise` on push and could not be uploaded at all —
  the one movement the deck adds for you was the one the sync refused. The
  `helix5-` prefix itself stays: it is a key written into local rows, and
  renaming it would file every unsynced set under a second identity.
- **The summary shows only the sets you just did** (native, session ledger).
  Each row carried the positionally-matched set from the last time that
  movement was trained, so a four-set Single Arm Lateral Raise drew eight
  numbers. The comparison stays where it means something — the header's
  `vs 30 Aug` capsule, which reads the previous session whole rather than
  row by row.
- **2026-09-08 "Delts & Arms" now reads 3,680.75 kg**, reconciled set by set
  against the Hevy record: one rep on Seated Incline DB Curl (16 × 13 → 16 × 12,
  which was the entire tonnage gap), the treadmill's distance (0.370 → 0.4 km),
  and a scrambled `exercise_order` that had been drawing two cards each for the
  curl and the lateral raise. Ratings, quality flags and PR marks untouched.
  `docs/sql/hotfix-data-ui.sql` and `scripts/repair-sep-2026-data.mjs`.

---

## [1.4.0] — 2026-09-10 · Submittable

The wave that makes the binary uploadable. Two pages App Review opens before it
installs anything, the rows in the app that point at them, and the three sync
and scoring defects the Phase 3 ship gate left open.

### Added
- **Privacy policy** at `/privacy` and **support** at `/support` — public,
  prerendered, and written in the same vocabulary as the app's privacy manifest
  so the policy, the manifest and the App Store questionnaire cannot disagree.
  Both were 404s, which is the one thing that stops a HealthKit app being
  reviewed at all (5.1.1(i), 1.5).
- **Settings → About → Support**, beside the existing Privacy Policy row.
  `OnyxLinks` now states the host once and derives both urls from it.
- **Associated Domains** (`webcredentials:`) in the app's entitlements, matching
  the `apple-app-site-association` file already served. iOS Password AutoFill
  can now offer the credential the browser holds for the site. Needs the
  capability enabled on the App ID in the developer portal.
- App Store metadata in `docs/APP_STORE.md` §2 is written, not `⟨…⟩`.

### Changed
- **`/privacy`, `/support` and `/delete-account` are public.** `AuthGate` used
  to redirect everything that was not `/auth` to the sign-in page, so all three
  were a login form wearing a URL. One `PUBLIC_ROUTES` list now serves the gate
  and both navigation bars.
- **Sign-up's Close button is a toolbar item.** As a floating overlay the form
  scrolled underneath it, and a `.footnote` label is a ~30 pt hit target where
  the minimum is 44.

### Fixed
- **A set event is no longer lost to a transient failure.** `SyncEngine` used to
  acknowledge an outbox item after a push whose error it had swallowed, so one
  503 dropped the event permanently and two devices never converged again. The
  item is now held and retried; a genuinely missing `set_events` table is still
  swallowed, because no retry creates a table.
- **Set quality tags reach the server.** `Cheated`, `Short ROM` and the rest
  were held on the phone and never sent. The batch is split so the tagged rows
  carry the column and the untagged ones omit it — which is what stops a device
  that was never asked about a set nulling the tag the web app recorded.
- **A rest day no longer folds its fatigue as a training day.** On a day mixing
  a legacy slot key with a modern one this counted a superseded reading as a
  slot of its own, adding several points of Stress to a day that had none. It
  now resolves the day the way the scorer does.
- **`npm run build` passes again.** Every table in the generated Supabase types
  was missing `Relationships`, so the schema stopped satisfying postgrest-js's
  `GenericSchema` and every `.update()` argument collapsed to `never` — which
  had failed each deploy from `main` since 2026-09-08. Sixteen live columns
  missing from `daily_logs` and `user_goals` are restored with it.

---

## [1.3.0] — 2026-09-08 · UI/UX Pro-Max Polish

The polish wave. Nothing new to learn, several things that had been quietly
wrong for a wave or four.

### Added
- **Unilateral sets.** A set can be two sides, carry several tags, and own its
  own clock — the logger no longer forces a per-limb lift into one row that
  averages both. (`feat(logger,widgets)`)
- **Inner Thighs in the body atlas.** The adductors were the only landmark the
  atlas could not draw; the quad gives up two units at the hip and two at the
  knee and the adductor takes the strip it vacates. Web and Swift atlas
  regenerate from the one definition (`src/lib/body/atlas.ts`).
- **About → Version** on the web settings page, and `version` in
  `/api/version`. The app had shipped four waves without saying which build you
  were looking at.

### Changed
- **Dashboard widgets open the face you are looking at.** Tapping a tile used
  to route by widget id, which sent you to the wrong screen for any tile whose
  face had been rebound. (`feat(dashboard,atlas)`)
- Six dashboard tiles draw a **series** instead of a single reading, and one era
  window replaced three separate range controls (W11/W12 carried forward).
- The progression chip leaves the logger header while the clock runs, instead
  of fighting the timer for the same row.

### Fixed
- The session page stopped disagreeing with the session it was showing.
- Four 40 mm watch layout defects the screenshot loop found.
- The set-close stopped being undone by a late sync write, and the stepper
  stopped counting a single press twice.

---

## [1.2.0] — 2026-09-08 · Mathematical Engines

Two engines that turn raw signal into a number the rest of the app can grade
against. Both are **report-only and computed on read** — neither writes a score
row, so neither can corrupt history.

### Added
- **E2 — Sleep trim engine.** Strategy A/B trimming over asleep minutes, a
  night sentinel for the zero-minute case, and id-keyed edits so correcting one
  night never silently re-attributes another. (`feat(sleep)`)
- **E3 — Stress index v1.** A z-scored composite over the recovery inputs, with
  the flat-baseline case handled explicitly rather than dividing by a zero
  standard deviation. Surfaced as the Pulse stress tile and the stress series
  in Trends (U5). (`feat(scoring)`, `feat(pulse,trends)`)
- Sleep edit sheet — a night you know is wrong can be corrected in place.

### Fixed
- What the Phase 3 ship gate found across the gate, sleep, scoring and watch
  code paths.

---

## [1.1.0] — 2026-09-08 · Onyx on the Wrist

Wave 10. The watch stops being a viewer and becomes a logger, and two devices
logging the same session stop overwriting each other.

### Added
- **watchOS logging client** (`OnyxWatch`) — a single modern watchOS app target,
  budgeted for the 40 mm case throughout, with an `HKWorkoutSession` keeping it
  alive between sets.
- **Double-pinch to log a set.** `.handGestureShortcut(.primaryAction)` on the
  set view and the root — the wrist's actual advantage over a phone is logging
  without your other hand. (`native/OnyxWatch/Views/SetView.swift`)
- Heart rate and active energy read live during a set; the finished workout is
  written back to Apple Health.

### Changed
- **Supabase finally merges two devices.** Appending to a session pulled from
  another device no longer replaces its sets. (`feat(watch,sync)`)

### Fixed
- The four 40 mm layout defects found by the shot loop before the wave shipped.

---

## [1.0.0] — 2026-09-07 · Initial Launch

Everything up to and including Phase 3's truth waves — the point at which the
native app stopped being a port of the web app and became the product.

### Added
- **Onyx native iOS app** — Today, Logger, Pulse, Nutrition, Workout, History,
  Exercises, Stack, Settings. Domain in `OnyxCore`, GRDB store and sync in
  `OnyxData`, design system and tiles in `OnyxUI`.
- **Widget extension** — five Home Screen families, a Lock Screen accessory and
  the running-workout Live Activity, reading `onyx.sqlite` straight out of the
  App Group container.
- **The Great Sync** — `SyncEngine`, `MirrorPuller`, `MirrorRealtime`, the
  outbox, and a Sync Doctor that answers with the server's own count.
- **Readiness v9** — the battery reads six weeks of you.
- **Phase 3 truth waves** — rescore on edit, PR engine, export v3, auth both
  ways, the logger engine, and the edit deck.
- Helix web app: dashboard, logger, nutrition, trends, reports, PWA.

### Changed
- The app is **Onyx**, all the way down — `apex51`/`axis4` became `onyx5`/`onyx4`.

---

<!--
── ADDING A RELEASE ─────────────────────────────────────────────────────────
Copy this block under [Unreleased], newest first. Keep the one-line theme after
the date — the table of contents a reader actually uses is the list of themes.

## [X.Y.Z] — YYYY-MM-DD · Theme

### Added / Changed / Fixed / Removed
- What a user can now do, or what stopped being wrong. Name the surface.

Omit any section with nothing in it. Then:
  1. set `"version"` in package.json
  2. npm run version:sync
  3. cd native && xcodegen generate
-->
