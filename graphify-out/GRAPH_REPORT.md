# Graph Report - Helix  (2026-08-14)

## Corpus Check
- 406 files · ~708,036 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2582 nodes · 6747 edges · 168 communities (120 shown, 48 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `365ef295`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HealthkitPlugin
- useScheduleVersion
- supabase/types.ts
- reportSchema.ts
- @capacitor/ios
- ContentView.swift
- palette.ts
- sw.js
- Next.js PWA Dashboard (Netlify)
- ReadinessOrb.tsx
- CardioLogger.tsx
- MuscleAnalyticsPanel.tsx
- ceilings.ts
- Sheet.tsx
- landmarks.ts
- app/layout.tsx
- [date]/page.tsx
- useWeeklyVolume.ts
- lucide-react
- compilerOptions
- workout/page.tsx
- draft.ts
- prEngine.ts
- useInsights.ts
- FmtV2Report.tsx
- settings/page.tsx
- session/page.tsx
- programs.ts
- components.json
- handle
- parse.ts
- displayWeight
- nutrition/page.tsx
- app/page.tsx
- RecoveryTrackers.tsx
- recompute-scores.mjs
- resolveExercises.ts
- View
- FileSystemBrowser.tsx
- pr-truth.test.ts
- activeProgram
- dailyLog.ts
- @capacitor/preferences
- useScheduleOverrides.ts
- HelixSnapshot
- useHelixReducedMotion
- ExerciseCard.tsx
- Breaking the watchOS install loop
- Zone.tsx
- ContinuumTimeline.tsx
- devDependencies
- StepsChart.tsx
- usePlanPhaseGoals.ts
- scripts
- useMuscleAnalytics.ts
- ExerciseBreakdown.tsx
- constructor
- HelixWidgets.swift
- split-exercise-by-day.mjs
- manifest.json
- delete
- dependencies
- route-client-boundary.test.ts
- clone
- HealthKitPlugin
- healthkit.ts
- recharts
- _awaitComplete
- InBody.tsx
- @supabase/supabase-js
- useDayVault.ts
- Smart Background Sync
- eslint.config.mjs
- backfill-prs.mjs
- compute-score/route.ts
- MuscleFocus.tsx
- package.json
- BrandHeader.tsx
- responsive.spec.ts
- keep-alive.mts
- next.config.ts
- global-error.tsx
- sw.ts
- PathfinderTimeline.tsx
- reseed-muscle-groups.mts
- capacitor.config.ts
- prefsSync.ts
- BodyCompositionChart.tsx
- @capacitor/app
- @serwist/next
- overrides.ts
- nightWindow
- program.test.ts
- phases.ts
- Free Apple ID / Personal Team signing
- logicalTodayISO
- useWeeklyLoop.ts
- Helix app icon concept: two intertwined DNA-style double helices (silver + glowing orange) forming an 'H' monogram
- Helix app brand logo mark (blue crossing/interlocking chevron symbol)
- Helix Double-Helix Logo Mark (silver + orange strands)
- Helix brand concept: app name and visual identity built on DNA double-helix motif, rendered as stylized 'H' letterform (silver + orange strands)
- Helix brand mark: dual double-helix 'H' logo motif (silver + glowing orange strands)
- Helix brand icon motif: twin double-helix strands (silver + orange) symbolizing the app name/theme
- AuthGate.tsx
- useCharts.ts
- .mcp.json
- tapLight
- eraForDate
- @capacitor/haptics
- merge-exercise.mjs
- HelixEntry
- client.ts
- SummaryBands.tsx
- RealtimeProvider.tsx
- Status
- BodyMap.tsx
- pathfinder/page.tsx
- snapshot/route.ts
- ingest/schema.ts
- cachedResponseWillBeUsed
- SupplementChecklist.tsx
- postcss.config.mjs
- Code-Comment Convention (no Phase-N tags)
- Playwright (e2e)
- generate-icons.mjs
- tailwind.config.ts
- src/lib/native/haptics.ts
- src/lib/native/platform.ts
- Splash screen image (2732x2732): white background with centered blue Helix logo mark (two overlapping angular chevron/arrow shapes forming an H-like glyph)
- Helix splash screen (2732x2732): white background with centered blue Helix logomark — two overlapping diagonal bars forming a stylized 'H'/crossing-strands shape in light-to-medium blue gradient
- Helix splash screen (light mode): dark rounded-square background with a silver DNA double helix on the left and a glowing orange DNA double helix on the right
- Splash Screen (Dark Mode, @3x)
- HelixWatch App Icon (1024px): two intertwined double-helix ribbons on dark rounded-square background, one brushed silver/chrome and one glowing molten orange, forming an H-shaped mark for the Helix brand
- Apple Touch Icon (Helix DNA Logo)
- favicon-32.png (32x32 site favicon: stylized bold 'X' crossing mark in orange and dark charcoal/black, diagonal crossed-bar design)
- PWA icon (192x192): two intertwined DNA-helix-like ribbons forming an 'H' silhouette on a dark rounded-square background, left ribbon rendered in brushed silver/chrome, right ribbon rendered in glowing orange/fire, evoking the 'Helix' app name
- icon-512.png (PWA app icon — dual DNA double-helix, silver and orange strands forming an H shape on dark rounded-square background)
- getDb
- HELIX Data Pipeline (Apple Health → Ingest → Supabase → PWA/Notion)
- Helix app master icon (dual DNA helix, silver + molten orange, dark rounded-square background)
- DANGER
- supabase
- palette-tokens.test.ts
- CLAUDE.md
- sync-pr-truth.mjs
- palette-discipline.test.ts
- @dnd-kit/utilities
- program-layout.test.ts
- @testing-library/jest-dom
- next
- HelixViz.tsx
- jsdom
- useReports.ts
- framer-motion
- @types/react

## God Nodes (most connected - your core abstractions)
1. `logicalTodayISO()` - 101 edges
2. `supabase` - 58 edges
3. `activeProgram()` - 48 edges
4. `eraForDate()` - 47 edges
5. `displayWeight()` - 46 edges
6. `useScheduleVersion()` - 42 edges
7. `DashboardPage()` - 36 edges
8. `scheduleDayFor()` - 31 edges
9. `weekStartOf()` - 31 edges
10. `HelixSnapshot` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Native iOS App (Capacitor HealthKit Bridge)` --semantically_similar_to--> `Capacitor Shell`  [INFERRED] [semantically similar]
  README.md → docs/native-ios.md
- `getAll()` --indirect_call--> `s()`  [INFERRED]
  public/sw.js → src/tests/set-format.test.ts
- `/api/ingest endpoint` --semantically_similar_to--> `/api/ingest endpoint`  [INFERRED] [semantically similar]
  docs/ios-deploy-guide.md → README.md
- `/api/ingest endpoint` --semantically_similar_to--> `/api/ingest endpoint`  [INFERRED] [semantically similar]
  docs/native-ios.md → README.md
- `Supabase (Postgres, Auth, RLS)` --semantically_similar_to--> `Supabase JWT auth`  [INFERRED] [semantically similar]
  README.md → docs/ios-deploy-guide.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **HELIX Data Ingest Pipeline** — readme_healthkit_bridge, readme_api_ingest, readme_supabase, readme_nextjs_pwa, readme_notion_mirror [EXTRACTED 1.00]
- **Native Bridge Implementation Files** — docs_native_ios_healthkit_ts, docs_native_ios_sync_ts, docs_native_ios_platform_ts, docs_native_ios_haptics_ts [EXTRACTED 1.00]
- **Smart Background Sync System** — docs_native_ios_initnativesync, docs_native_ios_background_sync, docs_native_ios_bgtaskscheduler, docs_native_ios_backgroundsync_func [INFERRED 0.85]

## Communities (168 total, 48 thin omitted)

### Community 0 - "HealthkitPlugin"
Cohesion: 0.06
Nodes (33): Calendar, Capacitor, CAPBridgedPlugin, CAPBridgeViewController, CAPPlugin, HealthKit, HKQuantityType, HKUnit (+25 more)

### Community 1 - "useScheduleVersion"
Cohesion: 0.23
Nodes (13): ProgressionAlerts(), scopeToDay(), ScheduleShortcut(), useDayVault(), useScheduleVersion(), planPrefsVersion(), programDayFor(), scheduleDayFor() (+5 more)

### Community 2 - "supabase/types.ts"
Cohesion: 0.17
Nodes (22): GET(), pendingDates(), POST(), resolveCreds(), GET(), POST(), GET(), denyIfUnauthorized() (+14 more)

### Community 3 - "reportSchema.ts"
Cohesion: 0.11
Nodes (27): PastePanel(), COACH_SPLIT_TO_DAY_KEY, CoachExerciseSchema, CoachExerciseStatus, CoachReport, CoachReportSchema, coachReportToDraft(), CoachSplit (+19 more)

### Community 5 - "ContentView.swift"
Cohesion: 0.07
Nodes (45): App, Combine, Content, ContentView, .body, Helix, MacrosScreen, .body (+37 more)

### Community 6 - "palette.ts"
Cohesion: 0.13
Nodes (13): DAY_COLOR, SERIES, SPLIT, splitColor(), ActiveWorkoutSession, Exercise, NUTRITION_PRESETS, NutritionPreset (+5 more)

### Community 7 - "sw.js"
Cohesion: 0.08
Nodes (10): createHandlerBoundToUrl(), getAll(), getEndEntryFromIndex(), getFirstEntryByQueueName(), getLastEntryByQueueName(), getPrecacheKeyForUrl(), matchPrecache(), popRequest() (+2 more)

### Community 8 - "Next.js PWA Dashboard (Netlify)"
Cohesion: 0.06
Nodes (38): /api/ingest endpoint, Bundle Identifier (app.helix.health.*), Capacitor, capacitor.config.ts, @perfood/capacitor-healthkit plugin, CocoaPods, iOS Deploy Guide (docs/ios-deploy-guide.md), src/lib/native/healthkit.ts (+30 more)

### Community 9 - "ReadinessOrb.tsx"
Cohesion: 0.14
Nodes (11): prefetchSheetBodies(), BioStrip, BioStripProps, programStreak(), ReadinessOrb, SCORE_COMPONENTS, ScoreCard, ScoreCardProps (+3 more)

### Community 10 - "CardioLogger.tsx"
Cohesion: 0.08
Nodes (43): RpeLadder(), SetEditorRow, WEIGHT_STEPS, CardioLogger(), KINDS, EffortScale(), axesHeldBy(), axisValue() (+35 more)

### Community 11 - "MuscleAnalyticsPanel.tsx"
Cohesion: 0.12
Nodes (12): RpeCalendar(), BodyHeatmap, MuscleAnalyticsPanel(), MuscleAnalyticsSection, PRHistoryChart, RpeCalendar, StrengthTrends, VolumeChart (+4 more)

### Community 12 - "ceilings.ts"
Cohesion: 0.17
Nodes (24): ProgressionAlert, useProgressionQueue(), ExerciseTrend, setsAtCeilingOf(), useSessionTrends(), clearedCeiling(), holdTargetFor(), LadderState (+16 more)

### Community 13 - "Sheet.tsx"
Cohesion: 0.31
Nodes (10): acquireOverlay(), Portal(), releaseOverlay(), useOverlayBodyLock(), Sheet(), SheetProps, nearestSnap(), project() (+2 more)

### Community 14 - "landmarks.ts"
Cohesion: 0.27
Nodes (12): bandZone(), half(), Landmark, LANDMARK_MUSCLES, landmarkFor(), MuscleTonnage, Program, PROGRAM_TARGETS (+4 more)

### Community 15 - "app/layout.tsx"
Cohesion: 0.14
Nodes (12): metadata, viewport, Sidebar(), CrashRecorder(), isJsonSafe(), isSmallEnough(), QueryProvider(), ReloadHome() (+4 more)

### Community 16 - "[date]/page.tsx"
Cohesion: 0.07
Nodes (34): DailyNexusPage(), DaySheet, scoreColor(), SessionBlock(), sessionLabel(), formatDate(), GoalsRow, MacroProgressChart() (+26 more)

### Community 17 - "useWeeklyVolume.ts"
Cohesion: 0.23
Nodes (11): WeekToDateTargets(), DICT, lookupMuscles(), MuscleEntry, resolveMovers(), tokenize(), useWeeklyVolume(), WeeklyVolume (+3 more)

### Community 19 - "compilerOptions"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 20 - "workout/page.tsx"
Cohesion: 0.24
Nodes (12): MuscleAnalyticsPanel, WorkoutPage(), WeeklySummaryCard(), RoutineMemoryEntry, routineMemoryMap(), useExerciseMap(), useLatestSessionFlag(), useRoutineMemory() (+4 more)

### Community 21 - "draft.ts"
Cohesion: 0.15
Nodes (23): CommitBar(), SessRow, SetRow, useSessionDraft(), verifyCommitted(), applyRpeMemory(), buildCommitPayload(), cardioSummary() (+15 more)

### Community 22 - "prEngine.ts"
Cohesion: 0.11
Nodes (34): CalorieEstimate, estimateAvgBpm(), estimateCalories(), KcalSample, medianKcalPerMin(), metKcalPerMin(), DB, nextDayISO() (+26 more)

### Community 23 - "useInsights.ts"
Cohesion: 0.06
Nodes (67): CoachHeaderCard(), StatPatch, DatePickerPopover(), iso(), WD, InsightCoach(), TONE, Surface() (+59 more)

### Community 24 - "FmtV2Report.tsx"
Cohesion: 0.06
Nodes (52): anchorsOf(), asymmetryOf(), BodyCompTrajectory(), FmtV2Report(), proseLines(), SectionView(), HeroCard(), leadOf() (+44 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.16
Nodes (14): ActiveGoals, applyPrefsToDevice(), CONTEXT_LABELS, ContextMode, DEFAULTS, Goals, MODE_TO_PHASE, PLAN_PHASE_CASCADE_KEYS (+6 more)

### Community 26 - "session/page.tsx"
Cohesion: 0.07
Nodes (37): ALL_DAY_KEYS, DAY_KEYS, DRY, env, supabase, SessionPageInner(), ExerciseHistory, HistorySet (+29 more)

### Community 27 - "programs.ts"
Cohesion: 0.12
Nodes (16): APEX51, DAY_SPLIT, forPhase(), HELIX4, LEGACY_PLAN_ID, planListeners, PPL_LEGACY, PPL_LEGS (+8 more)

### Community 28 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 29 - "handle"
Cohesion: 0.20
Nodes (21): cacheMatch(), cachePut(), _ensureResponseSafeToCache(), fetch(), fetchAndCachePut(), findMatchingRoute(), getCacheKey(), _getNetworkPromise() (+13 more)

### Community 30 - "parse.ts"
Cohesion: 0.14
Nodes (22): Entry, explodeLine(), guessSplit(), HevyCardio, HevyExercise, HevySet, HevyStats, HevyWorkout (+14 more)

### Community 31 - "displayWeight"
Cohesion: 0.26
Nodes (11): MuscleAnalyticsSection(), CompletedHero(), Session, TrainingCard(), SessionIntelCard(), trend(), fmtVolume(), displayWeight() (+3 more)

### Community 32 - "nutrition/page.tsx"
Cohesion: 0.10
Nodes (30): MacroProgressChart, NutritionPage(), EraFilterPills(), ExceptionDayBanner(), FuelForceBand, Goals, MACRO_COLOR, NutritionLogList() (+22 more)

### Community 33 - "app/page.tsx"
Cohesion: 0.08
Nodes (42): avg(), BODY_TILES, DashboardPage(), n0(), n1(), ScoreCard, SHEET_ACCENT, SheetKey (+34 more)

### Community 34 - "RecoveryTrackers.tsx"
Cohesion: 0.15
Nodes (24): DomsTracker(), OFFSET_LABEL, sorenessSummary, SEVERITY_COLOR, SEVERITY_WORD, GROUP_LABEL, GROUP_MUSCLES, groupOf() (+16 more)

### Community 35 - "recompute-scores.mjs"
Cohesion: 0.17
Nodes (8): appUrl, argv, DRY, env, explicitDates, SHORT_ONLY, supabase, today

### Community 36 - "resolveExercises.ts"
Cohesion: 0.43
Nodes (6): muscleGroupsFor(), COMPOUND_PATTERNS, DB, isCompoundLift(), resolveExercises(), InsertRow

### Community 37 - "View"
Cohesion: 0.11
Nodes (35): BatteryRing, .body, .color, .body, BigValue, .body, Caption, .body (+27 more)

### Community 38 - "FileSystemBrowser.tsx"
Cohesion: 0.35
Nodes (7): cap(), FileSystemBrowser(), JourneyTimeline, ReportRow, enumerateWeeks(), ProgramWeek, blurOnTap()

### Community 39 - "pr-truth.test.ts"
Cohesion: 0.20
Nodes (11): excess(), LoggedBest, PR_LOGGED, PR_TRUTH, prFloorFor(), truthAxisValue(), truthFloor(), TruthRecord (+3 more)

### Community 40 - "activeProgram"
Cohesion: 0.27
Nodes (17): MoveDaySheet(), WD_LONG, WD_SHORT, WeekScheduler(), currentDateForDay(), isLayoutCustomised(), LayoutRow, previewPermanentMove() (+9 more)

### Community 41 - "dailyLog.ts"
Cohesion: 0.14
Nodes (19): BODY_MASS_KEYS, DB, FieldError, hasManualWater(), ingestDailyLog(), IngestResult, isMissingColumnError(), KNOWN_KEYS (+11 more)

### Community 43 - "useScheduleOverrides.ts"
Cohesion: 0.12
Nodes (31): RestTodayButton(), SwapDayControl(), SwapNote, useRestSwap(), applyWrites(), OverrideRow, PRE_SLOT, SEED_PRE_KEYS (+23 more)

### Community 44 - "HelixSnapshot"
Cohesion: 0.14
Nodes (23): Codable, Error, Foundation, HelixSnapshot, .caloriesRemaining, HelixSnapshotClient, .isConfigured, HelixSnapshotError (+15 more)

### Community 45 - "useHelixReducedMotion"
Cohesion: 0.20
Nodes (10): MotionProvider(), readReducedMotion(), subscribeToBoth(), subscribeToTransparency(), useHelixReducedMotion(), useReducedTransparency(), Listener, listeners (+2 more)

### Community 46 - "ExerciseCard.tsx"
Cohesion: 0.08
Nodes (32): ExerciseCard, ReadyCue, SetGroup, STATUS_META, DRAG_MODIFIERS, ExerciseDeckList(), SessionDeck(), SessionNotesCard() (+24 more)

### Community 47 - "Breaking the watchOS install loop"
Cohesion: 0.13
Nodes (14): And: your Embed phase already exists and is correct, Breaking the watchOS install loop, ⚠️ Check this before anything else: `buildActionMask`, Quick reference, Read this first: "Code Sign On Copy" is *supposed* to be greyed out, Step 0 — Confirm what you're actually looking at (30 seconds), Step 1 — Developer Mode on **both** devices, Step 2 — Trust the developer certificate on the Watch (+6 more)

### Community 48 - "Zone.tsx"
Cohesion: 0.06
Nodes (40): ExerciseDetailPage(), ExerciseHistoryBody, groupColor(), ExerciseLibraryPage(), groupColor(), daysAgoISO(), Series, TrendStrip() (+32 more)

### Community 49 - "ContinuumTimeline.tsx"
Cohesion: 0.16
Nodes (8): ContinuumTimeline, DayCard, ROW_MACRO_TARGET, WeekHeader, WeekChipLabel(), WeekPhase, programDayLabel(), programForDate()

### Community 50 - "devDependencies"
Cohesion: 0.05
Nodes (39): @capacitor/cli, eslint, eslint-config-next, @eslint/eslintrc, @netlify/plugin-nextjs, @next/bundle-analyzer, devDependencies, @capacitor/cli (+31 more)

### Community 51 - "StepsChart.tsx"
Cohesion: 0.36
Nodes (6): ChartTooltip(), TooltipProps, bandFor(), formatDate(), StepsChart(), StepsPoint

### Community 52 - "usePlanPhaseGoals.ts"
Cohesion: 0.24
Nodes (10): EMPTY, EXTRA_COLS, PlanPhaseData, planPhaseKey(), PlanPhaseOverride, Row, rowToOverride(), usePlanPhaseGoals() (+2 more)

### Community 53 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, analyze, build, check, dev, e2e, e2e:ui, icons (+6 more)

### Community 54 - "useMuscleAnalytics.ts"
Cohesion: 0.28
Nodes (9): aggregateMuscleSets(), effectiveVolumes(), MUSCLE_GROUPS, MUSCLE_MAP, MuscleAggregate, MuscleSetRow, MuscleStat, weekStartUTC() (+1 more)

### Community 55 - "ExerciseBreakdown.tsx"
Cohesion: 0.12
Nodes (22): AXIS_ORDER, fmtAxis(), fmtDelta(), fmtLoad(), PrRecordSheet(), deltaGlyph(), ExerciseBreakdown(), ExerciseHistorySheet (+14 more)

### Community 56 - "constructor"
Cohesion: 0.25
Nodes (9): _addSyncListener(), addToPrecacheList(), constructor(), getIntegrityForPrecacheKey(), getUrlsToPrecacheKeys(), _match(), registerCapture(), registerRoute() (+1 more)

### Community 57 - "HelixWidgets.swift"
Cohesion: 0.16
Nodes (23): BatteryAccessoryView, .body, BatteryView, .s, Helix, HelixBatteryAccessoryWidget, .body, HelixBatteryWidget (+15 more)

### Community 58 - "split-exercise-by-day.mjs"
Cohesion: 0.25
Nodes (7): args, buckets, db, DRY, env, MAP, unmapped

### Community 59 - "manifest.json"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 60 - "delete"
Cohesion: 0.20
Nodes (10): delete(), deleteCacheAndMetadata(), deleteEntry(), h(), handleActivate(), l(), popEntry(), _removeEntry() (+2 more)

### Community 61 - "dependencies"
Cohesion: 0.06
Nodes (35): @capacitor/core, @dnd-kit/core, @dnd-kit/modifiers, @dnd-kit/sortable, next-themes, dependencies, @capacitor/core, @dnd-kit/core (+27 more)

### Community 62 - "route-client-boundary.test.ts"
Cohesion: 0.31
Nodes (7): clientReach(), EXTS, isClientModule(), resolveImport(), ROUTES, runtimeImports(), SRC

### Community 63 - "clone"
Cohesion: 0.38
Nodes (7): _addRequest(), clone(), fromRequest(), pushRequest(), replayRequests(), toObject(), unshiftRequest()

### Community 65 - "healthkit.ts"
Cohesion: 0.14
Nodes (23): EXTRA_READ_TYPES, fetchSleep(), HealthKit, HealthSample, inBatches(), localDayISO(), mergedMinutes(), METRIC_MAP (+15 more)

### Community 67 - "_awaitComplete"
Cohesion: 0.40
Nodes (6): _awaitComplete(), destroy(), doneWaiting(), _getResponse(), handleAll(), runCallbacks()

### Community 68 - "InBody.tsx"
Cohesion: 0.12
Nodes (25): DERIVED, InBodyForm(), InBodyHeadline(), INPUTS, VERDICT_COLOR, WHR_COLOR, BodyCompDerived, BodyCompInput (+17 more)

### Community 70 - "useDayVault.ts"
Cohesion: 0.21
Nodes (13): PostWorkoutSummary(), toReportRow(), SessionProgressionCard(), FileItem, SessionHero(), addDayISO(), BODY_MIRROR, DayVaultData (+5 more)

### Community 71 - "Smart Background Sync"
Cohesion: 0.40
Nodes (4): Smart Background Sync, BGTaskScheduler / BGAppRefreshTask, initNativeSync(), src/lib/native/sync.ts

### Community 72 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 73 - "backfill-prs.mjs"
Cohesion: 0.11
Nodes (15): asserted, bySession, db, deferred, DRY, env, jiti, keep (+7 more)

### Community 74 - "compute-score/route.ts"
Cohesion: 0.43
Nodes (7): ComputedScoreRow, computeForDate(), DB, nextDay(), POST(), todayISO(), prescribedFor()

### Community 75 - "MuscleFocus.tsx"
Cohesion: 0.33
Nodes (6): MuscleFocus(), round1(), SessionDetail, MUSCLE, LandmarkMuscle, MUSCLE_COLOR

### Community 76 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 77 - "BrandHeader.tsx"
Cohesion: 0.23
Nodes (11): BrandHeader(), greetingFor(), LiveTime, PLAN_CHIP_COLOR, useClock(), useLastUpdated(), msUntilLocalMidnight(), useLogicalDate() (+3 more)

### Community 80 - "next.config.ts"
Cohesion: 0.50
Nodes (3): nextConfig, withAnalyzer, withSerwist

### Community 83 - "PathfinderTimeline.tsx"
Cohesion: 0.12
Nodes (28): isWeekComplete(), isWeekReady(), MarkdownView, NO_DAYS, PathfinderTimeline(), WeekActions(), WeekCapsule, WeekRecoveryStrip() (+20 more)

### Community 84 - "reseed-muscle-groups.mts"
Cohesion: 0.40
Nodes (4): DRY, env, rows, sb

### Community 86 - "prefsSync.ts"
Cohesion: 0.23
Nodes (13): NativeBoot(), getTrackRpe(), setTrackRpeMirror(), subscribe(), useTrackRpe(), documentReady(), initNativeSync(), bumpPlan() (+5 more)

### Community 87 - "BodyCompositionChart.tsx"
Cohesion: 0.15
Nodes (22): BodyCompositionChart(), BodyCompositionPoint, COLORS, Family, FAMILY_META, FAMILY_SERIES, fmtDate(), mergeBodyComposition() (+14 more)

### Community 90 - "overrides.ts"
Cohesion: 0.38
Nodes (9): emit(), getScheduleOverride(), hydrateScheduleOverrides(), listeners, load(), OverrideValue, persist(), setScheduleOverrideLocal() (+1 more)

### Community 91 - "nightWindow"
Cohesion: 0.31
Nodes (5): fallbackBedTime(), nightWindow, prevDayISO(), from(), noopChain()

### Community 92 - "program.test.ts"
Cohesion: 0.19
Nodes (14): ChartSplit, DAY_KEY_SPLIT, formatDate(), resolveChartSplit(), splitColor(), splitLabel(), SPLITS_FOR_ERA, VolumeChart() (+6 more)

### Community 93 - "phases.ts"
Cohesion: 0.16
Nodes (23): PrintState, ReportDoc, ReportPage(), usePrintToPdf(), useReportDoc(), SessionAnalysisPage(), ActivePlanBadge(), PHASE_WORD (+15 more)

### Community 95 - "logicalTodayISO"
Cohesion: 0.15
Nodes (21): startOfWeekISO(), StatRowProps, todayISO(), useWeekStats(), WeeklyReviewCard(), WeekStats, ContinuumDay, isoAddDays() (+13 more)

### Community 96 - "useWeeklyLoop.ts"
Cohesion: 0.07
Nodes (54): axesBySession(), AXIS_ORDER, dedupePrs(), RangeData, RawSession, RawSet, supplementStack(), toBodyComp() (+46 more)

### Community 103 - "AuthGate.tsx"
Cohesion: 0.27
Nodes (6): HAS_AUTO, NOTE: the password ships in the client bundle (NEXT_PUBLIC_*), so it is readable, HelixMark(), AuthGate(), AuthState, hasPersistedSession()

### Community 104 - "useCharts.ts"
Cohesion: 0.13
Nodes (24): ChartRange(), StrengthTrends(), BodyCompositionChart, BodyProgressPanel(), StepsChart, EraFilter, BodyDetailRow, collapseToSessionBest() (+16 more)

### Community 107 - "tapLight"
Cohesion: 0.26
Nodes (7): BottomNav(), NavCell(), Phase, PullToRefresh(), tapLight(), forceHealthKitSync(), coreNavItems

### Community 108 - "eraForDate"
Cohesion: 0.19
Nodes (15): fmtMetric(), metricBadge(), ProgressionTrail(), shortDate(), VolumeCurve(), ExerciseDelta, IntelMetric, SessionIntel (+7 more)

### Community 110 - "merge-exercise.mjs"
Cohesion: 0.29
Nodes (6): args, db, DRY, env, from, to

### Community 113 - "HelixEntry"
Cohesion: 0.16
Nodes (12): Context, FuelView, .s, HelixEntry, .isEmpty, .isStale, Bool, Date (+4 more)

### Community 114 - "client.ts"
Cohesion: 0.16
Nodes (9): RestSuggestion(), isUnderRecovered(), readinessReason(), useTodayReadiness(), initSupabase(), isNative(), nativeStorage, SupabaseClient (+1 more)

### Community 115 - "SummaryBands.tsx"
Cohesion: 0.08
Nodes (31): clock(), NightlyHistogram(), SleepArc(), SleepStages(), STAGES, PIPS, StepsJourney(), BodyBand() (+23 more)

### Community 120 - "RealtimeProvider.tsx"
Cohesion: 0.20
Nodes (9): RealtimeProvider(), TABLE_KEYS, TABLES, useScheduleOverrides(), HEALTH_QUERY_KEYS, WORKOUT_QUERY_KEYS, declaredList(), REGISTERED (+1 more)

### Community 121 - "Status"
Cohesion: 0.33
Nodes (6): Equatable, Status, notConfigured, ok, unauthorized, unreachable

### Community 123 - "BodyMap.tsx"
Cohesion: 0.12
Nodes (17): BARS, BodyMap(), CONTOURS, num(), Pt, NOTE: a smart scale reports WHOLE-BODY composition, not per-limb — the, RIGHT, SILHOUETTE (+9 more)

### Community 124 - "pathfinder/page.tsx"
Cohesion: 0.23
Nodes (10): addDays(), BodyProgressPanel, iso(), PathfinderInner(), VitalsGroups, WEEKDAYS, MonthActivity, monthActivitySets() (+2 more)

### Community 127 - "snapshot/route.ts"
Cohesion: 0.27
Nodes (9): bearer(), GET(), soft(), isRestDayFor(), logicalTodayInTZ(), weekStartDayFromEndDay(), caloriesRemaining(), WidgetSnapshot (+1 more)

### Community 128 - "ingest/schema.ts"
Cohesion: 0.24
Nodes (9): POST(), resolveCallerUserId(), energyField(), flex(), floatField(), IngestPayload, IngestPayloadSchema, intField() (+1 more)

### Community 130 - "cachedResponseWillBeUsed"
Cohesion: 0.38
Nodes (7): cacheDidUpdate(), cachedResponseWillBeUsed(), expireEntries(), _getCacheExpiration(), _getDateHeaderTimestamp(), _isResponseDateFresh(), updateTimestamp()

### Community 131 - "SupplementChecklist.tsx"
Cohesion: 0.08
Nodes (47): c(), k(), DRY, env, rows, sb, seen, MicrosPage() (+39 more)

### Community 135 - "generate-icons.mjs"
Cohesion: 0.40
Nodes (5): main(), render(), SOURCE, TARGETS, WIDGET_CONTENTS

### Community 157 - "getDb"
Cohesion: 0.18
Nodes (13): addEntry(), b(), get(), getAllEntriesByQueueName(), getDb(), getEntryCountByQueueName(), getFirstEntryId(), _getId() (+5 more)

### Community 166 - "supabase"
Cohesion: 0.13
Nodes (27): STEPS, WaterOverrideSheet(), NotionSync(), Result, CASCADE_KEYS, useMacroOverride(), DayNutritionContext, restampPhase() (+19 more)

### Community 171 - "sync-pr-truth.mjs"
Cohesion: 0.17
Nodes (11): AXES, beaten, current, db, DRY, env, jiti, post (+3 more)

### Community 172 - "palette-discipline.test.ts"
Cohesion: 0.43
Nodes (6): ALLOWED_ORPHANS, PALETTE_SRC, PALETTE_VALUES, scan(), sourceFiles(), stripComments()

### Community 186 - "program-layout.test.ts"
Cohesion: 0.22
Nodes (18): canonicalLayout(), dayKeyForWeekday(), DayLayout, effectiveWeekday(), fullLayout(), isAuthoredLayout(), moveDay(), parseLayout() (+10 more)

### Community 191 - "HelixViz.tsx"
Cohesion: 0.15
Nodes (17): alpha(), BodyHeatmap(), REGIONS, VolumeStream(), buildIntensityCalendar(), CalendarCell, CalendarModel, CalendarStats (+9 more)

### Community 195 - "useReports.ts"
Cohesion: 0.26
Nodes (9): fmt(), ReportsPage(), EMPTY_PAYLOAD, num(), numOrNull(), repairReportPayload(), ReportDbRow, useReports() (+1 more)

## Knowledge Gaps
- **634 isolated node(s):** `pycharm`, `config`, `$schema`, `style`, `rsc` (+629 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `View` connect `View` to `HelixWidgets.swift`, `pathfinder/page.tsx`, `ContentView.swift`, `HelixEntry`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `logicalTodayISO()` connect `logicalTodayISO` to `useScheduleVersion`, `supabase/types.ts`, `SupplementChecklist.tsx`, `reportSchema.ts`, `ReadinessOrb.tsx`, `MuscleAnalyticsPanel.tsx`, `ceilings.ts`, `[date]/page.tsx`, `useWeeklyVolume.ts`, `workout/page.tsx`, `draft.ts`, `useInsights.ts`, `settings/page.tsx`, `session/page.tsx`, `nutrition/page.tsx`, `app/page.tsx`, `RecoveryTrackers.tsx`, `supabase`, `activeProgram`, `useScheduleOverrides.ts`, `useMuscleAnalytics.ts`, `HelixViz.tsx`, `healthkit.ts`, `useDayVault.ts`, `compute-score/route.ts`, `BrandHeader.tsx`, `PathfinderTimeline.tsx`, `phases.ts`, `useWeeklyLoop.ts`, `useCharts.ts`, `SummaryBands.tsx`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `supabase` connect `supabase` to `SupplementChecklist.tsx`, `CardioLogger.tsx`, `ceilings.ts`, `useWeeklyVolume.ts`, `workout/page.tsx`, `draft.ts`, `useInsights.ts`, `settings/page.tsx`, `session/page.tsx`, `displayWeight`, `nutrition/page.tsx`, `app/page.tsx`, `RecoveryTrackers.tsx`, `activeProgram`, `useScheduleOverrides.ts`, `ExerciseCard.tsx`, `Zone.tsx`, `usePlanPhaseGoals.ts`, `useMuscleAnalytics.ts`, `ExerciseBreakdown.tsx`, `healthkit.ts`, `useReports.ts`, `InBody.tsx`, `useDayVault.ts`, `BrandHeader.tsx`, `PathfinderTimeline.tsx`, `prefsSync.ts`, `phases.ts`, `logicalTodayISO`, `useWeeklyLoop.ts`, `AuthGate.tsx`, `useCharts.ts`, `eraForDate`, `client.ts`, `SummaryBands.tsx`, `RealtimeProvider.tsx`, `pathfinder/page.tsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `displayWeight()` (e.g. with `WorkoutPage()` and `BodyCompositionChart()`) actually correct?**
  _`displayWeight()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pycharm`, `config`, `$schema` to the rest of the system?**
  _634 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HealthkitPlugin` be split into smaller, more focused modules?**
  _Cohesion score 0.05519480519480519 - nodes in this community are weakly interconnected._
- **Should `reportSchema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11051693404634581 - nodes in this community are weakly interconnected._