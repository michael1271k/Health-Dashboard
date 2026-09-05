# ONYX — Phase 2.5: Polish, Parity & Bug Fixes

**Status: ADOPTED 2026-09-05, not yet executing.** Founder-approved after a brainstorm (14 decisions in §Decisions). Supersedes nothing: `docs/NATIVE_PHASE_2_PLAN.md` stays the record of what Phase 2 decided. Written by Track E (Fable) from four read-only code sweeps + a live Supabase introspection on 2026-09-05.

First action when execution starts: W0 (this file is already on disk; memory `phase-2-5-plan` is written). Scope: iOS native app (Onyx). Web (Helix) is edited **only** for sync/parity: realtime fan-out keys, the exercise-summary twin, the supplement-credit twin, the plan-id rename, and the already-written API auth fix reaching production.

## Context

Phase 2 shipped the Onyx UI and the Great Sync. Device QA found vanishing data, empty dashboard/trends/history/nutrition strip, an "Axis" label, widget marks off the corner, supplement micros ignoring skips, and a desktop blind to half of what the phone writes. Four read-only code sweeps plus a live schema introspection found **one root cause behind six symptoms**, three sync holes nobody had listed, and one production security gap.

## Decisions (founder, 2026-09-05)

| # | Question | Answer |
|---|---|---|
| 1 | Trunk | **Merge into `main` + Netlify build-ignore for native-only commits.** `[skip ci]` retired. |
| 2 | Rename depth | **Everything now, including packages** (`OnyxCore/OnyxData/OnyxUI`, `Helix*` type prefixes, bundle id, App Group, URL scheme, Keychain, env, launch arg). |
| 3 | Plan ids | **Migrate `apex51 → onyx5`, `axis4* → onyx4*` everywhere** (code both sides, vectors, three DB rows), with a legacy-id normaliser so old rows still resolve. |
| 4 | Exercise parity truth | **Native definitions** (pairs collapsed, warm-ups per `sessionVolumeKg`, e1RM day **mean**) → HelixCore fn + TS twin + vector; web exercise page adopts the twin. |
| 5 | Supplement credit | Counted once slot time passed, unless skipped or archived; explicit Taken counts immediately. |
| 6 | Readiness | **Full v9**: ln-HRV vs 42-day baseline + SWC, RHR z, Foster sRPE load + EWMA ACWR 7:28, monotony/strain, Hooper-style wellness. Breakdown tile. |
| 7 | Coach | Delete; replace with a **Goal Board** row. |
| 8 | Backgrounds | **Per-tab mesh, battery-reactive.** |
| 9 | Workout tab | **Doors row + rich cardio card**, Zone 2 folded in, nav icons removed. |
| 10 | Atlas | Hidden on Pulse behind a row; visible in the Muscle Focus tile. |
| 11 | HealthKit prompt | In-app banner only. |
| 12 | Filters | Current phase · Current lever · Since cut · 30 d · 90 d · All; default Current phase. |
| 13 | Inputs | Watch worn to sleep → overnight HRV samples; sRPE logged every session → no fallback. |
| 14 | Purge scope | Delete 12 merged local branches, remote `track-d`/`track-s`, both worktrees. **Keep `ios/App`** until Wave 9. |

## Pre-flight findings (facts, file:line)

### F0 — Production is behind the auth fix (SECURITY)
Netlify site `helix-health-fitness` builds `main`; current production deploy = `826df5c` (2026-09-02). The Phase 2.13 fix (JWT-only `/api/today`, `/api/sessions`, `/api/compute-score`; `src/lib/auth/guard.ts` deleted; `src/tests/api-auth.test.ts`) is on `feature/native-migration-wave-1` only ("chore: deploy the API auth fix" is its tip). The unauthenticated read/write of the health record is still live. Repo is public (`michael1271k/Health-Dashboard`). **W0's first push is the merge to `main`, no `[skip ci]`.**

