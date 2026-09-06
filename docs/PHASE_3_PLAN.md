# ONYX — Phase 3: The Elite Experience & App Store Preflight

> **Status: APPROVED 2026-09-06, not started.** Written by Track E (Fable) from three read-only code sweeps, a live Supabase introspection and one adversarial architecture review (60 findings, folded in). Twelve founder decisions recorded below; three questions still open with stated defaults. Nothing below has been executed.

## Context

Phase 2.5 closed 2026-09-06 (W13 gate green). The founder's Phase 3 brief: the live logger becomes the flagship screen; workout and sleep data become editable with correct cascades; a stress model, trend fixes and a dense LLM export land; the app clears App Store preflight with open sign-up. Two tracks in parallel: **Track E (Fable)** = engine, math, DB, sync, security. **Track U (Opus)** = SwiftUI, tokens, layout, web pages.

Standing rules from `PHASE_2_POLISH_PLAN.md`: tokens before pixels; vectors before Swift (TypeScript is the definition, `npm run golden` regenerates, `swift:core` replays); never edit `.xcodeproj` (edit `project.yml`, `xcodegen generate`); every wave ends with `code-reviewer`, `graphify update .` on trunk, shots via `SHOT_OUT=<scratchpad>`, `git-commit-helper`. Ownership: E owns `OnyxCore`, `OnyxData`, `src/lib/**`, fixtures, scripts, SQL; U owns `native/Onyx/`, `native/OnyxWidgets/`, `OnyxUI`, `src/app/**` pages, `project.yml`. **`LoggerModel.swift` is E-owned for the duration of E4.** A cross-line file lands as one announced commit.

## Decisions (founder, 2026-09-06)

| # | Question | Answer |
|---|---|---|
| 1 | Live Stats | **Segmented `Workout \| Live Stats` in the day-accent hero**, one `LoggerModel`. HR post-hoc only; live Watch HR is Phase 4. |
| 2 | Stress | **Report-only index** (Pulse tile, Trends series, export line). Battery untouched, no mood input. |
| 3 | Export | **Dense v3, ≤ 120 lines, headings kept, 6-line DERIVED footer.** v2 retired (default, see Q-open 2). |
| 4 | Auth | **Open sign-up now**: email + confirmation, native and web Sign-up screens, `role = member` default, in-app account deletion. |
| 5 | Set counts | **Historical rows untouched.** Week 6's logged shape becomes program `cutSets`; `routine_templates` rebuilt from Week 6. |
| 6 | Pre-fill | **Same `day_key`, skip maintenance-lever sessions**, set count always from the program. |
| 7 | Atlas | **Front/back flip with drag rotation**, depth shading. Real 3-D mesh is Phase 4. |
| 8 | Water | Symptom: **today's total stays stale / 0**. |
| 9 | Sept 6 duration | **Paste-SQL to exactly 60 min** in E0, **and audit the timer logic on both clients** (E4). |
| 10 | Progression alerts | **In-app only** (Workout tab card, exercise chip, session-open banner). |
| 11 | Policy pages | **Netlify Helix domain now**; domain swap later is one constant. |
| 12 | Duplicate exercises | **Propose only**; no merge in Phase 3. |

**Still open (defaults apply until answered):** (1) Stress band names — Calm · Baseline · Elevated · High · Overreached. (2) Retire export v2 outright in E5 — default **yes** (two byte-pinned layouts in two languages is a parity trap). (3) `ios/App` + `capacitor.config.ts` still exist (Phase 2.5 decision 14); the security sweep runs `capacitor-security` over `ios/` or the founder deletes `ios/` — default **sweep it, do not delete**.

---

## Pre-flight findings (facts, file:line, live DB 2026-09-06)

### F1 — The logger is already vertical; part of the ask shipped today
- `0a12e99` (Track U, today) replaced the horizontal pager with `ScrollView(.vertical)` + `LazyVStack` (`LiveLoggerView.swift:356`, comment `:334-355`). Horizontal swipe survives on the **set row** only (right = log). The options sheet is already behind a **long-press on the set number** (`ExerciseCardView.swift:506-510`).
- Per-set RPE is already words: `ExerciseCardView.swift:643-683` is a system `Menu` over `RpeLadder.stops` (`Effort.swift:50-59`, byte-ported from `src/lib/training/effort.ts`): Very Easy 5 · Easy 6.5 · Medium 7.5 · Challenging 8 · Hard 8.5 · Very Hard 9 · Max Effort 9.5 · Failure 10. Missing: a native control instead of a `Menu`, and RPE memory (`RpeMemory.swift` in core, unused by the logger).
- Rep window `floor–ceiling` already rendered (`ExerciseCardView.swift:151-168`) from `ProgramExercise.repWindow` (`Program.swift:129-134`). Web twin `ExerciseCard.tsx:424-430, 911-921`.
- Header is a 44 pt totals strip (`LiveLoggerView.swift:248-277`); no hero. 3-dot menu = Muscle distribution · Change phase · Skip rest (`:221-237`). Session timer is `Text(startedAt, style: .timer)` — no pause, no edit. Rest timer = `RestCapsule` in `.principal` (`:502-534`).
- Weight stepper ±2.5 hard-coded (`ExerciseCardView.swift:542-543`); `Ceilings.loadStepKg = 2.5` (`Ceilings.swift:80`). Duplicate exists (`LoggerModel.duplicate :371-386`); note is per-exercise (`ExerciseCardView.swift:78-82`).

### F2 — Pre-fill is the real gap: `wk1Kg` only, and ids differ by client
- `LoggerModel.seedRows :335-339` seeds every row from `plan.wk1Kg`; "previous" is the literal `"<wk1Kg>kg × <floor>"` (`previousLabel :346-349`). No `routine_templates` read (mirrored `MirrorModels.swift:1003`, never read), no last-session lookup, no progression feed.
- **Web-logged sets carry catalogue UUIDs in `exercise_id`; native writes `"helix5-<slug>"`** (`LoggerModel.swift:656-660`, duplicated in `ExerciseIndex.swift:148`). The Sept 6 Upper A session was logged on the web (`client_session_id` null, `exercise_order` null). Any seed that indexes history by `exercise_id` finds zero rows for it. History must be matched by canonical name (`PrRecorder.nameResolver` `PrRecorder.swift:157-169` + `ExerciseAliases.canonicalName`).
- Web precedence (`templateDraft.ts:1-19`): stored `routine_templates` → the exercise's last real session same era (**exercise-scoped, not day-scoped**) → `seedTemplates.ts` → `wk1Kg`.
- `routine_templates` is overwritten on every save (`save.ts:437-453`, PK `(user_id, day_key)`). **Live: every row was rewritten by Week 7's maintenance sessions** — `cb_a` 13 sets, `legs_a` 14, `arms` 13, `cb_b` 12, `legs_b` 15.
- Unilateral lifts (Lateral Raise, Single-Arm Pushdown, Crossover) are stored as L/R row pairs on the web (`side`, `pair_id`); native has no split concept and scores a pair as one set at the weaker side (memory `logger-wave-u`).

### F3 — Set counts: program `cutSets` disagrees with what Week 6 did
Program (web `programs.ts:137-145` and native `Program.swift:199-211` byte-identical) vs live `workout_sets`, Week 6 (2026-08-23 → 08-29), pairs collapsed to one set:

| Day | Program cut | Week 6 logged (working) | Δ |
|---|---|---|---|
| Upper A `cb_a` | 16 | **18** — Straight-Arm Pulldown 3, Face Pull 3 (program 2/2) | +2 |
| Legs & Core A `legs_a` | 19 | **20** + 1 warm-up — Reverse Crunch 3 (program 2) | +1 |
| Delts & Arms `arms` | tbd in E0 | 20 rows (Lateral Raise 4 rows = 2 pairs) | tbd |
| Upper B `cb_b` | tbd in E0 | 22 rows (Single-Arm Pushdown 6 rows = 3 pairs, Lateral Raise 4 = 2) | tbd |
| Legs & Core B `legs_b` | tbd in E0 | 18 + 1 warm-up | tbd |

Sept 6 Upper A (session `8a780ded`) holds 18 sets, the Aug 23 shape. The "16" is native's planned count (`Program.plannedSets`) in the totals strip. Nothing aggregates from the template — muscle distribution (`MuscleDistribution.swift:9`), `## Sets Targets` (`landmarks.ts:236`), charts — all count committed rows. `cutSets` **does** feed `ScoringInputs.plannedSets` → workout score and `ConsistencySeries`, so changing it requires a stored-score recompute.
Same session: `duration_min = 385` (started 10:46, `ended_at` 17:12). Web `save.ts:199-201` derives duration as `ended − started` unless the finish sheet passes one; web pauses (`sessionClock.ts`, `DurationSheet.tsx`) are not subtracted from that fallback.

### F4 — Muscle distribution parity already has a twin and a vector
`src/lib/sessions/muscleDistribution.ts` is the definition, `MuscleDistribution.swift:3` its port, `muscle-distribution.json` in the fixture set. The web **session report** deliberately uses `weeklyVolumeByMuscle` (`landmarks.ts:236`, a different question). Parity work = decide which rule the report shows; no new vector.

### F5 — Live PRs are dark on purpose; the ledger is written on close
`LoggerModel.beatsTheSeed :464-466` is `return false` (note `:445-463`): trophy, sweep, haptic, `prsThisSession` never fire. `PrRecorder.record` runs inside `closeSession` (`AppDatabase.swift:874-876`) → `personal_records` + outbox (71 rows live). `LivePrEngine` (`OnyxCore/Sessions/LivePrs.swift:67`) exists, unused. `PrRecorder` only **raises**; lowering a set after the fact needs a per-exercise replay (`backfill-prs.mjs` pattern).

### F6 — Progression engine exists, minus the feedback loop
`Ceilings.progressionVerdict` (`Ceilings.swift:222`: all working sets at ceiling, one load, two consecutive sessions → `.ready`, `top + 2.5`); `ProgressionQueue.alerts` (`ProgressionQueue.swift:25`, day/era filter `:60`); surfaced at `WorkoutTabView.swift:409` and `SessionDetailView.swift:463-480`. Header `Ceilings.swift:11` promises "RPE ≤ 8.5"; the code never reads RPE (and `workout_sets.rpe` is nullable, most history unrated). Nothing writes `suggestKg` into the next seed. One increment constant.

### F7 — Finish sheet: grid exists, dial is CR-10 numbers, suggestion already in core
`FinishSheet.swift:419-549` `RPEDial` 6→10; word under the ring (`:142-149`). Six tiles `:166-187`: Duration (derived, **not editable**), Tonnage, Sets, Avg HR (editable), Calories (editable), Records. `setSessionMetrics` (`AppDatabase.swift:943-958`) stamps `*_estimated = false`. `EffortWords.all` (`Effort.swift:197-203`) and `Effort.suggestEffortWord` (`OnyxCore/Training/Effort.swift:131`, vector `effort-suggest.json`) are both in core; the sheet uses neither.

### F8 — No recompute cascade; the existing hole is bigger than the ask
- `refreshDailyScore` has one production caller: `SyncCoordinator.scoreRecentDays` (`:485-491`) — today + yesterday (14 on backfill). `writeDailyScore` refuses a finalized past day without `force` (`DailyScoreStore.swift:67-70`).
- Readiness reads **49 days** (`ReadinessHistoryBuilder.swift:34-60`): `duration_min × session_rpe` feeds ACWR/monotony/strain, so an edited session moves `battery_pct` on every day up to **48 days after** it. `avg_bpm` / `calories_burned` feed nothing in the scorer.
- `TrainingTrendsView.swift:55-69` (`guard sessions == nil`), `HistoryView.swift:96`, `WeekDaysView` load once. `AppDatabase.onCommit` has two subscribers (widgets; `TodayModel` 300 ms debounce). Web: `realtimeKeys.ts:31` already fans `daily_scores`; `/api/compute-score` accepts `{date, backfillDays}` with a 31-day cap.
- No past-session **set** editing exists on native: `LoggerModel.attach` finds only today's live session (`liveSession(dayKey:date:)`), `closeSession` recomputes `duration_min = ended − started` and re-runs `PrRecorder`.

### F9 — Sleep: no edit surface, duplicate rows, HRV coupling
- Only writer is `DailyLogIngest.writeSleep` (`:382-422`, keyed by night window, no `date` column). Web `dailyLog.ts:429-459` **deletes the window and inserts a new id** on every push; `awake_min = payload.awake_min ?? 0` (`:447`), so legacy rows read 0 awake. `awake_min` is read by nothing in the scorer.
- **Live: two nights duplicated** (`2026-09-04T23:46` ×2, `2026-09-05T22:46` ×2; all 56 rows `hk_uuid` null; 22 s apart). No unique index on `(user_id, start_time)`.
- Overnight HRV = mean of SDNN samples inside HealthKit's own bed window, written by `HealthSync.sync` (`HealthSync.swift:92-105`) into `daily_logs.hrv_ms`; a trimmed night must re-read HRV over the **stored** window or the next sync re-widens it. Sentinel precedent for "user owns this day": water (`HealthPayload.swift:77-120`).
- Pulse arc: `PulseSleep.swift:74-90` `DepthArc` `min(180…300)`; stage grid `:137-153`. `0a12e99` fixed the stroke clip in `DepthArc`; the founder's clip may be the pre-fix build.

### F10 — Stress: v9 deleted the term; unused inputs exist
`battery.ts:49-57` documents the removal; residue is `// MARK: Fatigue / stress stack` (`OnyxSeries.swift:445`) over the five v9 drains. Unused or under-used inputs: `sleep_sessions.awake_min`, fatigue slots beyond the latest (`ScoringInputsBuilder.swift:151-155` keeps `Fatigue.latest` only), `wrist_temp_delta`, `respiratory_rate`. `sleep_onset_trouble` is one wellness item (`Battery.swift:178`). Four of the five candidate stress inputs are already battery inputs — the index will co-move with `BatteryStackSeries`, by construction.

### F11 — Trends bugs, both one-liners in shared code
- Callout duplicate: `OnyxCallout.Line.init` sets `id = label` (`OnyxChart.swift:174-177`); `SessionDetailView.swift:594-600` passes two `""` labels → `ForEach` identity collision → volume twice, PR line dropped.
- Lever per week already resolved one layer up (`HistoryWeeks.swift:197 isMaintenance`, `Levers.leverForDate` `Levers.swift:142`); `SplitVolumeChart` (`SessionDetailView.swift:527-600`) and `VolumeStreamCard` (`TrainingTrendsView.swift:111`) carry no lever axis.
- Composition: `BodyTrendsView.swift:316-380 LedgerSection`, plain `VStack`, no selection binding; the chart above already has `chartXSelection` + a 3-line callout (`:293-303`). `DeltaVerdict` is a core rule (`delta-verdict.json`); no colour helper in `OnyxUI` yet.

### F12 — Empty History day: a missing lifecycle call
`DayScreen`'s `.task` (`PulseTabView.swift:202-209`) opens with `guard startAtRows` and never calls `DayModel.observe()`; the Pulse tab does (`:45-51`), `SwapDaySheet.swift:36-44` does. `observe()` is idempotent (`PulseModel.swift:89`). The call goes **before** the guard.

