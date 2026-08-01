# Graph Report - .  (2026-07-29)

## Corpus Check
- Large corpus: 299 files · ~719,789 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1773 nodes · 4245 edges · 166 communities (89 shown, 77 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.79)
- Token cost: 747,476 input · 0 output

## Community Hubs (Navigation)
- Capacitor Native Bridge Plugins
- Muscle Analytics Range Selector
- Volume Chart Split View
- Daily Nexus Dashboard Page
- Active Goals & Device Prefs
- iOS ContentView SwiftUI Root
- Supplement Tracker Micros Page
- Service Worker Cache Entries
- iOS HealthKit Ingest Bridge
- Insight Coach Recommendations
- Dashboard Body Tiles Page
- Native Boot & HealthKit Fetch
- Weekly Loop Recovery Strip
- Muscle & Strength Trends
- Nutrition Page & Schedule
- Root Layout & Fonts
- Sleep Stages & Steps Journey
- Macro Progress Chart
- Exercise Card Set Grouping
- Next.js TypeScript Config
- Coach Report Paste Panel
- Body Detail Chart & Tooltip
- DOMS Recovery Tracker
- Pathfinder Timeline Weeks
- Session Analysis Muscle Focus
- Progression Queue & Trends
- Workout Page Volume Cards
- Weekly Reports Repair
- shadcn/ui Components Config
- Service Worker Cache Fetch
- Pathfinder Weekday Page
- Session Progression & File Browser
- Hevy Import Parser
- Session Draft Edit Hooks
- Daily Log Ingest
- Brand Header & Program Streak
- Weekly Review Stats Card
- watchOS Widgets
- API Route Handlers (misc)
- Weekly Volume & Muscle Map
- Daily Compute Route
- Heatmap & RPE Calendar Viz
- Schedule Day Swap Control
- Session Page Deck
- watchOS Snapshot Client
- Notion Sync & Supabase Client
- HealthKit Snapshot Model
- Notion Credentials Route
- Ingest Payload Schema
- Program Day Seed Templates
- Build Tooling Deps (Netlify/ESLint)
- Readiness Score Orb
- Watch Timeline Provider
- npm Scripts
- Precache List Management
- Auth Gate & Realtime Provider
- Schedule/Rest Day Route
- Coach Header & Date Picker
- Session Save & Reentry
- PWA Manifest
- Exercise Breakdown History
- Anthropic SDK & DnD Deps
- watchOS Stage Ribbon View
- Background Sync Requests
- Auth Page Bypass Notes
- Liquid Modal & Overlay
- Cache Header Freshness
- Cache Callback Runner
- Plan Era & Theme Provider
- Trend Strip Sparkline
- watchOS App Entry
- Smart Background Sync
- ESLint Flat Config
- Cache Expiration Handling
- Weekly Report Aggregation Route
- Exercise History Hook
- package.json Metadata
- Metric Card Component
- Responsive E2E Spec
- Netlify Keep-Alive Function
- Next Config with Serwist
- Global Error Boundary
- Serwist Service Worker Entry
- @capacitor/app Dependency
- @capacitor/cli Dependency
- Capacitor Config
- @capacitor/core Dependency
- @capacitor/haptics Dependency
- @capacitor/ios Dependency
- @capacitor/preferences Dependency
- clsx Dependency
- @dnd-kit/core Dependency
- @dnd-kit/modifiers Dependency
- @dnd-kit/sortable Dependency
- Apple Signing & HealthKit Constraints
- eslint-config-next Dependency
- @eslint/eslintrc Dependency
- Helix Icon & Dark Splash
- Helix Blue Chevron Brand Mark
- Helix Logo & Light Splash
- Helix DNA Brand Identity
- Helix Dark Splash 1x
- Helix Splash 3x Light
- jsdom Dependency
- lucide-react Dependency
- PyCharm MCP Config
- next Dependency
- next-themes Dependency
- @radix-ui/react-slider Dependency
- react-dom Dependency
- recharts Dependency
- serwist Dependency
- @serwist/next Dependency
- @supabase/supabase-js Dependency
- tailwind-merge Dependency
- TanStack Query Persister Dependency
- @tanstack/react-query Dependency
- TanStack Query Persist Client
- tw-animate-css Dependency
- zod Dependency
- @playwright/test Dependency
- shadcn Dependency
- tailwindcss Dependency
- @tailwindcss/postcss Dependency
- @testing-library/jest-dom Dependency
- @testing-library/react Dependency
- @testing-library/user-event Dependency
- @types/node Dependency
- @types/react-dom Dependency
- @types/testing-library__jest-dom Dependency
- @vitejs/plugin-react Dependency
- vitest Dependency
- PostCSS Config
- Code Convention & App Identity
- Playwright & Vitest Test Tools
- Tailwind Config
- Native Haptics Helper
- Native Platform Helper
- Helix Splash 2732 Chevron
- Helix Splash Blue Bars Logo
- Helix Splash Light Mode
- Helix Splash Dark 3x
- Helix Watch App Icon
- Apple Touch Icon
- Favicon X Mark
- PWA Icon 192
- PWA Icon 512
- PWA Icon 192 (icons dir)
- PWA Icon 512 (icons dir)
- Health Data Ingest Pipeline
- Helix Master App Icon
- DANGER Log Level
- SUCCESS Log Level
- WARN Log Level