### F1 — UUID casing (root cause of 6 symptoms; ~95 % on code, device check in W1)
- `native/HelixNative/App/AppEnvironment.swift:366` `userIdString = userID.uuidString` → UPPERCASE.
- Pulled rows keep Postgres lowercase `user_id` verbatim (`HelixData/Mirror/MirrorStore.swift:22-27`); `TrainingPuller.swift:135` rewrites a locally-logged session's id to lowercase on every pull.
- SQLite `=` on TEXT is binary; no collation at `AppDatabase.swift:200`. Every `Column("user_id") == userId` read misses every synced row: `WidgetSnapshotBuilder.swift:300`, `TodayFeedBuilder.swift:94`, `NutritionWeek.swift:67,84`, `TrainingTrendsStore.swift:38`, `VitalsStore.swift:35-43`, 24 sites in `DayEditing.swift`, 13 streams in `PulseModel.swift`.
- Repo precedent: `EventStore.swift:288-295` + `HelixJSON.swift:44` lowercase event ids; `HistoryWeeks.swift:256-259` dropped the filter as a workaround (why the week list works and the day page does not); widgets work because `HelixProvider.swift:47` reads the id off a mirrored `profiles` row.
- Vanishing Today = `.refreshable` (`TodayTabView.swift:84-88`) → pull rewrites ids → `database.onCommit` → 300 ms debounce (`TodayModel.swift:81-88`) → detached rebuild with zero sessions replaces the feed. The 0.5 s is the debounce.
- "0 kg" not "—": `HelixSnapshot.WeekTotals.volumeKg` non-optional (`HelixCore/Widget/Snapshot.swift:186-190`), empty reduce → 0, violating `WidgetSnapshotBuilder.swift:15-16`.
- Simulator stores are empty (unsigned builds drop the session — memory `native-sim-signed-session`), so not observed live. W1 step 1: `SELECT DISTINCT user_id` per table on the device store; on Supabase `select user_id,date,count(*) from daily_scores group by 1,2 having count(*)>1` (native may have inserted duplicate score rows — `DailyScoreStore.swift:78-84`).

### F2 — Sync holes
- **Native never writes `personal_records`** (`LoggerModel.swift:78-85`). PrEngine is fully ported (`HelixCore/Training/PrEngine.swift:210-521`).
- Native pull-only: `custom_supplements`, custom `exercises`, `personal_records`, `routine_templates`, `target_profiles`, `program_day_layout`, `reports`, `profiles`.
- `supplement_dose_overrides`: pulled, never written, zero readers both sides, 0 rows live. Dead.
- Web realtime fan-out covers **13 of 29** tables (`src/lib/query/realtimeKeys.ts:14-44`); publication `supabase_realtime` has the same 13. No polling in `src/` (`refetchInterval` zero hits; `staleTime` 60 s).
- `fatigue_logs` / `doms_logs`: web upserts on natural key, native on `id`, no server unique index.
- Native pulls window tables whole (`SyncCoordinator.swift:202-210`); native realtime subscribes all (`MirrorRealtime.swift:113-115`). Docs §2.3 stale on the 90-day cap.

### F3 — Naming
- Strings: `TrainingTrendsView.swift:75` `"Axis"` (rawValue `axis` load-bearing for `VolumeSplit.splits(forEra:)`); `HistoryView.swift:43-47` says "Onyx" for the same era; `Phases.swift:83-86` eraTags `"HELIX · Week 0"`, `"Helix Cut"`, `"HELIX Transition"`, `"HELIX Lean Bulk"`; `WeeklyExportBuilder.swift:94` `"Helix Cut/Bulk"`. Web renders dynamically (`useEraWindow.ts:134`).
- Project: `project.yml` name `HelixNative`, targets `HelixNative`/`HelixNativeWidgets`/`HelixNativeTests`, bundle id `app.helix.health.michael.native`, App Group `group.app.helix.health` (`AppDatabase.swift:43`), URL scheme `helix://`, Keychain service `app.helix.health.michael.native.auth`, store `Helix/helix.sqlite`, launch arg `--helix-screen`, env `HELIX_SUPABASE_URL/ANON_KEY`, `HELIX_SESSION_FILE`, `HELIX_START_TAB`, `HELIX_NO_HEALTH`, compile flag `HELIX_ADP`, scratch `~/Library/Caches/helix-swift`.
- Packages `HelixCore`/`HelixData`/`HelixUI` (~250 k identifier hits) + ~60 `Helix*` types. Generators emit into them: `scripts/gen-mirror-swift.mjs`, `scripts/gen-atlas-swift.mjs`, `scripts/check-swift.sh`, `scripts/gen-report-bundle.mjs`, `package.json` `swift:*` paths, `src/tests/golden-vectors.test.ts:221-224` fixture path.
- Ids in code: `Programs.swift:65,76-81,118-119` (`apex51`, `axis4`, `axis4_builder`, `axis4_defender`), `Program.swift:196`, `src/lib/programs.ts:134,195`; `LoggerModel.swift:543` exercise slug prefix `"helix5-"`; `Program.helix5` symbol.
- Supabase: schema clean. Values: `plans.program_id='apex51'`, `plan_phase_goals.plan_id='apex51'`, `user_goals.active_program='axis5_hybrid'` (legacy fallback column, `Preferences.swift:41-43,73-75`).