### F13 — Water
- No HealthKit **write** exists (`HealthKitReader.swift:27-31` `toShare: []`). Read: `HealthMetrics.swift:120` → `DailyLogIngest.swift:135` (flat `water_ml` = HK sum + glasses) and `writeWater` (`:356-379`, ledger row scoped `hk_uuid IS NULL`). Scorer sums the ledger (`ScoringInputsBuilder.swift:298`).
- `readHealth` runs for every sync that is not realtime and not backfill (`SyncCoordinator.swift:329`), and `syncRecent` reads **today + yesterday** (`HealthSync.swift:47-53`). So "not read between backfills" is **not** the cause; candidates for "today stays 0": water read authorisation denied/undetermined for `dietaryWater`, the `IngestReport.declined` path, or the sync not running on foreground. Needs the device.
- Live: `manual-water-2026-09-05` override (3500 ml, written 21:19 on 09-05 by the pre-fix glass tap) blocks that day; no `water_intake` row for 09-06 at 18:50 local.

### F14 — Export: ~300 lines, native ships JSON not markdown
`buildWeeklyExport` (`weeklyExport.ts:1392`, 2,424 lines) and `WeeklyExport.build` (`WeeklyExport.swift:404`) are vector-equal (`weekly-export.json`, 8 cases; rich week 311 lines). Order pinned by `export-layout.test.ts:70-83`. Native `WeekDaysView.swift:129` shares the **input JSON**; `WeeklyExport.build` has no non-test caller. `/report` rules: deterministic, `—` for gaps, raw only, line-per-day, `trendLedger` the only table — but v2 already prints battery internals under `## Derived`, so the skill is stale on that point. `parseFmtV2` reads the **model's reply**, never the export — export layout is free to change.

### F15 — App Store & auth
- No `/support`, `/privacy`, `/delete-account` routes. `SettingsTabView.swift:159` links `OnyxLinks.privacyPolicy` (`:250`, `helix-health-fitness.netlify.app/privacy`, 404); `/support` is linked nowhere. No middleware, no allowlist, no `handle_new_user` in the repo (schema-of-record is live only).
- Live auth: `disable_signup = true`, email provider only, autoconfirm on, one user (`profiles.role = 'admin'`; the column is never read). No delete RPC; the only `rpc()` call is `exercise_history`.
- Open from W13: `next@15.5.19` (8 advisories), `signOut()` leaves `onyx.sqlite` for the widget, `PostgRESTRemote.deleteRow` filters on `id` only, `sharedFolder()` TOCTOU, AASA vouches for the old app id (needs `associated-domains` in `project.yml`), advisor: 20 multiple-permissive policies **and** 31 `auth.uid()` initplan policies (two different fixes), 6 unindexed FKs, `widget_tokens` to drop, `notion_*`/`_bak_20260723` to drop.

### F16 — Exercise catalogue (60 rows) carries tag material and PPL-era duplicates
`exercises.is_compound`, `muscle_groups[]`, `split_day`. Equipment is name-regex in `Flags.swift` (`ExerciseIcon.label:100`), unilateral `:76`, bodyweight `:36`. Eleven duplicate pairs (Leg Extension / Leg Extension (Machine), Calf Press / (Machine), DB RDL / Romanian Deadlift (DB), DB Hammer Curl / Hammer Curl (DB), Crunch Machine / Crunch (Machine), Machine Preacher Curl / Preacher Curl (Machine), Machine Hip Thrust / Hip Thrust (Machine), Lat Pulldown / (Cable), Straight-Arm Pulldown / Straight Arm Pulldown (Rope), Seated Leg Curl / (Machine), DB Shoulder Press / Shoulder Press (DB)). `scripts/merge-exercise.mjs` exists (moves PR baselines).

### F17 — Nutrition
`Levers.swift:82-101` rungs: baseline 1955/170P/195C/55F; `LeverId` enum `:23` (web `levers.ts:36`); schedule `:110-118` ends `2026-09-06 custom (open → live user_goals)`. Vectors: `lever-periods.json`, `lever-for-date.json`, `levers-table.json`, `lever-by-id.json`. Live `plan_phase_goals` cut = 2151/244/55 (maintenance numbers written 09-05), `target_profiles.home` 2150/244/55, `restaurant` 2400/170. 1935 = 170·4 + 190·4 + 55·9 exactly.

---

## Pitch

### P1 — Workout | Live Stats (decision 1)
One screen, two faces, one model. The hero (day-accent `MeshGradient` ≤ 12 % peak, "UPPER A · Chest + Back", week chip, 34 pt elapsed timer) carries a segmented control. **Workout** = the vertical deck from `0a12e99`; the totals strip leaves the deck (+44 pt). **Live Stats** = `ScrollView` of glass cards bound to the same `LoggerModel`:
1. **Now** — elapsed / paused / rest-so-far, sets done of planned, tonnage with a delta chip vs the seed's previous session.
2. **Exercises** — one 40 pt row per lift: name, done/planned dots, top set so far, progression chip (`▲ +2.5` / `1 more`).
3. **Muscle focus** — live `AtlasFigure` (front + back) shaded from `MuscleDistribution.weightedSets(draft)`; tap → `AtlasSheet` (flip). Replaces the 3-dot "Muscle distribution".
4. **Records** — PRs this session from the re-lit `LivePrEngine`, axis + old mark.
5. **Effort** — HR / calories post-hoc from the Watch workout, else the estimate the finish sheet would use.
Face switch = spring slide (damping 1.0; 0.8 only when flicked), timer pinned, deck scroll offset preserved. Fast actions (Phase · Skip rest · Note · Finish) = chip row under the hero on both faces. Rest countdown lives in the hero capsule.

### P2 — Stress index v1 (decision 2: report-only)
Readiness v9 grammar: personal z-scores, SWC-gated, clamped ±2, missing terms neutral, answered terms renormalised, load never negative. Daily `S ∈ [10, 90]` (the reachable range), 50 = your normal.