## God Nodes (most connected - your core abstractions)
1. `logicalTodayISO()` - 88 edges
2. `supabase` - 49 edges
3. `eraForDate()` - 45 edges
4. `displayWeight()` - 41 edges
5. `activeProgram()` - 34 edges
6. `DashboardPage()` - 29 edges
7. `weekStartOf()` - 26 edges
8. `HelixSnapshot` - 25 edges
9. `useUnitSystem()` - 23 edges
10. `isoAddDays()` - 23 edges

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

## Communities (166 total, 77 thin omitted)

### Community 0 - "Capacitor Native Bridge Plugins"
Cohesion: 0.05
Nodes (34): Calendar, Capacitor, CAPBridgedPlugin, CAPBridgeViewController, CAPPlugin, Foundation, HealthKit, HKQuantityType (+26 more)

### Community 1 - "Muscle Analytics Range Selector"
Cohesion: 0.06
Nodes (43): PRESETS, RangeSelector(), RangeSelectorProps, BodyHeatmap, MuscleAnalyticsPanel(), MuscleAnalyticsSection, RpeCalendar, VolumeStream (+35 more)

### Community 2 - "Volume Chart Split View"
Cohesion: 0.08
Nodes (45): ChartSplit, formatDate(), resolveChartSplit(), splitColor(), splitLabel(), SPLITS_FOR_ERA, VolumeChart(), VolumePoint (+37 more)

### Community 3 - "Daily Nexus Dashboard Page"
Cohesion: 0.06
Nodes (41): DailyNexusPage(), hasScaleMetrics(), scoreColor(), SessionBlock(), sessionLabel(), BARS, BodyMap(), CONTOURS (+33 more)

### Community 4 - "Active Goals & Device Prefs"
Cohesion: 0.06
Nodes (41): ActiveGoals, applyPrefsToDevice(), CONTEXT_LABELS, ContextMode, DEFAULTS, Goals, MODE_TO_PHASE, planList() (+33 more)

### Community 5 - "iOS ContentView SwiftUI Root"
Cohesion: 0.09
Nodes (39): Combine, Content, ContentView, .body, Helix, MacrosScreen, .body, .remaining (+31 more)

### Community 6 - "Supplement Tracker Micros Page"
Cohesion: 0.11
Nodes (33): MicrosPage(), COLORS, FORMS, SupplementChecklist(), WD, customDoseFor(), CustomSchedule, customSlotsForDate() (+25 more)

### Community 7 - "Service Worker Cache Entries"
Cohesion: 0.07
Nodes (21): addEntry(), createHandlerBoundToUrl(), deleteEntry(), getAllEntriesByQueueName(), getDb(), getEndEntryFromIndex(), getEntryCountByQueueName(), getFirstEntryByQueueName() (+13 more)

### Community 8 - "iOS HealthKit Ingest Bridge"
Cohesion: 0.06
Nodes (38): /api/ingest endpoint, Bundle Identifier (app.helix.health.*), Capacitor, capacitor.config.ts, @perfood/capacitor-healthkit plugin, CocoaPods, iOS Deploy Guide (docs/ios-deploy-guide.md), src/lib/native/healthkit.ts (+30 more)

### Community 9 - "Insight Coach Recommendations"
Cohesion: 0.13
Nodes (29): InsightCoach(), TONE, calorieAdherence(), computeInsights(), DayPoint, daysSinceLastSession(), fuelVsForce(), Insight (+21 more)

### Community 10 - "Dashboard Body Tiles Page"
Cohesion: 0.10
Nodes (28): avg(), BODY_TILES, DashboardPage(), n0(), n1(), SHEET_ACCENT, SheetKey, TrendStrip (+20 more)