### F4 — Git
- 12 local branches fully merged into wave-1: `feat/{charts,dashboard,ingest,logger,polish,scaffold,scoring,supabase}`, `v4-part1`, `v4-part2`, `track-d/domain`, `track-s/sync`. Remote stale: `origin/track-d/domain`, `origin/track-s/sync`. Worktrees `.claude/worktrees/track-{d,s}` clean.
- `main`: 2 doc commits ahead (`4c825f3`, `e844365`), 81 behind. `.gitattributes` covers only `graphify-out/graph.json`. Uncommitted in main tree: `graphify-out/*` regen, untracked `.agents/`, `.codex/`, `skills-lock.json`.

### F5 — Supplements
- Native credits **zero** stack micros (`NutrientsView.swift:63` `amount: nil`; `PulseModel.decodedCustoms` :392-400 drops `micros`; `NutritionModel.nutrients` :255-267 has no stack term). Web credits scheduled-minus-skipped from 00:00 (`useTodayNutrients.ts:59-88`, `supplementNutrients.ts:80-104`). No archive concept (hard DELETE, `useCustomSupplements.ts:168`). `slotTimePassed` is chip text only (`PulseStack.swift:83-91`). Skips live in `supplement_log` (`DayEditing.swift:266-291`).
- Skip dialog: `.confirmationDialog` on `DaySheet` root (`PulseStack.swift:65-78`) → anchors to sheet top. Correct pattern: `PulseScale.swift:61-67` (attached to the row).

### F6 — Widget mark
- 37 inline `HelixBrand` (`HelixPrimitives.swift:691-698`), zero overlays. Inside split columns: `HelixLifestyle.swift:337,411,654,802,1581`, `HelixPerformance.swift:156`; mid-tile baseline: `HelixLifestyle.swift:881,992,1223,1323,1491`, `HelixTraining.swift:898`. Single seam: `FuelView`, `TrainingView`, `BodyView`, `DailyView`, `VitalsView`, `LockView` (each ends in `.containerBackground`) + `HelixTile.face(_:entry:)` (`HelixTile.swift:108-127`). Live Activity inline on purpose.

### F7 — Exercise hub parity
- Epley / PrEngine / SessionVolume 1:1, 18 fixtures. Summary strip diverges: web `exercise_history` RPC (pairs doubled) vs native derived (pairs collapsed, warm-ups excluded, `ExerciseDetailView.swift:50,200-217`). e1RM hero: web day mean (`ExerciseHistoryBody.tsx:63`) vs native day max (`SessionAnalysis.swift:221-229`). No vector on the strip.

### F8 — Fatigue/stress today
- HRV = HealthKit SDNN daily average (`HealthMetrics.swift:102`) → `daily_logs.hrv_ms`; baseline trailing 7-day mean excl. today (`ScoringInputsBuilder.swift:132-143`); stress drain linear, cap 10 (`Battery.swift:166-186`). No sRPE load / ACWR / TRIMP anywhere. `session_rpe` (CR10/10), `duration`, `avg_bpm`, `calories_burned` per session; cardio `effort`, `avg_hr`, `duration_min`. `HKWorkout` HR read exists (`SessionMetrics.swift:26-60`); `sleep_sessions.start_time/end_time` give the overnight window.

### F9 — HealthKit prompt hook
- `HealthSync.sync` returns `IngestReport`; `tables` contains `body_composition` when a weigh-in landed (`DailyLogIngest.swift:332`). No shared banner: three copies (`LiveLoggerView.swift:372-390`, `PulseTabView.swift:75`, `NutritionTabView.swift:73`). InBody sheet opened at `PulseTabView.swift:153`.

### F10 — Live schema advisors
- `widget_tokens`: RLS on, zero policies (unreachable via PostgREST). 31 per-row `auth.uid()` policies; 20 duplicate permissive policies; 6 unindexed FKs; 3 duplicate index groups; dead `_bak_20260723` schema; `notion_credentials`/`notion_exports` exist. Verified live: `daily_logs.sleep_onset_trouble` ✓, fatigue slot CHECK keeps legacy keys ✓, `daily_targets.track_carbs/track_fat` ✓, `target_profiles` has no flags, `body_composition` uses `water_pct` and `estimated_waist_to_hip_ratio`.

---

## Waves

Standing rules: tokens before pixels; vectors before Swift; never edit `.xcodeproj` (edit `project.yml`, `xcodegen generate`); `#Preview` under `#if DEBUG`; every wave ends with `code-reviewer`, `graphify update .` (on trunk only), shots via `SHOT_OUT=/private/tmp/...`, `git-commit-helper`. Track E = Fable (engine, sync, math, DB). Track U = Opus (UI, compaction, tokens, project). Each wave = one worktree `.claude/worktrees/onyx-w<N>` on branch `onyx/w<N>-<slug>` off `main`, merged back `--no-ff` after gates; branch deleted on merge.