```
z_auto  = mean of answered { −hrvZ, rhrZ }                     Readiness.signals, already 7-day rolling + SWC-gated
z_sleep = mean of answered { fragZ, onset }
            fragZ = z(awake_min / asleep_min vs 42-day baseline, SWC 0.5·SD) clamped ±2
                    MISSING when the row is duration-only (awake = deep = rem = 0)
            onset = +1 if sleep_onset_trouble else 0             one-sided by design: a calm night does not de-stress
z_self  = (mean of the DAY's fatigue slots − 3)  on the 1–5 scale, clamped ±2   (all slots, not the latest)
z_load  = clamp( 0.5·( max(0, strainZ) + 2·max(0, min(ACWR, 2.0) − 1.3) / 0.7 ), 0, 2 )
S       = clamp( 50 + 20 · Σ wᵢ·zᵢ / Σ wᵢ  over ANSWERED terms, 10, 90 ),   w = { auto .35, sleep .25, self .25, load .15 }
```
No second smoothing: the z inputs are already rolling means; the tile sparkline draws S itself. Bands on the reachable range: Calm < 30 · Baseline 30–50 · Elevated 50–62 · High 62–75 · Overreached > 75 (a vector proves each band reachable). Links the founder asked for: **fatigue** (day mean of all slots), **battery drains** (the load drain's own inputs ACWR and strain z, not the drain value, so two surfaces cannot disagree), **trouble falling asleep** (onset). `Stress.breakdown` mirrors `Battery.breakdown`. `docs/STRESS_MODEL.md` states the collinearity with the battery plainly and asserts (test) that `Battery.breakdown` is independent of `Stress` — the budget stays 93.

### P3 — Export v3 "dense" (decision 3)
Same builder contract, new grammar an LLM can regex. Fields are `·`-separated tokens on one line per day / per exercise (not pipes, so the `report` rule "no tables but the ledger" survives); every gap is `—`; no prose, no notes; deterministic.

```
# ONYX WEEK 8 · 2026-09-06→2026-09-12 · Onyx-5 · Cut · lever=baseline-2 1935kcal 170P 190C 55F
## DAYS  date day sleep deep rem core awake hrv rhr kcal P C F water steps weight fat% smm fatigue doms onset
2026-09-06 Sun 7:29 95 127 227 16 48 54 1935 170 190 55 3.4 9812 — — — 2,3,—,3,— 0.4 0
## SESSIONS  date day dur hr kcal srpe sets prs · then one line per lift: name [floor–ceiling] load×reps@rpe … (W/F/D/G flags, L|R pairs)
2026-09-06 Upper A 60 130 394 8.5 18 0
  Incline DB Press [8–12] 40×11@8.5 40×9@8.5 40×9@9
## CARDIO date kind min km pace hr effort
## WEEK tonnage sets sessions kcal_avg P_avg water_avg steps_avg sleep_avg weight_Δ sets_by_muscle=chest:9,back:11,…
## LEDGER (week-over-week, unchanged aligned table)
## DERIVED load acwr strainZ wellness stress tdee   (6 lines, one per key, "computed by Onyx — not measured")
```
Target ≤ 120 lines (from ~310). Gone: nested per-day bullets, `## Sets Targets` zone words, the four closing notes, per-day battery breakdown. `.claude/skills/report/SKILL.md` is amended in E5 to document the token grammar and the DERIVED exception (it is already stale on `## Derived`). Native shares the markdown via `WeeklyExport.build`, JSON behind a long-press.

---

## Waves

Each wave: worktree `.claude/worktrees/onyx-p3-<id>` on branch `onyx/p3-<id>-<slug>` off `main`; setup per memory `worktree-guard-and-hooks` (link `node_modules`, copy `.env.local` + `Secrets.xcconfig`, `git config merge.ours.driver true`); merge back `git merge --no-ff` after gates; `git branch -d`; `graphify update .` on `main` (`--force` after worktree removal). Formula changes end with `npm run golden` + `invariant-auditor` + a stored-score recompute where scores move. Paste-SQL is proposed in chat after `/schema` introspection, never run by an agent. Scripts follow `/backfill` (dry-run, apply, dry-run again → zero).

### E0 — Truth first (Track E, 1.5 d) — FIRST, alone
Goal: the numbers every later wave reads are right.
1. Complete the F3 table (pairs collapsed by `pair_id`; warm-ups excluded from `cutSets`); edit `src/lib/programs.ts` + `Program.swift` in one commit; `npm run golden` (`program-onyx5.json`, `program-targets.json`, `program-lookups.json`); `ProgramsGoldenTests`. Then `scripts/recompute-scores.mjs` against a local `next start` for every cut day (2026-07-19 → today) — `cutSets` feeds the workout score.
2. `scripts/rebuild-routine-templates.mjs`: payload per `day_key` from that day's **Week 6** session, serialised through `payloadToTemplate` (`save.ts:438`, the only definition of the jsonb shape), `source_session_id` set. Dry-run / apply / dry-run.
3. Paste-SQL: delete the **newer** row of each duplicated `sleep_sessions` night (F9). No unique index yet — it lands in E2 after the web writer stops delete+insert. Gate includes `syncNow(.backfill)` so device stores drop the duplicate too.
4. Paste-SQL: `update workout_sessions set duration_min = 60 where id = '8a780ded-…'` (decision 9). E1's cascade gate uses a different session.
5. Nutrition: `LeverId.baseline2` in both twins (`Levers.swift:23`, `levers.ts:36`), rung 1935/170/190/55/10k, schedule `2026-09-06 baseline-2` replacing `custom`; vectors `lever-*.json` regenerated. Paste-SQL: `user_goals` (1935/170/190/55, `active_lever = 'baseline-2'`, `maintenance_until = null`), `plan_phase_goals` cut → 1935/170/190/55, `target_profiles.home` → same; restaurant untouched.
6. `await model.observe()` **before** the `guard startAtRows` in `DayScreen.task` (`PulseTabView.swift:202`); `HistoryWeeksTests` "a day opened from a week has a loaded window". Lifecycle bug, E-owned by exception.
7. `OnyxCallout.Line` id = stable (`UUID()` or index) at `OnyxChart.swift:174-177`; regression preview with two blank labels.
Skills: `schema`, `backfill`. Agents: `schema-truth-checker`, `invariant-auditor`, `code-reviewer`. Gate: phone totals strip `x/18` on Upper A; templates rebuilt (second dry-run zero); stored scores recomputed; no duplicate nights on server or device; Trends callout shows volume once + PR line; a History day shows data; `npm test`, `swift:core`, `swift:data` green.

### E4 — Logger engine: seed, live PRs, progression, pause, duration audit, water, tags (Track E, 3.5 d) — right after E0; the wave every U wave binds
1. **`OnyxCore/Sessions/SessionSeed.swift`** + TS twin `src/lib/sessions/sessionSeed.ts` + vector `session-seed.json`. One shared `sessionsForSeed(dayKey:)` (also adopted by `ProgressionQueue` so seed and verdict see the same history): sessions with `day_key == key` **and** `Era.forDate == current era`, ordered newest first, **skipping sessions under the maintenance lever** (`Levers.leverForDate`, decision 6). History rows matched by **canonical name** (`PrRecorder.nameResolver` + `ExerciseAliases`), never by `exercise_id` (F2); L/R pairs collapsed by `pair_id` to one set at the weaker side; warm-ups carried from the previous session as `kind = .warmup` rows. Rows = program working sets (post-E0) filled by working-set index; missing index → last known row's load, reps = floor; no qualifying session → `routine_templates` payload → `wk1Kg`. Progression: `.ready` for `(dayKey, exercise)` → weight = `suggestKg`, reps = floor, `progressed = true` for the chip. RPE via `RpeMemory.resolveSeededRpe` (stale on harder work). Web `templateDraft.ts` adopts the same tier order (parity edit, `routine-template.test.ts` updated).
2. `AppDatabase.sessionsForSeed(dayKey:userId:)` query in `SessionHistoryStore`; `LoggerModel.rebuildForPhase` calls the seed; `previousLabel` shows the real previous set.
3. Live PRs: at `attach`, baselines exactly as `PrRecorder.swift:59-68` into `LivePrEngine`; `beatsTheSeed` implemented; `prsThisSession` → Live Activity. Close path unchanged.
4. Progression cue: `progressionVerdict` gains the RPE ≤ 8.5 clause (**null RPE passes**; vector case); `Ceilings.loadSteps = [2.5, 1.25]` + `roundToStep`; alerts published on `AppEnvironment.progressionAlerts` for the in-app banner (decision 10).
5. **Pause + duration audit** (decision 9): `LoggerModel.pause()/resume()`; `set_events` gains `pause`/`resume` kinds (local-only table, `Models.swift:26`; `SetEventFold` tolerates the kinds on older stores); `closeSession` derives `duration_min = ended − started − paused`, capped by a long-idle guard (gap from last completed set to finish > 20 min → the finish sheet pre-fills `lastSet + restTarget` and marks it edited). Same rule ported to web `save.ts:199-201` so the fallback subtracts `sessionClock` pauses. Vector `session-duration.json` (started, ended, pauses, last set at → minutes). Report why 385 happened.
6. Water (decision 8, F13): on device with Sync Doctor + `IngestReport.declined`: check `dietaryWater` authorisation, that a foreground sync ran `readHealth`, and whether `writeWater` was skipped; fix the actual cause; list every `manual-water-*` sentinel and propose the delete for 09-05; `IngestTests` case for the failure found.
7. Tags: `OnyxCore/Exercises/Tags.swift` = `[compound|isolation] + equipment (Flags) + unilateral + bodyweight + timed`, TS twin `src/lib/exercises/tags.ts`, vector; chat proposal listing the eleven duplicate pairs with set counts and PR impact (decision 12, no merge).
Skills: `schema`. Agents: `swift-expert`, `invariant-auditor`, `schema-truth-checker`, `debugger` (water + 385). Gate: Upper A opens with Sept 6's 18 sets and loads (web-logged, name-matched); a `.ready` lift opens at +2.5 with the chip; a PR lights live and lands on the web after finish; pause 5 min → `duration_min` excludes it; water on the next day appears after a foreground sync; vectors green both sides.

### E1 — Rescore cascade + session editing (Track E, 3 d)
Goal: any edit to a session or a night rewrites every score it touches; past sessions are editable at the set level.
1. `OnyxData/Scoring/Rescore.swift`: `AppDatabase.rescore(from:reason:)` = `refreshDailyScore(force: true)` for `d in from … min(today, from + 48)`, detached, one transaction per day. `RescoreQueue`: pending = `min(from)` of every request since the run started; the running loop finishes its current day then restarts from pending. Publishes `AppEnvironment.rescoreGeneration` (incremented **only when a run completes** and on session/night edits — never per commit) and a `rescoring` flag for a thin hint. Outbox: confirm `RowPush` batches `daily_scores` rows into one upsert; otherwise coalesce to one row per date after the run.
2. `setSessionMetrics` gains `durationMin:` (`AppDatabase.swift:943-958`) with `duration_edited` semantics (the E4 close path never overwrites an edited duration).
3. **`SessionEditing`** (`OnyxData/Training/SessionEditing.swift`): `updateMetrics(sessionId:duration:avgBpm:calories:)`, `amendSet`, `addSet`, `deleteSet` on a **closed** session → `workout_sets` upsert with an identical key set per batch (memory `logger-wave-u`), `total_volume_kg` / `set_count` recompute, PR replay for the touched exercise (raise or **retract** — `PrRecorder.replay(exercise:)`, the `backfill-prs.mjs` rule), `pr_count` reconciled, then `rescore(from: session.date)`. `LoggerModel.attach(sessionId:)` opens a closed session in edit mode over this API (U4 binds it).
4. Web parity: session edit → `POST /api/compute-score { date, backfillDays, force: true }` with the cap raised 31 → 49 (`route.ts`); no realtime-key change (`realtimeKeys.ts:31` already fans `daily_scores`; `query-key-coverage.test.ts` forbids an unconsumed key).
5. U-owned views wire `.task(id: rescoreGeneration)` in their own waves (U4, U6); E1 only publishes.
6. Tests: `RescoreTests` (edit D → D…D+48 rewritten, `finalized` respected via force, queue coalesces, bound holds), `SessionEditingTests` (amend lowers a PR → record retracted; totals recomputed; outbox one batch).
Skills: `schema`, `supabase-postgres-best-practices`. Agents: `swift-expert`, `invariant-auditor` (a rescored day equals a fresh compute), `database-architect`, `code-reviewer`. Gate: on the phone, edit the Aug 30 session's duration → `daily_scores` 08-30 … today change and reach the web within a tick; lower a set on that session → its PR retracts on both clients; no main-thread hitch > 16 ms during the run.

### E2 — Sleep trim engine (Track E, 2 d)
1. `OnyxCore/Sleep/SleepTrim.swift` + TS twin `src/lib/sleep/trim.ts` + vector `sleep-trim.json`. Strategy A (native, samples available): re-aggregate `HKCategorySample`s inside the new window (`Sleep.aggregate`, `SleepNight.swift:60`). Strategy B (no samples / web): operate on **asleep minutes**, not window length — a trim removes awake minutes at the edges first, then scales deep/rem/core proportionally; an **extension** adds `core` only (documented: no samples means no stage claim). Web shows whatever the phone synced (A when available) — no byte-parity claim across strategies.
2. `DayEditing.editSleepWindow(date:start:end:)`: writes the row by **`id`** (outbox upsert on PK — the trim changes `start_time`, so a natural-key upsert would insert a second night), `hk_uuid = "manual-sleep-<wakeDate>"`; `writeSleep` declines the night when present; **`HealthSync` re-reads overnight HRV over the stored window** for a sentinel night (`HealthSync.swift:92-105`) so the next sync cannot re-widen it; `daily_logs.hrv_ms` updated; `rescore(from: wakeDate)`.
3. Web `dailyLog.ts:429-459`: upsert by `(user_id, start_time)` instead of delete+insert, respect the sentinel; **then** paste-SQL `create unique index sleep_sessions_user_start on sleep_sessions(user_id, start_time)`; native `writeSleep` upserts on it.
4. Tests: `SleepTrimTests` (A and B, extension rule, sentinel blocks ingest, HRV re-read over stored window, rescore called, id-keyed upsert).
Skills: `schema`. Agents: `swift-expert`, `invariant-auditor`, `schema-truth-checker`. Gate: trim last night by 30 min on the phone → stages re-sum, HRV and battery move, web shows the trimmed night; a later HealthKit sync changes nothing.

### E3 — Stress engine (Track E, 2 d)
1. `src/lib/scoring/stress.ts` (definition) + `OnyxCore/Scoring/Stress.swift` per P2; inputs: `Readiness.signals`, a new `fatigueDayMean` (all slots; `ScoringInputsBuilder.swift:151-155`), `awakeMin/asleepMin` 49-day series added to **both** `ReadinessHistoryBuilder` and web `readinessHistoryFor` / `fetchReadinessHistory` (`readiness-history.test.ts` extended).
2. `Stress.breakdown`; `StressSeries` in `OnyxCore/Charts/` (14-day, `BatteryStackSeries` shape). Export line lands in **E5 only**.
3. No new column in v1 (computed on read); documented upgrade `daily_scores.stress_index int` + `stress_breakdown jsonb` if the widget budget complains.
4. Vectors `stress-*.json` (incl. one case per band), `InvariantTests` (missing terms neutral, load ≥ 0, S ∈ [10, 90], `Battery.breakdown(inputs)` unchanged by any stress input), `docs/STRESS_MODEL.md` with the collinearity statement and citations (Plews 2013, Buchheit 2014, Foster 1998, Hooper 1995, Ohayon 2017 on fragmentation).
Skills: `schema`, `report`. Agents: `invariant-auditor`, `swift-expert`, `architect-review`. Gate: vectors green both sides; auditor clean; live series spot-check (Sept 1–2 illness days read Elevated+).

### E5 — Export v3 dense (Track E, 1.5 d)
1. `buildWeeklyExport` rewritten to v3 (P3); v2 retired (Q-open 2): `weekly-export.json` replaced, `export-layout.test.ts` rewritten (order header → days → sessions → cardio → week → ledger → derived), `export-completeness.test.ts` keeps "every day present, `—` for gaps".
2. Math review: `energyBalance` TDEE (`BMR + active + intake×0.105`), `trendLedger` deltas, `weeklyVolumeByMuscle` credits — verified against vector cases; discrepancies fixed with vectors. `## DERIVED stress=` from E3.
3. `WeeklyExport.swift` v3; native `WeekDaysView.swift:129` shares markdown (`ShareLink` text), JSON on long-press. `.claude/skills/report/SKILL.md` amended (token grammar, DERIVED exception, script table fixed).
Skills: `report`. Agents: `invariant-auditor`, `code-reviewer`, `prompt-engineer` (parse-ability pass: paste the rich week into a model, every set recoverable). Gate: rich week ≤ 120 lines; byte-equal web/native; `fmt-v2` suite green.

### E6 — Open sign-up, deletion, RLS, security sweep (Track E, 3 d)
1. `/schema` + `schema-truth-checker` on live triggers/policies. Paste-SQL set A (auth): `handle_new_user()` trigger on `auth.users` → `profiles(role = 'member')`, `user_goals` defaults, `plans` default (a fresh user renders empty states, never a crash); `delete_my_account()` — `security definer set search_path = ''`, `revoke execute from public, anon`, `grant to authenticated`, deletes every `user_id = auth.uid()` row across the 29 tables (list which lack an FK to `auth.users`), `auth.users` last; client signs out immediately (JWT lives until expiry). Set B (advisor): multiple-permissive-policy merges; set C: `(select auth.uid())` initplan rewrite; set D: 6 FK indexes, `drop table widget_tokens`, optional `notion_*`, `_bak_20260723`.
2. Dashboard: `disable_signup = false`, email confirmation **on** (autoconfirm off), rate limits reviewed. Native `SignUpView` (email, password, confirm, "check your inbox" state) beside `SignInView`; web `src/app/auth` gains Sign up. `profiles.role` read once: admin-only Settings rows (Sync Doctor, recompute) gated on it.
3. Demo account for App Review: `scripts/seed-demo-account.mjs`, **idempotent and re-runnable** (a reviewer may delete it mid-review), synthetic 6 weeks across ~15 tables, never the founder's rows; the RPC does not special-case it.
4. Native hardening: `PostgRESTRemote.deleteRow` adds `.eq("user_id")` per table; `signOut()` drain-then-erase + `reloadAllTimelines()` (`AppEnvironment.swift:325`); `AppDatabase.sharedFolder()` pure path resolution, adoption at app launch; Settings "Delete account" destructive row → RPC → wipe.
5. Web: `src/app/delete-account` (sign in → confirm → RPC → sign out); `npm i next@15.5.25`; `sharp` → devDependencies; AASA gets the Onyx app id (U adds `associated-domains` to `project.yml` in U7 — cross-line, one announced commit).
6. `security-review` on `main`; `capacitor-security` rules over `ios/` (Q-open 3); `docs/SECURITY_SWEEP_2026-09.md`.
Skills: `schema`, `supabase-postgres-best-practices`, `capacitor-security`, `security-review`. Agents: `schema-truth-checker`, `database-architect`, `supabase-schema-architect`, `code-reviewer`. Gate: a new email signs up on the phone, confirms, sees empty states; `delete_my_account()` on the demo account leaves zero rows; unauthenticated API 401; `npm audit` no high; widget blank after sign-out; founder still `admin`.

### U1 — Logger chrome: hero, timer, fast actions, Live Stats (Track U, 2.5 d) — parallel with E4
1. `LoggerHero` (`native/Onyx/Features/Logger/LoggerHero.swift`): day-accent `MeshGradient` (same discipline as `onyxScreen`), `day.label` 28 pt rounded semibold, sub + week chip, 34 pt mono elapsed timer. Timer tap → `TimerSheet` (pause/resume, "Edit start" wheel, "Edit elapsed" stepper) over a `PauseControlling` protocol declared in **`OnyxUI`** (stub until E4 merges; never inside `LoggerModel.swift`).
2. Segmented `Workout | Live Stats` per P1; `LiveStatsView` five cards over `LoggerModel` + `MuscleDistribution` + a `LivePrProviding` stub in `OnyxUI`. Totals strip deleted from the deck.
3. `OnyxChipRow` (new, `OnyxUI`): Muscle focus · Phase · Skip rest (contextual) · Note · Finish; 3-dot menu deleted; rest capsule under the hero.
4. Live Activity mirrors pause.
Skills: `apple-design`, `ui-ux-pro-max --stack swiftui`, `frontend-design`, `dataviz`, `visual-check`. Agents: `ios-developer`, `ui-ux-designer` (critique on the first shot), `code-reviewer`. Gate: `logger`, `logger-stats`, `logger-paused` shots default + AX5; hero ≤ 132 pt; no layout warnings.

### U2 — Set row, options sheet, effort picker, targets, tags (Track U, 2 d) — after U1
Respect `logger-wave-u`: zero spare width; anything added comes out of `SetColumn`.
1. Set row: number badge 32 pt circle — **tap = complete** (check + accent fill, spring, haptic); long-press keeps the options sheet; row swipes retired. Steppers per `apple-design`: press-down highlight, repeat, weight tap 2.5 / long-press 1.25 (haptic + `1.25` badge while held), reps ±1; value tap → `NumericField`.
2. `SetOptionsSheet` redesign: `.height(320)` detent, grabber, title "Set 3 · Incline DB Press", glass toggles Warm-up · Failure · Drop set · Skip (ghost) in `SetKind` colours, Quality as a six-chip picker, Delete last. **Duplicate and Note removed** (`LoggerModel.duplicate` deleted in the same commit — announced cross-line).
3. Effort picker sheet replacing the `Menu`: 8-stop horizontal ladder, colour ramp, hint under the selection; seeded value muted with a "rate" pip when stale (E4 RPE memory; stub until merge).
4. Exercise header 56 pt: muscle-family colour bar (`MuscleGroup.domain`), name, tag chips (E4 `Tags`, stub list), `@ 8–12` with ceiling in accent, progression chip, previous-set label from the seed.
Skills: `apple-design`, `ui-ux-pro-max`, `visual-check` (402 pt and 375 pt — a row that eats the deck gutter fails). Agents: `ios-developer`, `ui-ux-designer`, `code-reviewer`. Gate: `set-row`, `set-options`, `effort-picker` shots both widths + AX5; VoiceOver labels on every control; logger tests green.

### U3 — Finish sheet (Track U, 1 d) — after E1
1. Dial detents = `EffortWords.all` (Easy · Solid · Hard · Brutal · Everything) drawn on the ring, the word large in the centre, CR-10 small beneath; `Effort.suggestEffortWord` (already in core) pre-selects.
2. Metrics → one horizontal 3-cell row: Duration · Avg HR · Calories, each tappable to an inline stepper/numeric edit, provenance dot (measured / estimated / edited). Binds E1 `setSessionMetrics(durationMin:)`. The long-idle pre-fill from E4 shows as "edited".
3. Records and heaviest-movement lines kept; "View summary" unchanged.
Skills: `apple-design`, `dataviz`. Agents: `ui-ux-designer`, `ios-developer`. Gate: `finish` shot; editing duration changes `duration_min` and the battery.

### U5 — Pulse sleep compaction, sleep edit sheet, Stress tile (Track U, 1.5 d) — after E2 + E3
1. `SleepTile`: arc 96 pt left (`DepthArc` lineWidth 8), Deep/Core/REM/Awake as 4 × 22 pt rows right (dot, name, minutes, share), duration + goal under the arc, onset toggle kept; tile ≤ 168 pt; confirm the clip is gone post-`0a12e99` on device.
2. Tap the onset→wake line → `SleepEditSheet`: two `DatePicker(.wheel)`, live duration, stage preview from E2 strategy B, Save → `editSleepWindow`; edited nights show a pencil glyph.
3. Stress tile on Pulse + `StressSeries` on Trends: index, band word, 14-day sparkline, tap → breakdown sheet (four terms).
Skills: `apple-design`, `dataviz`, `ui-ux-pro-max`. Agents: `ui-ux-designer`, `ios-developer`. Gate: `pulse` ≤ 1.5 screens; `sleep-edit`, `stress` shots default + AX5.

### U4 — Session summary cards, Atlas flip, Edit session (Track U, 3 d) — after E1 + E4
1. `SessionDetailView` cards edge-to-edge (no horizontal card padding, 16 pt inner).
2. Titles through `ExerciseSlug.nameBySlug` + `ExerciseAliases.canonicalName` (`helix5-incline-db-press` → "Incline DB Press"); glass gradient title bar tinted `Color.onyx.muscle(family)`.
3. Footer blob (`SessionDetailView.swift:484-493`) → `MetaTagRow`: capsules `Top 40 kg × 11` · `29 reps` · `1,160 kg` · `RPE 8.7` · `vs 30 Aug ▲`, 24 pt, monospaced digits.
4. Muscle Focus tile → `AtlasSheet` (decision 7): drag rotates through a Y-axis flip front ↔ back, depth shading, parallax, landmark tap → share.
5. **Edit session** → `LiveLoggerView` in edit mode over E1 `SessionEditing` + E4 `attach(sessionId:)`; hero shows the original date; Finish → `updateMetrics` + rescore. `.task(id: rescoreGeneration)` reload wired here.
6. Day card (`PulseWorkout.swift:25`) gets the same title/tag treatment.
Skills: `apple-design`, `ui-ux-pro-max`, `frontend-design`. Agents: `ui-ux-designer`, `ios-developer`, `code-reviewer`. Gate: `session-detail`, `session-atlas`, `session-edit` shots; `rg 'helix5-' native/Onyx` hits only the slug helper.

### U6 — Trends: maintenance holes, composition tooltip (Track U, 1 d) — after E1
1. `SplitVolumeChart` + `VolumeStreamCard`: maintenance-lever sessions/weeks (`Levers.leverForDate`, `HistoryWeeks.Capsule.isMaintenance`) drawn hollow / hatched with a "Maintenance" legend chip; callout says so. `.task(id: rescoreGeneration)` reload wired in `TrainingTrendsView`, `HistoryView`, `WeekDaysView`, `BodyTrendsView`.
2. Callout duplicate: regression shot on a PR session (E0 fixed the primitive).
3. `BodyTrendsView`: delete `LedgerSection`; the selection callout becomes a floating ledger card (date, value, Δ vs previous with a new `DeltaVerdict` colour helper in `OnyxUI`, days since) following the scrub; long-press pins it.
Skills: `dataviz`, `apple-design`. Agents: `ui-ux-designer`. Gate: `trends`, `trends-maintenance`, `body-trends-tooltip` shots.

### U7 — Web pages, sign-up UI, Settings rows, App Store copy (Track U, 1.5 d) — after E6
1. `src/app/privacy`, `src/app/support` (Onyx copy in the Helix shell; HealthKit statement matching `PrivacyInfo.xcprivacy`: Health · Fitness · Email, Collected · Linked · not tracking · App Functionality), `src/app/delete-account` (E6 RPC), web Sign up on `/auth`.
2. Native: `SignUpView` layout (E6 owns the auth call), Settings rows Support · Privacy · Delete account; `OnyxLinks` gains `support`; `project.yml` `associated-domains` entitlement + `xcodegen generate` (cross-line with E6's AASA).
3. `docs/APP_STORE.md` §0 rows 1–3 closed, `⟨…⟩` metadata filled with founder-approved copy (never "single-user"), demo credentials in App Review Information.
Skills: `capacitor-apple-review-preflight`, `nextjs-best-practices`, `apple-design`. Agents: `frontend-developer`, `ios-developer`, `code-reviewer`. Gate: both URLs 200 on production; sign-up → confirm → first launch on device; delete flow against the demo account.

### W-GATE — Phase 3 ship gate (both, 1 d)
`code-reviewer` on `main` since E0; `security-review`; `capacitor-apple-review-preflight` full checklist (bundle id, entitlements incl. `associated-domains`, privacy manifest vs questionnaire, sign-up + deletion flows); full shot loop (default + AX5 + widgets); `npm test`, `swift:core`, `swift:data`, `golden` zero diff; Release build `CODE_SIGNING_ALLOWED=NO`; `graphify update .`; memory + `docs/` refresh (`READINESS_MODEL.md` cross-references `STRESS_MODEL.md`; `backfill/SKILL.md` script table corrected — six named scripts do not exist, five real ones are missing).

### Sequencing
```
Day 1-2    E0 (alone — program twins, DB, shared primitives, stored-score recompute)
Day 2-5    E: E4 (logger engine)            U: U1 → U2 (stubs in OnyxUI)
Day 6-8    E: E1 (rescore + editing)        U: rebase U1/U2 on E4 → U3 (needs E1) → U6 (needs E1)
Day 9-12   E: E2 → E3                       U: U4 (needs E1 + E4)
Day 13-15  E: E5 → E6                       U: U5 (needs E2 + E3) → U7 (needs E6)
Day 16     W-GATE
```
E ≈ 16 d · U ≈ 12.5 d. Track U idles ~2 d waiting on E2/E3 unless U5's sleep compaction (item 1, no E dependency) is pulled forward into the U3 slot — recommended.

---

## Verification (end-to-end)
1. Upper A on the phone opens with Sept 6's 18 rows pre-filled from the last non-maintenance Upper A (a web-logged session, name-matched); totals `0/18`; a `.ready` lift opens at +2.5 with its chip; tap set number completes; long-press opens the sheet; effort picker in words; pause 5 min → duration excludes it; finish dial in words; a PR lights live and lands on the web.
2. Edit the Aug 30 session's duration on its summary card → `daily_scores` 08-30 … today rewritten on phone and web; lower a set → the PR retracts; Trends and History reflect without leaving the tab.
3. Trim last night 30 min → stages, HRV, battery move; a HealthKit sync does not undo it; web shows the sentinel night.
4. Stress tile shows a value with a band; vectors green both sides; `STRESS_MODEL.md` numbers match vectors; `Battery.breakdown` unchanged by stress inputs (test).
5. Export v3 rich week ≤ 120 lines, byte-equal web/native; pasted into a model, every day and set is recoverable.
6. New email signs up on the phone and web, confirms, sees empty states; `/privacy`, `/support`, `/delete-account` 200 on production; demo account deletes cleanly and re-seeds; founder still `admin`; `npm audit` no high; sign-out blanks the widget.
7. Suites: `npm test`, `swift:core`, `swift:data`, `golden` zero diff; `invariant-auditor` clean on scoring, stress, seed, PR engine; Release build; shot loop.

---

## Prompts (copy-paste)

### Fable — E0 (run first, alone)
```
You are Track E (Fable) on Onyx, Phase 3. Read docs/PHASE_3_PLAN.md fully (Decisions, findings F3/F9/F11/F12/F17, wave E0), then docs/GIT.md and every memory file under ~/.claude/projects/-Users-michael-Documents-PyCharmProjects-Onyx/memory/. Execute wave E0 exactly as written, in order: (1) complete the Week 6 set-count table with pairs collapsed by pair_id, edit cutSets in src/lib/programs.ts and Program.swift in one commit, npm run golden, then run scripts/recompute-scores.mjs against a local next start for every cut day since 2026-07-19; (2) write scripts/rebuild-routine-templates.mjs reusing payloadToTemplate from src/lib/sessions/save.ts, dry-run, apply with HELIX_APPLY=1, dry-run again to zero; (3) propose the sleep duplicate delete as paste-SQL in chat after /schema introspection — you never run SQL yourself; (4) propose the paste-SQL setting session 8a780ded-2ba9-41d7-aeef-fa4da7a25b25 duration_min to 60; (5) add LeverId baseline-2 (1935/170/190/55/10k) to both lever twins and the schedule at 2026-09-06, regenerate the lever vectors, propose the user_goals / plan_phase_goals / target_profiles paste-SQL; (6) put await model.observe() before the guard in DayScreen's task and add the HistoryWeeksTests case; (7) give OnyxCallout.Line a stable id. Worktree .claude/worktrees/onyx-p3-e0, branch onyx/p3-e0-truth off main, set up per the worktree-guard-and-hooks memory. Skills: schema, backfill, git-commit-helper. Agents: schema-truth-checker before any claim about a column; invariant-auditor after the program and lever edits; code-reviewer before merge. Self-correct: npm test, npm run golden (zero diff after regeneration), npm run swift:core, npm run swift:data, Release build with CODE_SIGNING_ALLOWED=NO must all be green before you claim green — if a gate fails, fix it, never report around it. Merge --no-ff into main, delete the branch, graphify update . --force, write a memory note for anything a reader of the diff could not know. Report: before→after counts per day, the SQL blocks for me to paste, the recompute delta, and anything left undone with the reason.
```

### Fable — E4 (after E0 merges; the wave Track U binds)
```
You are Track E (Fable) on Onyx, Phase 3. Read docs/PHASE_3_PLAN.md — Decisions 6, 8, 9, 10, 12; findings F2, F5, F6, F13, F16; wave E4; verification 1 — and the memory files logger-wave-u and readiness-v9-model. LoggerModel.swift is yours for this wave; Track U is building the hero and set row against stub protocols in OnyxUI and will rebase on you. Build, in this order and TDD each: (1) SessionSeed in OnyxCore with the TypeScript twin and session-seed.json — sessionsForSeed(dayKey:) shared with ProgressionQueue (same day_key, current era, maintenance-lever sessions skipped), history matched by canonical name through PrRecorder.nameResolver and ExerciseAliases (web sets carry catalogue UUIDs, native writes helix5- slugs — an id match returns nothing), pairs collapsed by pair_id to the weaker side, warm-ups carried as warm-up rows, working sets from the program by index, progression .ready pre-filling suggestKg, RPE memory via RpeMemory; web templateDraft.ts adopts the same tiers; (2) the AppDatabase query and LoggerModel.rebuildForPhase calling the seed; (3) live PRs: baselines at attach exactly as PrRecorder builds them, beatsTheSeed implemented; (4) progressionVerdict gains the RPE ≤ 8.5 clause with null passing, loadSteps [2.5, 1.25], alerts on AppEnvironment.progressionAlerts; (5) pause/resume with pause/resume kinds in set_events, duration_min = ended − started − paused with the 20-minute long-idle guard, the same fallback fix in web save.ts, vector session-duration.json — and tell me why the Sept 6 web session recorded 385 minutes; (6) water on the device: Sync Doctor plus IngestReport.declined, find the real cause of "today stays 0", fix it, add the IngestTests case, list every manual-water-* sentinel and propose the delete SQL; (7) Tags in OnyxCore + TS twin + vector, and a chat proposal for the eleven duplicate catalogue pairs — no merge. Worktree .claude/worktrees/onyx-p3-e4, branch onyx/p3-e4-logger-engine. Skills: schema, git-commit-helper. Agents: swift-expert, invariant-auditor (seed, ceilings, PR engine), schema-truth-checker, debugger for water and the 385, code-reviewer before merge. Gates: vectors green both sides, npm test, swift:core, swift:data, Release build, and the device checks in wave E4's gate line. Merge --no-ff, delete the branch, graphify update ., memory note naming the protocols U1/U2 must now bind to. Report with the seed rule as implemented, the 385 root cause, the water root cause, and the tag proposal.
```

### Opus — U1 (parallel with E4)
```
You are Track U (Opus) on Onyx, Phase 3. Read docs/PHASE_3_PLAN.md fully — Decisions 1 and 7, findings F1 and F7, pitch P1, wave U1 — then the logger-wave-u memory (the set row has no spare width) and docs/GIT.md. Do not edit LoggerModel.swift or ExerciseCardView.swift: the first is Track E's for wave E4, the second is wave U2. Build the logger chrome: LoggerHero with the day-accent mesh, title, week chip and the tappable 34 pt elapsed timer whose TimerSheet (pause / resume / edit start / edit elapsed) binds a PauseControlling protocol you declare in OnyxUI as a stub; the Workout | Live Stats segmented control with the Live Stats page per P1 (Now, Exercises, Muscle focus, Records, Effort) bound to LoggerModel, MuscleDistribution and a LivePrProviding stub in OnyxUI; the OnyxChipRow fast actions replacing the 3-dot menu; the rest capsule under the hero; the totals strip removed from the deck; Live Activity mirroring pause. Worktree .claude/worktrees/onyx-p3-u1, branch onyx/p3-u1-logger-chrome off main. Skills: apple-design (respond on press, springs at damping 1.0 with 0.8 only on the flicked segment slide, every transition interruptible), ui-ux-pro-max --stack swiftui, frontend-design, dataviz for the Live Stats cards, visual-check. Agents: ui-ux-designer for a critique pass on your first screenshot before you polish, ios-developer, code-reviewer before merge. Self-correct: shots via SHOT_OUT=<scratchpad>/shots for logger, logger-stats and logger-paused at default and AX5, cp the PNGs into native/__screenshots__, and look at every one; npm test, swift:core, swift:data and the Release build green. Merge --no-ff, delete the branch, graphify update ., memory note on the stub protocols E4 must satisfy. Report with screenshot paths and the exact protocol signatures.
```

### Opus — U2 (after U1 merges)
```
You are Track U (Opus) on Onyx, Phase 3. Read docs/PHASE_3_PLAN.md — findings F1, F2, F6, F16, wave U2, Decision 12 — and the logger-wave-u memory: every point of width you add to the set row must come out of SetColumn, and a row that silently eats the deck gutter is a failure even when the measurement passes. Redesign the set row and its sheets: set-number badge tap = complete (check, accent fill, spring, haptic), long-press keeps the options sheet, row swipes retired; apple-design steppers with weight tap 2.5 and long-press 1.25 (haptic, badge while held) and reps ±1; SetOptionsSheet with Warm-up, Failure, Drop set, Skip, a six-chip Quality picker and Delete — Duplicate and Note removed (announce the LoggerModel.duplicate deletion as a cross-line commit; touch nothing else in LoggerModel.swift); the effort picker sheet over RpeLadder.stops replacing the Menu, with the stale-seed pip; the 56 pt exercise header with the muscle-family colour bar, tag chips from a Tags stub until E4 merges, the @ floor–ceiling target and the progression chip. Worktree .claude/worktrees/onyx-p3-u2, branch onyx/p3-u2-set-row. Skills: apple-design, ui-ux-pro-max, visual-check (measure at 402 pt and 375 pt). Agents: ui-ux-designer critique on the first shot, ios-developer, code-reviewer before merge. Gates: set-row, set-options and effort-picker shots at both widths and AX5; VoiceOver labels on every control; logger and rpe-ladder tests green; npm test, swift:core, swift:data, Release build. Merge --no-ff, delete the branch, graphify update ., memory note with the new SetColumn width budget. Report with screenshot paths and the SetColumn numbers you ended on.
```