### Community 11 - "Native Boot & HealthKit Fetch"
Cohesion: 0.11
Nodes (27): NativeBoot(), EXTRA_READ_TYPES, fetchSleep(), HealthKit, HealthKitPlugin, HealthSample, inBatches(), localDayISO() (+19 more)

### Community 12 - "Weekly Loop Recovery Strip"
Cohesion: 0.11
Nodes (31): WeekActions(), WeekRecoveryStrip(), CustomSupplement, fetchRange(), RangeData, RawSession, RawSet, toBodyComp() (+23 more)

### Community 13 - "Muscle & Strength Trends"
Cohesion: 0.16
Nodes (21): MuscleAnalyticsSection(), StrengthTrends(), CommitBar(), ProgressionAlerts(), CompletedHero(), Session, TrainingCard(), FuelForceBand (+13 more)

### Community 14 - "Nutrition Page & Schedule"
Cohesion: 0.14
Nodes (24): NutritionPage(), ScheduleShortcut(), eraDateRange(), todayLocal(), useEnsureTodayScore(), useTodayBundle(), useTodayDailyLog(), useTodayMetrics() (+16 more)

### Community 15 - "Root Layout & Fonts"
Cohesion: 0.09
Nodes (18): inter, metadata, plexMono, sora, viewport, AuroraBackground(), BottomNav(), Sidebar() (+10 more)

### Community 16 - "Sleep Stages & Steps Journey"
Cohesion: 0.12
Nodes (23): clock(), SleepStages(), STAGES, PIPS, StepsJourney(), Better, Group, GROUPS (+15 more)

### Community 17 - "Macro Progress Chart"
Cohesion: 0.10
Nodes (22): formatDate(), GoalsRow, MacroProgressChart(), METRICS, NutritionRow, Field, FIELDS, MacroOverrideSheet() (+14 more)

### Community 18 - "Exercise Card Set Grouping"
Cohesion: 0.13
Nodes (20): ExerciseCard(), fmtDate(), fmtKg(), groupSets(), pairAsymmetry(), SetGroup, STATUS_META, ExerciseDeckList() (+12 more)

### Community 19 - "Next.js TypeScript Config"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 20 - "Coach Report Paste Panel"
Cohesion: 0.13
Nodes (21): PastePanel(), COACH_SPLIT_TO_DAY_KEY, CoachExerciseSchema, CoachExerciseStatus, CoachReport, CoachReportSchema, coachReportToDraft(), CoachSplit (+13 more)

### Community 21 - "Body Detail Chart & Tooltip"
Cohesion: 0.10
Nodes (18): COLORS, ChartTooltip(), TooltipProps, EXERCISE_COLORS, PRHistoryChart(), PRHistoryChartProps, COLORS, formatDate() (+10 more)

### Community 22 - "DOMS Recovery Tracker"
Cohesion: 0.13
Nodes (21): DomsTracker(), OFFSET_LABEL, SEVERITY_COLOR, SEVERITY_WORD, dayDiff(), DOMS_LEVELS, DOMS_MUSCLES, DomsMuscle (+13 more)

### Community 23 - "Pathfinder Timeline Weeks"
Cohesion: 0.12
Nodes (15): isWeekReady(), PathfinderTimeline(), WeekCapsule, cells(), inline(), MarkdownView(), ContinuumTimeline, DayCard (+7 more)

### Community 24 - "Session Analysis Muscle Focus"
Cohesion: 0.15
Nodes (18): SessionAnalysisPage(), MuscleFocus(), DetailExercise, RawSet, SessionDetail, useSessionDetail(), MUSCLE, SERIES (+10 more)

### Community 25 - "Progression Queue & Trends"
Cohesion: 0.21
Nodes (18): isTimedExercise(), ProgressionAlert, useProgressionQueue(), ExerciseTrend, useSessionTrends(), toSessions(), activeProgram(), ProgramExercise (+10 more)

### Community 26 - "Workout Page Volume Cards"
Cohesion: 0.17
Nodes (16): MuscleAnalyticsPanel, StrengthTrends, WD, WeeklyVolumeCard, WorkoutPage(), PostWorkoutSummary(), toReportRow(), WeeklySummaryCard() (+8 more)

### Community 27 - "Weekly Reports Repair"
Cohesion: 0.17
Nodes (17): EMPTY_PAYLOAD, num(), numOrNull(), repairReportPayload(), ReportDbRow, ReportPayload, useReports(), useSaveReport() (+9 more)