### W0 — Trunk, purge, production fix (Track E, 0.5 d) — FIRST, alone
1. Commit or discard the main-tree stragglers (`graphify-out` regen → commit; `.agents/`, `.codex/`, `skills-lock.json` → ask founder, default `.gitignore`).
2. `git checkout main && git merge --no-ff feature/native-migration-wave-1` (two doc commits on main merge trivially). **Push without `[skip ci]`** → Netlify deploys the auth fix. Verify: `curl -i https://helix-health-fitness.netlify.app/api/today` returns 401 with no JWT.
3. `netlify.toml` `[build] ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- . ':(exclude)native' ':(exclude)docs' ':(exclude)graphify-out' ':(exclude)*.md'"`. Test with a docs-only push (build skipped).
4. Delete: 12 local branches; `git push origin --delete track-d/domain track-s/sync`; `git worktree remove` both; delete `feature/native-migration-wave-1` locally, keep on origin **7 days** then delete (memory note).
5. `.gitattributes`: `graphify-out/** merge=ours`, `native/__screenshots__/** merge=ours`; `git config merge.ours.driver true` (document in `docs/`).
6. Ownership map: E owns `native/Packages/OnyxCore`, `OnyxData`, `src/lib/**`, fixtures, SQL; U owns `native/Onyx/`, `native/OnyxWidgets/`, `native/Packages/OnyxUI/`, `scripts/native-shot.sh`. A cross-line file lands as one announced commit.
Skills: `git-commit-helper`. Agents: none. Gate: production 401 on unauthenticated API; `git branch -a` = `main`, `origin/main`, `origin/feature/native-migration-wave-1` (frozen); one worktree.

### W1 — Casing fix + Sync Doctor (Track E, 1 d) — same day as W0, alone
1. Verify F1 on the device store and the duplicate-score query.
2. `HelixJSON.canonicalUserID(UUID) -> String` = lowercase; `AppEnvironment.userIdString` uses it; same value into `SyncCoordinator`/`HealthSync`/`TargetResolver` (:204-208). Grep-test: no `.uuidString` outside `HelixJSON` without `.lowercased()`.
3. GRDB migration `v11.lowercaseUserIds`: `UPDATE <every user_id table> SET user_id = lower(user_id)`; collapse duplicate `daily_scores` (keep newest); if server has duplicates, paste-SQL to delete the uppercase-origin rows (uuid type means no server dupes are possible on `user_id`; check `(user_id,date)` unique index exists — introspect).
4. `WeekTotals.volumeKg` → `Double?`; faces render "—" on nil.
5. `UserIdCasingTests`: local write + stubbed pulled row → one distinct id.
6. **Sync Doctor** (Settings › Sync): per-table local count vs server exact count (`Prefer: count=exact` HEAD on `PostgRESTMirrorRemote`), distinct-user-id count, outbox pending, last error, "Reconcile" = `syncNow(.backfill)`. `sync-doctor` added to PreviewHarness + SCREENS.
Skills: `native`, `schema`. Agents: `swift-expert`, `schema-truth-checker`, `debugger`. Gate: pull-to-refresh keeps data; dashboard volume + muscle focus populate; Trends/History day/Nutrition strip populate; Sync Doctor equal on every table.

