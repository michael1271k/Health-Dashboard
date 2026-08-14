# Graph Report - Helix  (2026-08-14)

## Corpus Check
- 402 files · ~700,805 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2558 nodes · 6663 edges · 160 communities (113 shown, 47 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b33f74c2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HealthkitPlugin
- session/[id]/page.tsx
- ceilings.ts
- VolumeChart.tsx
- supabase
- ContentView.swift
- CardioLogger.tsx
- sw.js
- Next.js PWA Dashboard (Netlify)
- useWeeklyLoop.ts
- ExerciseCard.tsx
- program.test.ts
- PathfinderTimeline.tsx
- useScheduleVersion
- useDashboard.ts
- app/layout.tsx
- [date]/page.tsx
- useToday.ts
- lucide-react
- compilerOptions
- exercises/page.tsx
- reportSchema.ts
- prEngine.ts
- useTimelineWeeks.ts
- FmtV2Report.tsx
- draft.ts
- InBody.tsx
- weekStartOf
- components.json
- handle
- parse.ts
- SessionDeck.tsx
- VitalsGroups.tsx
- app/page.tsx
- RecoveryTrackers.tsx
- recompute-scores.mjs
- eraFilter.tsx
- View
- cardioPrs.ts
- weeklyExport.ts
- PrAxis
- dailyLog.ts
- @capacitor/preferences
- programs.ts
- HelixSnapshot
- routineTemplate.ts
- pr-truth.test.ts
- Breaking the watchOS install loop
- FileSystemBrowser.tsx
- palette.ts
- devDependencies
- sync.ts
- templateDraft.ts
- scripts
- BrandHeader.tsx
- logicalTodayISO
- constructor
- HelixWidgets.swift
- useWaterOverride.ts
- manifest.json
- toDraft.ts
- dependencies
- intensityCalendar.ts
- clone
- RealtimeProvider.tsx
- save.ts
- recharts
- _awaitComplete
- formatSet
- @supabase/supabase-js
- TrendStrip.tsx
- Smart Background Sync
- eslint.config.mjs
- backfill-prs.mjs
- @tanstack/react-query-persist-client
- NutritionLogList.tsx
- package.json
- prefsSync.ts
- responsive.spec.ts
- keep-alive.mts
- next.config.ts
- global-error.tsx
- sw.ts
- HelixViz.tsx
- eraForDate
- capacitor.config.ts
- Zone.tsx
- BodyCompositionChart.tsx
- muscleMap.ts
- useMuscleAnalytics.ts
- framer-motion
- phases.ts
- Free Apple ID / Personal Team signing
- settings/page.tsx
- Helix app icon concept: two intertwined DNA-style double helices (silver + glowing orange) forming an 'H' monogram
- Helix app brand logo mark (blue crossing/interlocking chevron symbol)
- Helix Double-Helix Logo Mark (silver + orange strands)
- Helix brand concept: app name and visual identity built on DNA double-helix motif, rendered as stylized 'H' letterform (silver + orange strands)
- Helix brand mark: dual double-helix 'H' logo motif (silver + glowing orange strands)
- Helix brand icon motif: twin double-helix strands (silver + orange) symbolizing the app name/theme
- BodyMap.tsx
- useCharts.ts
- .mcp.json
- @types/react
- @testing-library/jest-dom
- s
- cachedResponseWillBeUsed
- merge-exercise.mjs
- @serwist/next
- pathfinder/page.tsx
- healthkit.ts
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
- ReadinessOrb.tsx
- getDb
- HELIX Data Pipeline (Apple Health → Ingest → Supabase → PWA/Notion)
- Helix app master icon (dual DNA helix, silver + molten orange, dark rounded-square background)
- DANGER
- palette-tokens.test.ts
- client.ts
- CLAUDE.md
- sync-pr-truth.mjs
- palette-discipline.test.ts
- ExerciseHistoryBody.tsx
- @dnd-kit/utilities
- StepsChart.tsx
- CoachHeaderCard.tsx
- next
- jsdom
- @capacitor/haptics
- ExerciseBreakdown.tsx
- @capacitor/ios

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
- `/api/ingest endpoint` --semantically_similar_to--> `/api/ingest endpoint`  [INFERRED] [semantically similar]
  docs/ios-deploy-guide.md → README.md
- `/api/ingest endpoint` --semantically_similar_to--> `/api/ingest endpoint`  [INFERRED] [semantically similar]
  docs/native-ios.md → README.md
- `Supabase (Postgres, Auth, RLS)` --semantically_similar_to--> `Supabase JWT auth`  [INFERRED] [semantically similar]
  README.md → docs/ios-deploy-guide.md
- `Netlify (Deployment)` --semantically_similar_to--> `Netlify deploy`  [INFERRED] [semantically similar]
  README.md → docs/native-ios.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **HELIX Data Ingest Pipeline** — readme_healthkit_bridge, readme_api_ingest, readme_supabase, readme_nextjs_pwa, readme_notion_mirror [EXTRACTED 1.00]
- **Native Bridge Implementation Files** — docs_native_ios_healthkit_ts, docs_native_ios_sync_ts, docs_native_ios_platform_ts, docs_native_ios_haptics_ts [EXTRACTED 1.00]
- **Smart Background Sync System** — docs_native_ios_initnativesync, docs_native_ios_background_sync, docs_native_ios_bgtaskscheduler, docs_native_ios_backgroundsync_func [INFERRED 0.85]

## Communities (160 total, 47 thin omitted)

### Community 0 - "HealthkitPlugin"
Cohesion: 0.06
Nodes (33): Calendar, Capacitor, CAPBridgedPlugin, CAPBridgeViewController, CAPPlugin, HealthKit, HKQuantityType, HKUnit (+25 more)

### Community 1 - "session/[id]/page.tsx"
Cohesion: 0.20
Nodes (13): SessionAnalysisPage(), SessionProgressionCard(), AppBar(), MEASURE, PAD, SessionHero(), addDayISO(), useDeleteSession() (+5 more)

### Community 2 - "ceilings.ts"
Cohesion: 0.19
Nodes (22): ProgressionAlert, ExerciseTrend, setsAtCeilingOf(), useSessionTrends(), clearedCeiling(), holdTargetFor(), LadderState, ladderVerdict (+14 more)

### Community 3 - "VolumeChart.tsx"
Cohesion: 0.20
Nodes (13): ChartSplit, DAY_KEY_SPLIT, formatDate(), resolveChartSplit(), splitColor(), splitLabel(), SPLITS_FOR_ERA, VolumeChart() (+5 more)

### Community 4 - "supabase"
Cohesion: 0.18
Nodes (17): Field, FIELDS, MacroOverrideSheet(), Result, useEnsureTodayScore(), CASCADE_KEYS, MacroValues, useMacroOverride() (+9 more)

### Community 5 - "ContentView.swift"
Cohesion: 0.07
Nodes (45): App, Combine, Content, ContentView, .body, Helix, MacrosScreen, .body (+37 more)

### Community 6 - "CardioLogger.tsx"
Cohesion: 0.22
Nodes (16): CardioLogger(), KINDS, EffortScale(), axesHeldBy(), CardioLog, EXTRA_COLS, NewCardio, useAddCardio() (+8 more)

### Community 7 - "sw.js"
Cohesion: 0.08
Nodes (13): createHandlerBoundToUrl(), deleteEntry(), getEndEntryFromIndex(), getFirstEntryByQueueName(), getLastEntryByQueueName(), getPrecacheKeyForUrl(), matchPrecache(), popEntry() (+5 more)

### Community 8 - "Next.js PWA Dashboard (Netlify)"
Cohesion: 0.06
Nodes (38): /api/ingest endpoint, Bundle Identifier (app.helix.health.*), Capacitor, capacitor.config.ts, @perfood/capacitor-healthkit plugin, CocoaPods, iOS Deploy Guide (docs/ios-deploy-guide.md), src/lib/native/healthkit.ts (+30 more)

### Community 9 - "useWeeklyLoop.ts"
Cohesion: 0.13
Nodes (21): axesBySession(), AXIS_ORDER, dedupePrs(), RangeData, RawSession, RawSet, supplementStack(), toBodyComp() (+13 more)

### Community 10 - "ExerciseCard.tsx"
Cohesion: 0.07
Nodes (23): ExerciseCard, ReadyCue, SetGroup, STATUS_META, DRAG_MODIFIERS, ExerciseDeckList(), SetEditorRow, WEIGHT_STEPS (+15 more)

### Community 11 - "program.test.ts"
Cohesion: 0.06
Nodes (66): InsightCoach(), TONE, Surface(), calorieAdherence(), computeInsights(), DayPoint, daysSinceLastSession(), fuelVsForce() (+58 more)

### Community 12 - "PathfinderTimeline.tsx"
Cohesion: 0.12
Nodes (16): isWeekComplete(), isWeekReady(), MarkdownView, NO_DAYS, PathfinderTimeline(), WeekCapsule, ContinuumTimeline, DayCard (+8 more)

### Community 13 - "useScheduleVersion"
Cohesion: 0.16
Nodes (15): SessionPageInner(), ActivePlanBadge(), PHASE_WORD, ProgressionAlerts(), scopeToDay(), InBodyHeadline(), useScheduleVersion(), activePhase() (+7 more)

### Community 14 - "useDashboard.ts"
Cohesion: 0.11
Nodes (25): DRY, env, rows, sb, seen, MicrosPage(), todayLocal(), useTodayBundle() (+17 more)

### Community 15 - "app/layout.tsx"
Cohesion: 0.06
Nodes (44): metadata, viewport, CHIPS, EffortChips(), EffortChoice, BottomNav(), NavCell(), Sidebar() (+36 more)

### Community 16 - "[date]/page.tsx"
Cohesion: 0.10
Nodes (26): DailyNexusPage(), DaySheet, scoreColor(), SessionBlock(), sessionLabel(), CompletenessArc, SEGMENT_META, buildHelix() (+18 more)

### Community 17 - "useToday.ts"
Cohesion: 0.27
Nodes (10): RestSuggestion(), EMPTY, TodayBundle, todayBundleKey(), isUnderRecovered(), readinessReason(), TodayReadiness, useTodayReadiness() (+2 more)

### Community 19 - "compilerOptions"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 20 - "exercises/page.tsx"
Cohesion: 0.21
Nodes (13): ExerciseDetailPage(), ExerciseHistoryBody, groupColor(), ExerciseLibraryPage(), groupColor(), CatalogExercise, EMPTY, ExerciseCatalog (+5 more)

### Community 21 - "reportSchema.ts"
Cohesion: 0.20
Nodes (13): PastePanel(), COACH_SPLIT_TO_DAY_KEY, CoachExerciseSchema, CoachExerciseStatus, CoachReport, CoachReportSchema, coachReportToDraft(), CoachSplit (+5 more)

### Community 22 - "prEngine.ts"
Cohesion: 0.17
Nodes (24): absorbSet(), axisValue(), baselineIndex(), BaselineSetRow, beatenBaselines(), buildBaselines(), DetectedSet, detectSessionPrs() (+16 more)

### Community 23 - "useTimelineWeeks.ts"
Cohesion: 0.14
Nodes (23): fmt(), ReportsPage(), EraFilter, EMPTY_PAYLOAD, num(), numOrNull(), repairReportPayload(), ReportDbRow (+15 more)

### Community 24 - "FmtV2Report.tsx"
Cohesion: 0.06
Nodes (53): anchorsOf(), asymmetryOf(), BodyCompTrajectory(), FmtV2Report(), proseLines(), SectionView(), HeroCard(), leadOf() (+45 more)

### Community 25 - "draft.ts"
Cohesion: 0.19
Nodes (18): CommitBar(), SessRow, SetRow, useSessionDraft(), verifyCommitted(), invalidateWorkoutData(), buildCommitPayload(), cardioSummary() (+10 more)

### Community 26 - "InBody.tsx"
Cohesion: 0.12
Nodes (23): DERIVED, InBodyForm(), INPUTS, VERDICT_COLOR, WHR_COLOR, BodyCompDerived, BodyCompInput, deriveBodyComp() (+15 more)

### Community 27 - "weekStartOf"
Cohesion: 0.13
Nodes (23): bearer(), GET(), soft(), PostWorkoutSummary(), toReportRow(), WeekActions(), WeekRecoveryStrip(), useZone2Week() (+15 more)

### Community 28 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 29 - "handle"
Cohesion: 0.19
Nodes (22): c(), cacheMatch(), cachePut(), _ensureResponseSafeToCache(), fetch(), fetchAndCachePut(), findMatchingRoute(), getCacheKey() (+14 more)

### Community 30 - "parse.ts"
Cohesion: 0.14
Nodes (22): Entry, explodeLine(), guessSplit(), HevyCardio, HevyExercise, HevySet, HevyStats, HevyWorkout (+14 more)

### Community 31 - "SessionDeck.tsx"
Cohesion: 0.17
Nodes (19): AXIS_ORDER, fmtAxis(), fmtDelta(), fmtLoad(), PrRecordSheet(), SessionDeck(), SessionNotesCard(), isTimedExercise() (+11 more)

### Community 32 - "VitalsGroups.tsx"
Cohesion: 0.21
Nodes (14): Better, Group, GROUPS, MetricDef, VitalRow(), VitalsGroups(), isoAddDays(), roll() (+6 more)

### Community 33 - "app/page.tsx"
Cohesion: 0.08
Nodes (31): avg(), BODY_TILES, DashboardPage(), n0(), n1(), ScoreCard, SHEET_ACCENT, SheetKey (+23 more)

### Community 34 - "RecoveryTrackers.tsx"
Cohesion: 0.15
Nodes (24): DomsTracker(), OFFSET_LABEL, sorenessSummary, SEVERITY_COLOR, SEVERITY_WORD, GROUP_LABEL, GROUP_MUSCLES, groupOf() (+16 more)

### Community 35 - "recompute-scores.mjs"
Cohesion: 0.17
Nodes (8): appUrl, argv, DRY, env, explicitDates, SHORT_ONLY, supabase, today

### Community 36 - "eraFilter.tsx"
Cohesion: 0.21
Nodes (15): EraFilterPills(), currentAutoPhase(), ERA_FILTER_META, ERA_FILTER_ORDER, EraCtx, EraFilterContext, EraFilterProvider(), isoAddDays() (+7 more)

### Community 37 - "View"
Cohesion: 0.12
Nodes (32): BatteryRing, .body, .color, .body, BigValue, .body, Caption, .body (+24 more)

### Community 38 - "cardioPrs.ts"
Cohesion: 0.22
Nodes (12): axisValue(), CARDIO_AXES, CARDIO_AXIS_LABEL, CardioAxis, CardioRecord, cardioRecords(), CardioRow, isMinAxis() (+4 more)

### Community 39 - "weeklyExport.ts"
Cohesion: 0.14
Nodes (25): buildWeeklyExport(), cardioLabel(), consolidateSupplements(), directionGlyph(), energyBalance, exact(), ExportBodyComp, ExportCardio (+17 more)

### Community 40 - "PrAxis"
Cohesion: 0.23
Nodes (13): canonicalExerciseName(), EXERCISE_ALIASES, CommitResult, SaveSessionResult, PrAxis, ASSERTED, ASSERTED_DATES, INDEX (+5 more)

### Community 41 - "dailyLog.ts"
Cohesion: 0.05
Nodes (69): DRY, env, rows, sb, ComputedScoreRow, computeForDate(), DB, nextDay() (+61 more)

### Community 43 - "programs.ts"
Cohesion: 0.05
Nodes (100): MuscleAnalyticsPanel, WorkoutPage(), WeeklySummaryCard(), RestTodayButton(), SwapDayControl(), SwapNote, useRestSwap(), MoveDaySheet() (+92 more)

### Community 44 - "HelixSnapshot"
Cohesion: 0.11
Nodes (29): Codable, Equatable, Error, Foundation, HelixSnapshot, .caloriesRemaining, HelixSnapshotClient, .isConfigured (+21 more)

### Community 45 - "routineTemplate.ts"
Cohesion: 0.13
Nodes (19): ALL_DAY_KEYS, DAY_KEYS, DRY, env, supabase, routineTemplateKey(), useRoutineTemplate(), useRoutineTemplates() (+11 more)

### Community 46 - "pr-truth.test.ts"
Cohesion: 0.18
Nodes (12): excess(), LoggedBest, PR_LOGGED, PR_TRUTH, PrFloor, prFloorFor(), truthAxisValue(), truthFloor() (+4 more)

### Community 47 - "Breaking the watchOS install loop"
Cohesion: 0.13
Nodes (14): And: your Embed phase already exists and is correct, Breaking the watchOS install loop, ⚠️ Check this before anything else: `buildActionMask`, Quick reference, Read this first: "Code Sign On Copy" is *supposed* to be greyed out, Step 0 — Confirm what you're actually looking at (30 seconds), Step 1 — Developer Mode on **both** devices, Step 2 — Trust the developer certificate on the Watch (+6 more)

### Community 48 - "FileSystemBrowser.tsx"
Cohesion: 0.29
Nodes (9): cap(), FileItem, FileSystemBrowser(), JourneyTimeline, ReportRow, GymReportRow, enumerateWeeks(), isoUTC() (+1 more)

### Community 49 - "palette.ts"
Cohesion: 0.09
Nodes (22): clock(), NightlyHistogram(), SleepArc(), SleepStages(), STAGES, PIPS, StepsJourney(), clock() (+14 more)

### Community 50 - "devDependencies"
Cohesion: 0.05
Nodes (39): @capacitor/cli, eslint, eslint-config-next, @eslint/eslintrc, @netlify/plugin-nextjs, @next/bundle-analyzer, devDependencies, @capacitor/cli (+31 more)

### Community 51 - "sync.ts"
Cohesion: 0.24
Nodes (13): NativeBoot(), localDayISO(), syncHealthKitToServer(), syncYesterdayToServer(), documentReady(), initNativeSync(), OnSynced, runSync() (+5 more)

### Community 52 - "templateDraft.ts"
Cohesion: 0.20
Nodes (12): daySplitEnum(), PROGRAMS, templateToDraft(), SEED_TEMPLATES, SeedCardio, SeedExercise, SeedSet, SeedTemplate (+4 more)

### Community 53 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, analyze, build, check, dev, e2e, e2e:ui, icons (+6 more)

### Community 54 - "BrandHeader.tsx"
Cohesion: 0.23
Nodes (11): BrandHeader(), greetingFor(), LiveTime, PLAN_CHIP_COLOR, useClock(), useLastUpdated(), msUntilLocalMidnight(), useLogicalDate() (+3 more)

### Community 55 - "logicalTodayISO"
Cohesion: 0.12
Nodes (24): MacroProgressChart, NutritionPage(), startOfWeekISO(), StatRowProps, todayISO(), useWeekStats(), WeeklyReviewCard(), WeekStats (+16 more)

### Community 56 - "constructor"
Cohesion: 0.20
Nodes (12): addToPrecacheList(), constructor(), delete(), deleteCacheAndMetadata(), getIntegrityForPrecacheKey(), getUrlsToPrecacheKeys(), h(), handleActivate() (+4 more)

### Community 57 - "HelixWidgets.swift"
Cohesion: 0.09
Nodes (37): Context, BatteryAccessoryView, .body, BatteryView, .s, FuelView, .s, Helix (+29 more)

### Community 58 - "useWaterOverride.ts"
Cohesion: 0.23
Nodes (11): STEPS, WaterOverrideSheet(), cascade(), CASCADE_KEYS, useClearWaterOverride(), useHasWaterOverride(), useWaterOverride(), hasManualWater() (+3 more)

### Community 59 - "manifest.json"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 60 - "toDraft.ts"
Cohesion: 0.24
Nodes (9): DAY_KEY_GUESSES, DayKey, guessDayKey(), hevyWorkoutToDraft(), isHelixDayKey(), SaveWorkoutInput, SaveWorkoutSchema, WorkoutCardioSchema (+1 more)

### Community 61 - "dependencies"
Cohesion: 0.06
Nodes (35): @capacitor/app, @capacitor/core, @dnd-kit/core, @dnd-kit/modifiers, @dnd-kit/sortable, next-themes, dependencies, @capacitor/app (+27 more)

### Community 62 - "intensityCalendar.ts"
Cohesion: 0.31
Nodes (6): buildIntensityCalendar(), CalendarCell, CalendarModel, CalendarStats, iso(), sundayOf()

### Community 63 - "clone"
Cohesion: 0.28
Nodes (9): _addRequest(), _addSyncListener(), clone(), fromRequest(), pushRequest(), registerSync(), replayRequests(), toObject() (+1 more)

### Community 64 - "RealtimeProvider.tsx"
Cohesion: 0.20
Nodes (9): RealtimeProvider(), TABLE_KEYS, TABLES, useScheduleOverrides(), HEALTH_QUERY_KEYS, WORKOUT_QUERY_KEYS, declaredList(), REGISTERED (+1 more)

### Community 65 - "save.ts"
Cohesion: 0.25
Nodes (11): CalorieEstimate, estimateAvgBpm(), estimateCalories(), KcalSample, medianKcalPerMin(), metKcalPerMin(), DB, nextDayISO() (+3 more)

### Community 67 - "_awaitComplete"
Cohesion: 0.40
Nodes (6): _awaitComplete(), destroy(), doneWaiting(), _getResponse(), handleAll(), runCallbacks()

### Community 68 - "formatSet"
Cohesion: 0.42
Nodes (7): ExportSet, setDetail(), formatLoad(), formatReps(), formatSet(), isUnloadedSet(), SetFormatOptions

### Community 70 - "TrendStrip.tsx"
Cohesion: 0.47
Nodes (4): daysAgoISO(), Series, TrendStrip(), useTrendSeries()

### Community 71 - "Smart Background Sync"
Cohesion: 0.40
Nodes (4): Smart Background Sync, BGTaskScheduler / BGAppRefreshTask, initNativeSync(), src/lib/native/sync.ts

### Community 72 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 73 - "backfill-prs.mjs"
Cohesion: 0.11
Nodes (15): asserted, bySession, db, deferred, DRY, env, jiti, keep (+7 more)

### Community 75 - "NutritionLogList.tsx"
Cohesion: 0.15
Nodes (12): formatDate(), GoalsRow, MacroProgressChart(), METRICS, NutritionRow, Goals, MACRO_COLOR, NutritionLogList() (+4 more)

### Community 76 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 77 - "prefsSync.ts"
Cohesion: 0.16
Nodes (15): HAS_AUTO, NOTE: the password ships in the client bundle (NEXT_PUBLIC_*), so it is readable, HelixMark(), AuthGate(), AuthState, hasPersistedSession(), getTrackRpe(), setTrackRpeMirror() (+7 more)

### Community 80 - "next.config.ts"
Cohesion: 0.50
Nodes (3): nextConfig, withAnalyzer, withSerwist

### Community 83 - "HelixViz.tsx"
Cohesion: 0.24
Nodes (12): alpha(), BodyHeatmap(), REGIONS, RpeCalendar(), VolumeStream(), regionalLoad, regionOpacity(), ZONE_COLOR (+4 more)

### Community 84 - "eraForDate"
Cohesion: 0.12
Nodes (30): MuscleAnalyticsSection(), StrengthTrends(), MuscleAnalyticsPanel(), CompletedHero(), Session, TrainingCard(), BodyBand(), FuelForceBand (+22 more)

### Community 86 - "Zone.tsx"
Cohesion: 0.20
Nodes (11): Measure, StatStrip(), SURFACE_PAD, SurfaceVariant, Tile(), VARIANT, Zone(), ZoneEmpty() (+3 more)

### Community 87 - "BodyCompositionChart.tsx"
Cohesion: 0.14
Nodes (23): BodyCompositionChart(), BodyCompositionPoint, COLORS, Family, FAMILY_META, FAMILY_SERIES, fmtDate(), mergeBodyComposition() (+15 more)

### Community 88 - "muscleMap.ts"
Cohesion: 0.48
Nodes (5): DICT, lookupMuscles(), MuscleEntry, resolveMovers(), tokenize()

### Community 91 - "useMuscleAnalytics.ts"
Cohesion: 0.28
Nodes (9): aggregateMuscleSets(), effectiveVolumes(), MUSCLE_GROUPS, MUSCLE_MAP, MuscleAggregate, MuscleSetRow, MuscleStat, weekStartUTC() (+1 more)

### Community 93 - "phases.ts"
Cohesion: 0.18
Nodes (18): PrintState, ReportDoc, ReportPage(), usePrintToPdf(), useReportDoc(), WeekChipLabel(), PHASE_HEX, PHASE_RGB (+10 more)

### Community 95 - "settings/page.tsx"
Cohesion: 0.06
Nodes (55): ActiveGoals, applyPrefsToDevice(), CONTEXT_LABELS, ContextMode, DEFAULTS, Goals, MODE_TO_PHASE, PLAN_PHASE_CASCADE_KEYS (+47 more)

### Community 103 - "BodyMap.tsx"
Cohesion: 0.13
Nodes (16): BARS, BodyMap(), CONTOURS, num(), Pt, NOTE: a smart scale reports WHOLE-BODY composition, not per-limb — the, RIGHT, SILHOUETTE (+8 more)

### Community 104 - "useCharts.ts"
Cohesion: 0.09
Nodes (29): ChartRange(), BodyHeatmap, MuscleAnalyticsSection, PRHistoryChart, RpeCalendar, StrengthTrends, VolumeChart, VolumeStream (+21 more)

### Community 108 - "s"
Cohesion: 0.20
Nodes (9): getAll(), args, buckets, db, DRY, env, MAP, unmapped (+1 more)

### Community 109 - "cachedResponseWillBeUsed"
Cohesion: 0.38
Nodes (7): cacheDidUpdate(), cachedResponseWillBeUsed(), expireEntries(), _getCacheExpiration(), _getDateHeaderTimestamp(), _isResponseDateFresh(), updateTimestamp()

### Community 110 - "merge-exercise.mjs"
Cohesion: 0.29
Nodes (6): args, db, DRY, env, from, to

### Community 124 - "pathfinder/page.tsx"
Cohesion: 0.23
Nodes (10): addDays(), BodyProgressPanel, iso(), PathfinderInner(), VitalsGroups, WEEKDAYS, MonthActivity, monthActivitySets() (+2 more)

### Community 129 - "healthkit.ts"
Cohesion: 0.15
Nodes (15): EXTRA_READ_TYPES, fetchSleep(), HealthKit, HealthKitPlugin, HealthSample, inBatches(), mergedMinutes(), METRIC_MAP (+7 more)

### Community 131 - "SupplementChecklist.tsx"
Cohesion: 0.14
Nodes (29): k(), COLORS, FORMS, SupplementChecklist(), WD, CASCADE_KEYS, customDoseFor(), CustomSchedule (+21 more)

### Community 135 - "generate-icons.mjs"
Cohesion: 0.40
Nodes (5): main(), render(), SOURCE, TARGETS, WIDGET_CONTENTS

### Community 156 - "ReadinessOrb.tsx"
Cohesion: 0.18
Nodes (9): prefetchSheetBodies(), programStreak(), ReadinessOrb, SCORE_COMPONENTS, ScoreCard, ScoreCardProps, ScoreKey, EcgPulse() (+1 more)

### Community 157 - "getDb"
Cohesion: 0.18
Nodes (13): addEntry(), b(), get(), getAllEntriesByQueueName(), getDb(), getEntryCountByQueueName(), getFirstEntryId(), _getId() (+5 more)

### Community 168 - "client.ts"
Cohesion: 0.18
Nodes (5): initSupabase(), isNative(), nativeStorage, SupabaseClient, SupabaseClientType

### Community 171 - "sync-pr-truth.mjs"
Cohesion: 0.17
Nodes (11): AXES, beaten, current, db, DRY, env, jiti, post (+3 more)

### Community 172 - "palette-discipline.test.ts"
Cohesion: 0.43
Nodes (6): ALLOWED_ORPHANS, PALETTE_SRC, PALETTE_VALUES, scan(), sourceFiles(), stripComments()

### Community 176 - "ExerciseHistoryBody.tsx"
Cohesion: 0.18
Nodes (8): ExerciseHistoryBody(), EMPTY, ExerciseHistoryData, ExerciseHistoryPoint, ExerciseHistoryRecords, useExerciseHistory(), shortDate(), history

### Community 183 - "StepsChart.tsx"
Cohesion: 0.36
Nodes (6): ChartTooltip(), TooltipProps, bandFor(), formatDate(), StepsChart(), StepsPoint

### Community 187 - "CoachHeaderCard.tsx"
Cohesion: 0.22
Nodes (7): CoachHeaderCard(), StatPatch, DatePickerPopover(), iso(), WD, useLoggedSessionDates(), parseDurationMin()

### Community 198 - "ExerciseBreakdown.tsx"
Cohesion: 0.11
Nodes (23): deltaGlyph(), ExerciseBreakdown(), ExerciseHistorySheet, Row, SetPrBadges(), TAG, toRows(), MuscleFocus() (+15 more)

## Knowledge Gaps
- **628 isolated node(s):** `pycharm`, `config`, `$schema`, `style`, `rsc` (+623 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `View` connect `View` to `HelixWidgets.swift`, `pathfinder/page.tsx`, `ContentView.swift`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `logicalTodayISO()` connect `logicalTodayISO` to `session/[id]/page.tsx`, `ceilings.ts`, `SupplementChecklist.tsx`, `supabase`, `useWeeklyLoop.ts`, `program.test.ts`, `PathfinderTimeline.tsx`, `useScheduleVersion`, `useDashboard.ts`, `[date]/page.tsx`, `useToday.ts`, `useTimelineWeeks.ts`, `draft.ts`, `ReadinessOrb.tsx`, `SessionDeck.tsx`, `VitalsGroups.tsx`, `app/page.tsx`, `RecoveryTrackers.tsx`, `eraFilter.tsx`, `dailyLog.ts`, `programs.ts`, `sync.ts`, `BrandHeader.tsx`, `useWaterOverride.ts`, `CoachHeaderCard.tsx`, `toDraft.ts`, `HelixViz.tsx`, `useMuscleAnalytics.ts`, `settings/page.tsx`, `useCharts.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `supabase` connect `supabase` to `healthkit.ts`, `ceilings.ts`, `SupplementChecklist.tsx`, `CardioLogger.tsx`, `useWeeklyLoop.ts`, `ExerciseCard.tsx`, `program.test.ts`, `PathfinderTimeline.tsx`, `useDashboard.ts`, `[date]/page.tsx`, `useToday.ts`, `exercises/page.tsx`, `useTimelineWeeks.ts`, `draft.ts`, `InBody.tsx`, `weekStartOf`, `SessionDeck.tsx`, `VitalsGroups.tsx`, `app/page.tsx`, `RecoveryTrackers.tsx`, `client.ts`, `programs.ts`, `routineTemplate.ts`, `ExerciseHistoryBody.tsx`, `BrandHeader.tsx`, `logicalTodayISO`, `useWaterOverride.ts`, `RealtimeProvider.tsx`, `TrendStrip.tsx`, `ExerciseBreakdown.tsx`, `prefsSync.ts`, `eraForDate`, `useMuscleAnalytics.ts`, `phases.ts`, `settings/page.tsx`, `useCharts.ts`, `pathfinder/page.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `displayWeight()` (e.g. with `WorkoutPage()` and `BodyCompositionChart()`) actually correct?**
  _`displayWeight()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pycharm`, `config`, `$schema` to the rest of the system?**
  _628 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HealthkitPlugin` be split into smaller, more focused modules?**
  _Cohesion score 0.05519480519480519 - nodes in this community are weakly interconnected._
- **Should `ContentView.swift` be split into smaller, more focused modules?**
  _Cohesion score 0.06612244897959184 - nodes in this community are weakly interconnected._