### Community 28 - "shadcn/ui Components Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 29 - "Service Worker Cache Fetch"
Cohesion: 0.19
Nodes (22): c(), cacheMatch(), cachePut(), _ensureResponseSafeToCache(), fetch(), fetchAndCachePut(), findMatchingRoute(), getCacheKey() (+14 more)

### Community 30 - "Pathfinder Weekday Page"
Cohesion: 0.17
Nodes (16): addDays(), iso(), PathfinderInner(), WEEKDAYS, ActivePlanBadge(), PHASE_WORD, MonthActivity, useGymReports() (+8 more)

### Community 31 - "Session Progression & File Browser"
Cohesion: 0.18
Nodes (15): SessionProgressionCard(), cap(), FileItem, FileSystemBrowser(), JourneyTimeline, KIND_COLOR, SessionHero(), DayVaultData (+7 more)

### Community 32 - "Hevy Import Parser"
Cohesion: 0.15
Nodes (21): Entry, explodeLine(), guessSplit(), HevyCardio, HevyExercise, HevySet, HevyStats, isMetaLine() (+13 more)

### Community 33 - "Session Draft Edit Hooks"
Cohesion: 0.19
Nodes (17): SessRow, SetRow, CommitResult, useSessionDraft(), verifyCommitted(), invalidateWorkoutData(), buildCommitPayload(), cardioSummary() (+9 more)

### Community 34 - "Daily Log Ingest"
Cohesion: 0.17
Nodes (18): k(), DB, FieldError, ingestDailyLog(), IngestResult, isMissingColumnError(), KNOWN_KEYS, logicalTodayForUser() (+10 more)

### Community 35 - "Brand Header & Program Streak"
Cohesion: 0.18
Nodes (16): BrandHeader(), greetingFor(), PLAN_CHIP_COLOR, programStreak(), useClock(), useLastUpdated(), useMyProfile(), DailyLog (+8 more)

### Community 36 - "Weekly Review Stats Card"
Cohesion: 0.21
Nodes (14): startOfWeekISO(), StatRowProps, todayISO(), useWeekStats(), WeeklyReviewCard(), WeekStats, computeSleepDebt(), SleepDebt (+6 more)

### Community 37 - "watchOS Widgets"
Cohesion: 0.16
Nodes (16): Helix, HelixCaloriesWidget, .body, HelixMediumView, .batteryRing, .body, HelixWeekWidget, .body (+8 more)

### Community 38 - "API Route Handlers (misc)"
Cohesion: 0.24
Nodes (13): POST(), GET(), POST(), GET(), DB, defaultUserId(), requireUserId(), resolveCallerUserId() (+5 more)

### Community 39 - "Weekly Volume & Muscle Map"
Cohesion: 0.20
Nodes (13): WeeklyVolumeCard(), WeekToDateTargets(), DICT, lookupMuscles(), MuscleEntry, tokenize(), programFromGoal(), useWeeklyVolume() (+5 more)

### Community 40 - "Daily Compute Route"
Cohesion: 0.21
Nodes (13): computeForDate(), DB, nextDay(), POST(), todayISO(), prescribedFor(), COMPOUND_PATTERNS, DB (+5 more)

### Community 41 - "Heatmap & RPE Calendar Viz"
Cohesion: 0.17
Nodes (14): alpha(), BodyHeatmap(), REGIONS, RpeCalendar(), VolumeStream(), GROUP_COLOR, isoWeekStart(), MUSCLE_GROUPS (+6 more)

### Community 42 - "Schedule Day Swap Control"
Cohesion: 0.24
Nodes (14): SwapDayControl(), dateForWeekday(), OverrideRow, PRE_KEYS, PRE_SLOT, useClearScheduleOverride(), useSwapDay(), getAllScheduleOverrides() (+6 more)

### Community 43 - "Session Page Deck"
Cohesion: 0.24
Nodes (9): SessionPageInner(), ReadyCue, PR_AXIS_LABEL, SessionDeck(), SessionNotesCard(), useExerciseSetHistory(), tapSuccess(), eraForDate() (+1 more)

### Community 44 - "watchOS Snapshot Client"
Cohesion: 0.20
Nodes (9): Error, HelixSnapshotClient, .isConfigured, HelixSnapshotError, badStatus, .errorDescription, notConfigured, Bool (+1 more)