### W2 — The Onyx purge (Track U, 1.5 d) — solo, nothing else runs
1. **Directories & packages**: `git mv native/HelixNative native/Onyx`, `HelixNativeWidgets → OnyxWidgets`, `HelixNativeTests → OnyxTests`, `Packages/HelixCore → OnyxCore`, `HelixData → OnyxData`, `HelixUI → OnyxUI`; `Package.swift` names/products; `import` lines; `project.yml` (name `Onyx`, targets, scheme, packages, entitlements/plist paths, `bundleIdPrefix app.onyx.health.michael`, `PRODUCT_BUNDLE_IDENTIFIER app.onyx.health.michael.native`, App Group `group.app.onyx.health`, URL scheme `onyx`); `xcodegen generate`.
2. **Type prefixes**: `Helix*` → `Onyx*` (~60 types: `HelixSpace`, `HelixSnapshot`, `HelixDomain`, `HelixWidgetType`, `HelixJSON`, `HelixSupabase`, `HelixTileEntry`, `HelixAtlas*`, `HelixChart*`, `HelixCorner`, `HelixMotion`, `HelixSleepStage`, `HelixWorkoutAttributes`, …). Mechanical: `rg -l 'Helix' native | xargs sed`, then compile-driven fixes. Modifiers `helixGlass/helixScreen/helixChart` → `onyx*`. `Program.helix5` → `Program.onyx5`.
3. **Runtime identifiers with migration**: `AppDatabase.appGroupID`, store folder `Onyx/onyx.sqlite` with a one-time move from `Helix/helix.sqlite` (extend the existing move at `AppDatabase.swift:57-64`); Keychain service `app.onyx.health.michael.native.auth` (forces one re-sign-in; commit says so); `LoggerModel.swift:543` slug prefix stays `"helix5-"` **only if** existing local set rows depend on it — check; otherwise `"onyx5-"` with a normaliser.
4. **Env/flags/scripts**: `ONYX_SUPABASE_URL/ANON_KEY` (Info.plist, `Secrets.xcconfig`, `Secrets.example.xcconfig`, `HelixSupabase.swift`), `ONYX_SESSION_FILE`, `ONYX_START_TAB`, `ONYX_NO_HEALTH`, `ONYX_ADP`, `--onyx-screen`, `scripts/native-shot.sh`, `scripts/check-swift.sh`, `scripts/gen-mirror-swift.mjs`, `scripts/gen-atlas-swift.mjs`, `scripts/gen-report-bundle.mjs`, `package.json` `swift:*`/`check:*` paths + scratch `onyx-swift`, `src/tests/golden-vectors.test.ts` fixture path, `native/README.md`, `.gitignore` entries, `docs/`.
5. **Strings**: `EraFilter.label` → `Programs.plan(id:)?.label`; one shared `EraPicker` for Trends + History; `Phases.swift:83-86` → "Onyx · Week 0", "Onyx Cut", "Onyx Transition", "Onyx Lean Bulk" (TS twin `src/lib/phases.ts` eraTags stay "Helix" — web keeps its brand; the vector for phases must therefore compare `kind`/dates, not tag text — check `phases.json`); `WeeklyExportBuilder.swift:94` → "Onyx Cut/Bulk" (TS twin header parity: export tests compare bytes → the web export line changes too, allowed as parity); preview comments.
6. `ios/App` untouched (decision 14).
Skills: `native`, `capacitor-apple-review-preflight` (bundle/entitlements section). Agents: `ios-developer`, `swift-expert` (Package.swift). Gate: `rg -i 'helix' native --type swift` returns only the `"helix5-"` slug (if kept) and historical comments; `npm test`, `swift:core`, `swift:data`, Release build clean; sim launches under the new bundle id; widgets read the moved store; memory files updated (`track-s-worktree`, `native-shot-loop`, `ios-build-verify-command` paths).

### W3 — Plan-id migration (Track E, 0.5 d) — right after W2
1. `src/lib/programs.ts` + `OnyxCore/Training/Programs.swift`: ids `onyx5`, `onyx4`, `onyx4_builder`, `onyx4_defender`; `normalizePlanId` maps `apex51→onyx5`, `axis4*→onyx4*`, `axis5_hybrid→onyx5` (both sides, vector `plan-id-normalize.json`); every `Programs.plan(id:)` / `activeProgram()` lookup goes through it.
2. Paste-SQL (after introspection): `update plans set program_id='onyx5' where program_id='apex51'; update plan_phase_goals set plan_id='onyx5' where plan_id='apex51'; update user_goals set active_plan='onyx5', active_program='onyx5';` plus any `workout_sessions`/`program_day_layout` column that stores a plan id (introspect first).
3. Regenerate vectors (`npm run golden`), fixtures referencing `apex51` (`TrainingGoldenTests`, `SeriesGoldenTests`, e2e fixtures).
Skills: `schema`. Agents: `schema-truth-checker`, `invariant-auditor` (plan resolution). Gate: web + phone both show "Onyx-5 · Cut"; old sessions still resolve their split colours; `rg 'apex51|axis4|axis5' src native` hits only the normaliser and its vector.