### Community 45 - "Notion Sync & Supabase Client"
Cohesion: 0.14
Nodes (7): NotionSync(), Result, initSupabase(), isNative(), nativeStorage, SupabaseClient, SupabaseClientType

### Community 46 - "HealthKit Snapshot Model"
Cohesion: 0.34
Nodes (13): Codable, HelixSnapshot, .caloriesRemaining, Macros, Sleep, Steps, Double, Int (+5 more)

### Community 47 - "Notion Credentials Route"
Cohesion: 0.30
Nodes (11): GET(), pendingDates(), POST(), resolveCreds(), denyIfUnauthorized(), isAllowed(), sameOrigin(), buildDaySummaryLines() (+3 more)

### Community 48 - "Ingest Payload Schema"
Cohesion: 0.20
Nodes (8): energyField(), flex(), floatField(), IngestPayload, intField(), sleepMinutesField(), from(), noopChain()

### Community 49 - "Program Day Seed Templates"
Cohesion: 0.19
Nodes (12): daySplitEnum(), ProgramDay, SEED_TEMPLATES, SeedCardio, SeedExercise, SeedSet, SeedTemplate, WARMUP_CARDIO (+4 more)

### Community 50 - "Build Tooling Deps (Netlify/ESLint)"
Cohesion: 0.15
Nodes (13): eslint, @netlify/plugin-nextjs, devDependencies, eslint, @netlify/plugin-nextjs, postcss, @resvg/resvg-js, @types/react (+5 more)

### Community 51 - "Readiness Score Orb"
Cohesion: 0.22
Nodes (7): ReadinessOrb, SCORE_COMPONENTS, ScoreCard, ScoreCardProps, ScoreKey, EcgPulse(), KineticNumber()

### Community 52 - "Watch Timeline Provider"
Cohesion: 0.24
Nodes (9): Context, HelixEntry, HelixProvider, Bool, Date, Void, Timeline, TimelineEntry (+1 more)

### Community 53 - "npm Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, check, dev, e2e, e2e:ui, lint, start (+4 more)

### Community 54 - "Precache List Management"
Cohesion: 0.20
Nodes (12): addToPrecacheList(), constructor(), delete(), deleteCacheAndMetadata(), getIntegrityForPrecacheKey(), getUrlsToPrecacheKeys(), h(), handleActivate() (+4 more)

### Community 55 - "Auth Gate & Realtime Provider"
Cohesion: 0.29
Nodes (9): AuthGate(), AuthState, hasPersistedSession(), RealtimeProvider(), TABLE_KEYS, TABLES, useScheduleOverrides(), supabase (+1 more)

### Community 56 - "Schedule/Rest Day Route"
Cohesion: 0.31
Nodes (8): bearer(), GET(), isRestDayFor(), scheduleDayFor(), logicalTodayInTZ(), caloriesRemaining(), WidgetSnapshot, base

### Community 57 - "Coach Header & Date Picker"
Cohesion: 0.25
Nodes (7): CoachHeaderCard(), StatPatch, DatePickerPopover(), iso(), WD, useLoggedSessionDates(), draftTotals()

### Community 58 - "Session Save & Reentry"
Cohesion: 0.25
Nodes (9): isReentryWeek(), DB, nextDayISO(), saveSession(), SaveSessionResult, SessionMetrics, countCommittedSets(), SaveWorkoutInput (+1 more)

### Community 59 - "PWA Manifest"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 60 - "Exercise Breakdown History"
Cohesion: 0.24
Nodes (7): deltaGlyph(), ExerciseBreakdown(), ExerciseHistorySheet, PR_AXIS_LABEL, Row, toRows(), DetailSet

### Community 61 - "Anthropic SDK & DnD Deps"
Cohesion: 0.22
Nodes (9): @anthropic-ai/sdk, @dnd-kit/utilities, framer-motion, dependencies, @anthropic-ai/sdk, @dnd-kit/utilities, framer-motion, react (+1 more)

### Community 62 - "watchOS Stage Ribbon View"
Cohesion: 0.28
Nodes (8): CGFloat, StageRibbon, .body, HelixSmallView, .body, .kcalLeft, Double, Int

### Community 63 - "Background Sync Requests"
Cohesion: 0.28
Nodes (9): _addRequest(), _addSyncListener(), clone(), fromRequest(), pushRequest(), registerSync(), replayRequests(), toObject() (+1 more)

### Community 64 - "Auth Page Bypass Notes"
Cohesion: 0.28
Nodes (4): HAS_BYPASS, NOTE: the bypass password ships in the client bundle (NEXT_PUBLIC_*), so it is, NOTE: the app's deploy URL + `/auth/update-password` must be in Supabase →, HelixMark()

### Community 65 - "Liquid Modal & Overlay"
Cohesion: 0.43
Nodes (6): LiquidModal(), LiquidModalProps, acquireOverlay(), Portal(), releaseOverlay(), useOverlayBodyLock()

### Community 66 - "Cache Header Freshness"
Cohesion: 0.29
Nodes (7): b(), get(), _getDateHeaderTimestamp(), _isResponseDateFresh(), R(), _upgradeDb(), _upgradeDbAndDeleteOldDbs()

### Community 67 - "Cache Callback Runner"
Cohesion: 0.40
Nodes (6): _awaitComplete(), destroy(), doneWaiting(), _getResponse(), handleAll(), runCallbacks()

### Community 68 - "Plan Era & Theme Provider"
Cohesion: 0.53
Nodes (4): daysBetween(), PlanEraButton(), ThemeProvider(), useUserGoals()

### Community 69 - "Trend Strip Sparkline"
Cohesion: 0.47
Nodes (4): daysAgoISO(), Series, TrendStrip(), useTrendSeries()

### Community 70 - "watchOS App Entry"
Cohesion: 0.40
Nodes (4): App, HelixWatch_Watch_AppApp, Scene, SwiftUI

### Community 71 - "Smart Background Sync"
Cohesion: 0.40
Nodes (4): Smart Background Sync, BGTaskScheduler / BGAppRefreshTask, initNativeSync(), src/lib/native/sync.ts

### Community 72 - "ESLint Flat Config"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 73 - "Cache Expiration Handling"
Cohesion: 0.60
Nodes (5): cacheDidUpdate(), cachedResponseWillBeUsed(), expireEntries(), _getCacheExpiration(), updateTimestamp()

### Community 74 - "Weekly Report Aggregation Route"
Cohesion: 0.70
Nodes (4): aggregateWeek(), derivePayloadFromStats(), persistAndRespond(), POST()

### Community 75 - "Exercise History Hook"
Cohesion: 0.40
Nodes (4): EMPTY, ExerciseHistoryData, ExerciseHistoryPoint, ExerciseHistoryRecords

### Community 76 - "package.json Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **440 isolated node(s):** `pycharm`, `config`, `$schema`, `style`, `rsc` (+435 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **77 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `View` connect `iOS ContentView SwiftUI Root` to `watchOS Widgets`, `watchOS Stage Ribbon View`, `Pathfinder Weekday Page`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `HelixSnapshot` connect `HealthKit Snapshot Model` to `Watch Timeline Provider`, `iOS ContentView SwiftUI Root`, `watchOS Snapshot Client`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `logicalTodayISO()` connect `Weekly Review Stats Card` to `Muscle Analytics Range Selector`, `Daily Nexus Dashboard Page`, `Active Goals & Device Prefs`, `Supplement Tracker Micros Page`, `Insight Coach Recommendations`, `Dashboard Body Tiles Page`, `Native Boot & HealthKit Fetch`, `Weekly Loop Recovery Strip`, `Nutrition Page & Schedule`, `Sleep Stages & Steps Journey`, `Macro Progress Chart`, `Coach Report Paste Panel`, `DOMS Recovery Tracker`, `Pathfinder Timeline Weeks`, `Progression Queue & Trends`, `Workout Page Volume Cards`, `Weekly Reports Repair`, `Pathfinder Weekday Page`, `Session Draft Edit Hooks`, `Brand Header & Program Streak`, `API Route Handlers (misc)`, `Weekly Volume & Muscle Map`, `Daily Compute Route`, `Heatmap & RPE Calendar Viz`, `Schedule Day Swap Control`, `Session Page Deck`, `Coach Header & Date Picker`, `Plan Era & Theme Provider`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **What connects `pycharm`, `config`, `$schema` to the rest of the system?**
  _440 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Capacitor Native Bridge Plugins` be split into smaller, more focused modules?**
  _Cohesion score 0.05451127819548872 - nodes in this community are weakly interconnected._
- **Should `Muscle Analytics Range Selector` be split into smaller, more focused modules?**
  _Cohesion score 0.06077694235588972 - nodes in this community are weakly interconnected._
- **Should `Volume Chart Split View` be split into smaller, more focused modules?**
  _Cohesion score 0.07581453634085213 - nodes in this community are weakly interconnected._