### W4 — Bidirectional sync completion (Track E, 2 d)
1. **PR ledger from native**: `LoggerModel.finish` → `PrEngine.buildBaselines` (from local `workout_sets` + seed book `PrTruth`) → `detectSessionPrs` → `recordSets` → `personal_records` rows in the same transaction as sets → outbox (conflict key = the server's unique index; introspect). Memory rules: `pr-count-reconcile-rule` (pr_count only raised), `pr-seed-record-book`, `pr-engine-invariants`, `reentry-week-pr-policy`. One-off: recompute PRs for every native-logged session (idempotent, like the web backfill script).
2. Push paths for `custom_supplements` (create/edit/archive/delete), custom `exercises` (insert; `exerciseCatalogue()` stays select), `target_profiles`, `program_day_layout` — `npm run mirror` regen; drop `supplement_dose_overrides` from the catalogue + `native/schema/supabase.json` (server drop-SQL proposed).
3. **Realtime 13 → 29**: paste-SQL `alter publication supabase_realtime add table cardio_logs, fatigue_logs, doms_logs, daily_targets, custom_supplements, personal_records, dashboard_layouts, target_profiles, program_day_layout, plan_phase_goals, plan_phase_volume, routine_templates, plans, exercises, profiles, widget_tokens;` + extend `src/lib/query/realtimeKeys.ts` with the matching query keys (`useCardio`, `useFatigue`, `useRecovery`, `useCustomSupplements`, PR hooks, targets). The one web edit of the wave.
4. Natural-key unique indexes (paste-SQL after a duplicate check): `fatigue_logs (user_id,date,slot)`, `doms_logs (user_id,date,muscle_group)`; native upserts switch to them.
5. `widget_tokens` policy (paste-SQL) so the snapshot endpoint's table is reachable; optional Notion/`_bak` drops.
6. `SyncRoundTripTests` (env-gated live, pattern `BackfillLiveTests`): each mirrored table write → server → second store.
Skills: `schema`, `supabase-postgres-best-practices`, `capacitor-offline-first`. Agents: `swift-expert`, `schema-truth-checker`, `supabase-realtime-optimizer`, `invariant-auditor`. Gate: phone logs cardio / water / fatigue / DOMS / supplement skip / weigh-in / PR → web shows each without reload; web logs weight / sleep onset / nutrition / lever change → phone within one tick; Sync Doctor equal.

### W5 — Mark, mesh, Goal Board, banner (Track U, 1.5 d) — parallel with W4
1. Mark: delete 37 inline `OnyxBrand`; one `.overlay(alignment: .topTrailing) { OnyxMark }` in the six family containers + `OnyxTile.face`; padding `s`; never on Lock faces; Live Activity untouched.
2. `onyxScreen(domain)` gains a per-tab 3×3 `MeshGradient`: Today Lunar, Workout Ion, Nutrition Solar, Pulse Tide, Settings neutral; peak ≤ 10 %, top-anchored 280 pt + a faint bottom-left stop; intensity × `clamp(0.5 + battery/200)` (dimmer under 40 %); Reduce Transparency → flat; token-discipline test extended.
3. Delete the insight coach (`TodayCards.swift` insight parts); add **Goal Board** 64 pt row: weight rate/week vs phase target rate, ETA to phase target, this-week deficit — reads `TargetResolver` + `TrajectorySeries`/`DeficitLedgerSeries` (W10 E; binds to a stub protocol until merged).
4. One `OnyxBanner` (glass row, icon, text, action) replacing the three inline banners; `AppEnvironment` publishes `weighInPending` when today's `IngestReport.tables ∋ body_composition` and the row lacks muscle/water → banner on Today + Pulse → `InBodyEntryView` pre-filled with weight/fat/BMI/FFM.
Skills: `apple-design`, `ui-ux-pro-max --stack swiftui`, `frontend-design`. Agents: `ios-developer`, `ui-ux-designer`. Gate: every `widgets-*` page mark top-right; `today` default + AX5; banner shot.

### W6 — Supplement Stack v2 (E 1 d → U 1.5 d)
E: paste-SQL `alter table custom_supplements add column archived_at timestamptz;` `OnyxCore/Supplements/SupplementStack.creditedDoses(date:now:log:customs:)` = scheduled ∧ archived_at ∉ (≤ date) ∧ ¬skipped ∧ (taken ∨ slotTimePassed); freeze-for-a-day = a `supplement_log` skip row; TS twin in `src/lib/nutrition/supplementNutrients.ts` (web `useTodayNutrients` adopts it — parity edit) + vector `stack-credit.json`; `PulseModel.decodedCustoms` carries `micros`; `NutritionModel.nutrients` adds the stack term; `NutrientsView` shows it as a second segment.
U: Stack leaves the bottom sheet → Pulse row → pushed **Stack** screen (Apple Health Medications pattern): `List` sections Due · Taken · Later · Archived; swipe leading Taken, trailing Skip today / Freeze tomorrow / Archive; long-press menu Edit · Re-add · Delete; skip dialog attached to the row (`PulseScale.swift:61-67` pattern); `+` add sheet.
Skills: `apple-design` §9, `ui-ux-pro-max`. Agents: `swift-expert`, `schema-truth-checker`, `invariant-auditor` (E); `ios-developer` (U). Gate: skip at 21:00 removes that dose's micros; archived never counted; before slot time not counted; vectors green; `stack` shots.

### W7 — Exercise Hub parity + compaction (E 1 d → U 1.5 d)
E: `OnyxCore/Training/ExerciseSummary.swift` (heaviest working set · best e1RM · best session volume via `sessionVolumeKg`) + TS twin `src/lib/training/exerciseSummary.ts` + vector; web exercise page swaps the RPC for the twin (`ExerciseHistoryBody.tsx`, disclaimer deleted); native hero series = `E1rmSeries` (mean), `SessionAnalysis.sessionBestE1rm` retired for charts.
U: cards −15 % (content rows 40 pt, padding `s+2`, sparkline 32×12); summary strip caveat one line; "Directly / assisting" as single-line chips; History tab short sessions in a fixed 2-column set grid, centred.
Skills: `dataviz`, `apple-design`. Agents: `invariant-auditor`, `code-reviewer`, `ios-developer`. Gate: identical three numbers web/phone for the same lift; `library`, `exercise-summary`, `exercise-history` shots.

### W8 — NutrientsView redesign (Track U, 1 d)
Grouped `List` (Macros · Vitamins · Minerals · Other); 2 nutrients per row as cells (name 13 pt, value/target 15 pt mono, 3 pt gauge with floor/ceiling tick, stack segment); header "8/12 met"; nothing taller than its content.
Skills: `ui-ux-pro-max`, `apple-design` §3, `dataviz`. Agents: `ui-ux-designer`. Gate: `nutrients` + AX5; ≤ 2 screens at default size.

### W9 — Workout tab redesign (Track U, 2 d)
This-week panel · Today's session · **Doors row** (Library · History · Trends, three 64 pt glass cells with a live number: lifts tracked / sessions this month / week Δ; nav icons removed) · **Cardio card** (last bout: date, type, distance, pace, avg HR; Tide sparkline of last 8; Zone 2 as a 36 pt progress row inside; `+`) · Ready-to-progress · footer CTA.
Skills: `ui-ux-pro-max --stack swiftui`, `apple-design`, `dataviz`. Agents: `ios-developer`, `ui-ux-designer`. Gate: `train`, `train-empty` default + AX5.

### W10 — Readiness v9 (Track E, 3 d)
- Inputs: overnight HRV = mean of `HKQuantitySample` SDNN inside the night's `sleep_sessions` window (fallback: daily mean, flagged); RHR; sRPE load = `session_rpe×10 × duration_min` (lifting) and `effort × duration_min` (cardio); DOMS mean severity; fatigue slots; onset trouble; sleep ratio.
- Model (`OnyxCore/Scoring/Readiness.swift`, TS twin `src/lib/scoring/readiness.ts`): `lnHRV` 7-day rolling mean vs 42-day baseline mean/SD, SWC = 0.5·SD → z clamped ±2; RHR z likewise; EWMA acute (λ=2/8) / chronic (λ=2/29) load ratio (ACWR), monotony = mean/SD of 7-day loads, strain = weekly load × monotony; wellness = Hooper-style 4-item sum normalised.
- Battery v9 = charge(sleep duration 0.45, stages 0.15, HRV z 0.25, RHR z 0.15) − drains(time, activity, workout, **load** (ACWR > 1.3 and strain z), **wellness**); `maxTotalDrain < 100` kept; per-term breakdown struct exposed for the tile and the export `## Derived` block.
- Vectors `readiness-*`, `invariant-auditor`, `scripts/recompute-scores.mjs` against a local `next start`, `docs/READINESS_MODEL.md` with citations (Plews 2013, Buchheit 2014, Foster 1998/2001, Williams 2017, Hooper 1995).
Skills: `schema`, `report`. Agents: `swift-expert`, `invariant-auditor`, `schema-truth-checker`. Gate: vectors green; auditor clean; stored days recomputed; export tests green.

### W11 — Pulse, History, Trends layouts (E 0.5 d → U 2 d)
E: `OnyxCore/Time/EraWindow.swift` (`.currentPhase | .currentLever | .sinceCutStart | .days(30) | .days(90) | .all`) ported from `useEraWindow`, labels from plan/phase names; vector.
U: one `VitalsGrid` (3 columns × 64 pt cells: value, unit, delta, 24 pt sparkline) for Pulse and History day; Weight above Fatigue/Soreness; onset-trouble → 32 pt row with `.mini` toggle; DOMS → 44 pt "Soreness map" row with severity glyph → atlas sheet; Scale entry regrouped (Weight & Fat · Muscle · Water; 2–3 fields per row; "Fill from last time"; derived fields collapsed); past-day **Workout summary** card → `SessionDetailView`; week capsules get `Maintenance` (from `Levers.leverForDate`) and `Active` (`WeekWindow.isCurrent`) tags; Trends + Body Trends + History range picker → `EraWindow`.
Skills: `apple-design`, `ui-ux-pro-max`. Agents: `swift-expert` (E), `ios-developer`, `ui-ux-designer`. Gate: `day`, `day-past`, `history`, `history-week`, `trends`, `scale` shots default + AX5; Pulse ≤ 1.5 screens.

### W12 — Dashboard revolution (E 1 d → U 3 d)
E: `OnyxCore/Charts/`: `ConsistencySeries` (planned vs done, 8 weeks), `DeficitLedgerSeries` (TDEE incl. TEF − intake; weekly sum; expected vs scale-measured kg at 7700 kcal/kg), `TrajectorySeries` (weight EWMA, rate/week, ETA to phase target), `BatteryStackSeries` (v9 breakdown per day), `BodyCompSeries` (SMM · LST · FFM · fat %). Vectors each.
U: tiles (small + medium, app grid + WidgetKit, all via `WidgetSnapshotBuilder`): **Muscle Focus** (56 pt shaded 2D atlas + top-3 family bar), **Cut/Bulk Trajectory** (EWMA line, target-rate band, ETA chip; title flips with phase kind), **Consistency** (8×7 dot strip + program-day flame), **Deficit Ledger** (weekly bars vs expected loss, running reconciliation), **Fatigue/Stress Stack** (stacked drains under the charge line), **Body** (three-metric strip, 30-day deltas). Empty states `OnyxChartEmpty`. Goal Board (W5) rebinds from stub to real series.
Skills: `dataviz`, `apple-design`, `ui-ux-pro-max`. Agents: `swift-expert`, `ios-developer`, `ui-ux-designer`. Gate: `widgets-*`, `today`; populated + empty shot per tile.

### W13 — Ship gate (both, 1 d)
`code-reviewer` on `main` since the W0 merge; `security-review`; `capacitor-apple-review-preflight` native sections (new bundle id/App Group); full shot loop (default + AX5 + widget pages); `npm test`, `swift:core`, `swift:data`, `golden` staleness; Release build; memory + `docs/` refresh (`NATIVE_PHASE_2_PLAN.md` §2.3 90-day note corrected); `graphify update .`.

### Sequencing
```
Day 1   W0 → W1 (E, alone)          trunk + production fix + casing
Day 2-3 W2 (U, alone)               the rename — nothing else edits native/
Day 3   W3 (E, 0.5 d)               plan ids (after W2 lands)
Then    E: W4 → W6e → W7e → W10 → W11e → W12e
        U: W5 → W8 → W9 → W6u → W7u → W11u → W12u
Last    W13
```
E ≈ 9.5 d · U ≈ 13 d. U waves binding an E result (W5 Goal Board, W6u, W7u, W11u, W12u) rebase on `main` after the E merge; until then they bind a stub protocol.

## By-hand list for the founder (nothing here is in git)
- **Now**: approve W0's push to `main` (deploys the auth fix). Still outstanding from memory: delete `NEXT_PUBLIC_DEV_*` on Netlify, rotate the Supabase password.
- Paste-SQL (each proposed in chat at its wave, introspected first): W3 plan-id updates; W4 publication add-tables, natural-key unique indexes, `widget_tokens` policy, optional drops (`supplement_dose_overrides`, `notion_*`, `_bak_20260723`); W6 `custom_supplements.archived_at`; optional `(select auth.uid())` policy rewrite.
- After W2: sign in once more on the simulator/device (Keychain service changed); `Secrets.xcconfig` keys renamed by hand (gitignored).
- GitHub: delete `origin/feature/native-migration-wave-1` one week after W0.

## Verification (end-to-end)
1. Production: unauthenticated `/api/today` → 401.
2. Device: pull-to-refresh keeps data; dashboard shows week volume + muscle focus; Trends, History day, Nutrition strip populated; Sync Doctor equal on all tables.
3. Cross-client: phone → web for cardio, water, fatigue, DOMS, supplement skip, weigh-in, PR without reload; web → phone for weight, sleep onset, nutrition, lever change within one realtime tick.
4. Suites: `npm test`, `npm run swift:core`, `npm run swift:data`, `npm run golden`; `invariant-auditor` clean on PR engine, supplements, readiness, plan resolution.
5. Shots: full loop default + AX5; every widget mark top-right; every new tile populated + empty.
6. Release build `CODE_SIGNING_ALLOWED=NO` (never `-sdk iphoneos`); `rg -i helix native --type swift` clean.
