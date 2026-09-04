# ONYX — Native Phase 2: the No-Mercy UI/UX Refactor & the Great Sync

**Status:** ADOPTED 2026-09-04 (founder-approved after brainstorm; 16 decisions in §1). Authority for every Phase 2 session. Execution has NOT started. `docs/NATIVE_MIGRATION_PLAN.md` stays as the Phase 1 record; its §3 Design Mandate is **superseded** by §3 here.
**Branch:** `feature/native-migration-wave-1` (Track U) + `track-s/sync` worktree (Track E). Never main.
**Prerequisite unchanged:** Gate 0 (Apple Developer Program) still gates App Group, background delivery, TestFlight. Everything below that does not need it is built now; the three items that do are marked `ADP`.

---

## 0. Context — why Phase 2

Waves 0–8 shipped the architecture: GRDB mirror (29 tables, 261 tests), HelixCore domain port (238 tests, 16,246 golden cases), Swift Charts kit, HealthKit reader, Live Activity, widgets. The app builds in Release and has a submission pack. Waves 9 (retire web) and 10 (Watch) are postponed.

What shipped is architecturally sound and visually wrong. Screenshots in `native/__screenshots__/` read as a web app in a new font: 20 pt tiles with 16 pt padding, 56 pt hero numerals, neon accents on black, sheets that repeat their own content. And the data layer, though complete, is **not wired**: the sync engines have zero call sites in the app target, so the native app has no history and its outbox never drains.

Phase 2 fixes both with no mercy: every screen is re-cut to Apple's density, every colour re-keyed to a desaturated palette, and the sync spine is connected end to end with a full-history backfill. The app is renamed **Onyx**.

---

## 1. Decisions (brainstorm 2026-09-04)

| # | Question | Answer |
|---|---|---|
| 1 | History home | **Door from Today** (calendar icon). Week capsules → days → day page. Pathfinder deleted. |
| 2 | Macro history | 7-day "vs goal" strip in Nutrition; everything older only in History. |
| 3 | Battery | **Extend v7 drain model** (keep invariant `maxTotalDrain < 100`); add HRV deviation, deep+REM share, onset trouble, fatigue slots. |
| 4 | Stress input | Fatigue slots (subjective) + HRV/RHR deviation from 7-day baseline (objective). No new logger. |
| 5 | DOMS body | **2D atlas, hit-tested, shaded.** Reuse the 35-path atlas; no SceneKit. |
| 6 | Macro edit math | Protein pinned; carbs/fat share a kcal delta in their current ratio; kcal is always the Atwater sum. |
| 7 | Backfill | **Full history from 2026-03-10, blocking progress sheet on first signed-in launch**, paginated, 90-day cap removed, delta cursors after. |
| 8 | Post-workout entry | Auto-push after Finish · tap Today's session card · History row · Today dashboard Workout tile. |
| 9 | Palette | **Four domains, desaturated** (§3.2). |
| 10 | Body tab name | **Pulse**. |
| 11 | App name | **Onyx**. |
| 12 | Logger | Hybrid: keep data flow + Live Activity contract; revolutionise UI (compact rows, rest timer in nav bar, swipe-to-complete, haptics on every interaction). |
| 13 | Week reset | **Derived, no write.** One `WeekWindow` from the week-start setting; midnight timer invalidates. |
| 14 | Sync feedback | 1 pt hairline + "Synced 2s ago" on Today **and** a per-table Sync Status section in Settings. |
| 15 | Execution | **Two tracks**: U (Opus) on wave-1 branch, E (Fable) in `track-s` worktree. |
| 16 | Live Activity | Re-token to Onyx + mark; add PR flash + sets done/planned to `ContentState`; add rest-skip `AppIntent` button. |

Standing decisions from Phase 1 that still hold: dark-only 1.0, single user, no iPad, no desktop, `TabView` with five tabs, tests are the review, tokens before pixels, vectors before Swift, never edit the `.xcodeproj`.

---

## 2. Diagnosis — what the code and screenshots say

Measured by three read-only sweeps on 2026-09-04. Every claim has a file.

### 2.1 Why it looks web-like (it is not raw hex — there is none in `Features/`)

| Cause | Where | Fix wave |
|---|---|---|
| Two token systems. Logger (6 files) still on `HelixPalette` — the Tailwind hex port with `alphaByte(0x1f)` values. | `HelixUI/DesignSystem/HelixPalette.swift`, `Features/Logger/{LiveLoggerView,ExerciseCardView,RestTimerBar,PhaseSheet,AtlasFigure,MuscleDistributionSheet}.swift` | U-2.2 |
| ~200 literal `.font(.system(size: 7…44))` in tile faces. Right for WidgetKit, wrong reused as app tiles and sheet content (Dynamic Type ignored). | `HelixUI/Tiles/*.swift` | U-2.0 |
| Scale too large: tile radius 20, `.padding(16)`, `spacing 16`, hero 56 pt, orb 104 pt, large nav titles everywhere. | `HelixTokens.swift` (`HelixCorner`), every `*TabView` | U-2.0/2.1 |
| Accents at full saturation on black: Ion `#7C5CFF`, Tide `#3DFFB0`. | `HelixTokens.swift` `HelixDomain` | U-2.0 |
| `HelixSurface.swift` (`helixCard`, `HelixRadius` 6/8/12/16) duplicates `helixGlass`/`HelixCorner`. | `HelixUI/DesignSystem/HelixSurface.swift` | U-2.0 (delete) |
| No spacing enum; every screen hard-codes 14/16. | all Features | U-2.0 |
| Fixed heights that do not scale under AX5: atlas 88/120/260, chart `plotHeight 180`, mesh 340, logger gradient 380. | `TrainTabView`, `DayRecoveryTiles`, `AtlasFigure`, `HelixChart`, `HelixGlass`, `LiveLoggerView` | U-2.x per screen |

### 2.2 Bugs confirmed at source

| Symptom | Root cause | Fix |
|---|---|---|
| **Start workout → black screen** | `TrainTabView.swift:96` `fullScreenCover(isPresented:)` whose body is `if let session {…}`. Nil session = empty cover, no chrome (`toolbarVisibility(.hidden)`), no dismiss. Logger has **no screenshot** in `native-shot.sh`, so nobody saw it. | `.fullScreenCover(item: $session)`; add `logger` to PreviewHarness + SCREENS. |
| **Vitals sheet: gap + repeated boxes** | `DomainSheets.swift:54-56` renders the Large face **plus** two Medium faces: every metric ×2, "VITALS" ×3, mark ×3, STEPS/SLEEP ×3. Gap = Large face's fixed spacer. | One list face; delete `extras` for `.vitals`. |
| **Sleep sheet: stages listed twice, all purple** | `SleepLargeFace` (`HelixLifestyle.swift:623`) has a STAGES register; `DomainSheets.swift:110` `extras` renders the four rows again. Stage ramp is four alphas of one Lunar hue (`HelixSleepStage`). | Delete `extras`; four distinct stage tokens (§3.2). |
| **"7 nights" shows 2** | `HelixCore/Widget/Derive.swift:148` `dailySeries` **omits days with no rows** and never pads to `limit`; `BarChart` draws `points.count` bars full width. Same bug in water/steps/kcal trends. | Pad the window to `limit` with nil buckets; `BarChart` renders empty slots. |
| **Widgets not bound / stale** | `WidgetSnapshotBuilder` computes score in memory; `writeDailyScore` called **only from tests**; `daily_scores` on device is whatever the web wrote. | E-2.2 score persistence. |

### 2.3 The Great Sync — what actually exists

- `SyncEngine`, `MirrorPuller`, `TrainingPuller`, `MirrorRealtime`, `MirrorCoalescer`, `PostgRESTRemote`, `PostgRESTMirrorRemote`: **zero references** from `HelixNative/`, `HelixNativeWidgets/`, `HelixNativeTests/`. Exercised only by package tests.
- `TodayTabView.swift:69` `.refreshable` rebuilds from local GRDB only. Every `scenePhase` handler is local except `refreshHealth()`.
- `MirrorPuller(windowDays:)` defaults **90**; ten `.window` tables (`daily_scores`, `nutrition_entries`, `water_intake`, `body_composition`, `sleep_sessions`, `cardio_logs`, `doms_logs`, `fatigue_logs`, `supplement_dose_overrides`, `daily_metrics`) never see older rows and cannot see edits to older rows.
- **No pagination.** `PostgRESTMirrorRemote.select` sends no `range`; PostgREST truncates silently at `db-max-rows`.
- `resetInFlight()` never called at launch. Realtime never subscribed. No `HKObserverQuery`, no background delivery (`ADP`).
- `ScoringInputsBuilder`: `trailingAvgVolumeKg` hard-coded `0`, `contextMode` never set, `newPRsToday` always 0 on the main path. All three are now wireable (`Sessions/Volume.swift`, `Training/PrEngine.swift`, `Nutrition/Context.swift` are ported; the file's header comment saying otherwise is stale).
- Good news: the engines are complete and tested (261 `swift:data` tests). Phase 2 **wires**, it does not rebuild.

### 2.4 Already ported and waiting for UI

`Training/Ceilings.swift` (`progressionVerdict` → `.ready(top+2.5)` / `.oneMore` / `.no`, `timedProgressionVerdict`), `Training/PrEngine.swift`, `Exercises/MuscleMap.swift` (37 lifts resolve), `Nutrition/Levers.swift` (exact rungs: Baseline 1955/170P/195C/55F/10k · Lever 1 1885/170/182/53/10k · Lever 2 1885/170/182/53/12k · Maintenance 2151/170/244/55/7.5k; `Levers.schedule` dated), `Time/Week.swift` (`startDay(fromEndDay:)` exists; app-side week math ignores it), `Reports/WeeklyExport.swift` (byte-parity port), `Scoring/Battery.swift` (already drains legs 30 / upper 24 / arms 18 via `workoutMaxByDay`).

---

## 3. Design Mandate v2 — Obsidian Glass, desaturated and compact

Supersedes Phase 1 §3. Skills: `apple-design` (§1, §3, §12–§16), `ui-ux-pro-max` `--stack swiftui` + `references/pro-rules.md` checklist at every UI gate, `frontend-design` when a screen reads templated, `dataviz` for every chart. Persist the tokens once as `design-system/onyx/MASTER.md` in U-2.0 (`ui-ux-pro-max:design-system --persist`, edited by hand to the values below — the tool's own fitness defaults are orange/green and are rejected).

### 3.1 Material (unchanged in kind, tightened in size)

- Base true black. One `MeshGradient` bleed per domain, **≤ 8 %** (was 12), height 240 (was 340), top-anchored.
- `helixGlass(.row | .tile | .sheet | .chrome)` stays the single owner. Materials unchanged. Hairline 0.5 pt at 8 %.
- **Corners:** row 10, tile **16**, sheet 28, concentric via `HelixCorner.inner()`.
- **Spacing enum `HelixSpace`:** `xs 4 · s 8 · m 12 · l 16 · xl 24`. Tile padding `m`; grid gap `s+2 = 10`; section gap `l`; screen gutter `l`. No literal spacing in `Features/` — the token-discipline test greps for `padding(1[4-9]|2[0-9])` and `spacing: 1[4-9]`.
- Rows are **44 pt** min height, never taller unless two lines of content.

### 3.2 Colour — four domains, two steps down

| Domain | Token | Mesh stops | Notes |
|---|---|---|---|
| Train | Ion | `#6B78F0 → #4FB6E8` | indigo → sky |
| Fuel | Solar | `#E3A650 → #E07A7A` | honey → coral |
| Body / Pulse | Tide | `#46B39D → #2E9AA6` | teal → deep teal |
| Recover | Lunar | `#A79FD6 → #C9D3EE` | lavender → mist |

- Text: primary 92 %, secondary 62 %, tertiary 40 %. Danger `#E5484D`. Good `#4CAF87`. Record (PR) `#FFD35C` gold (raised from `#D9B25F` in U-2.2 — ΔE76 11.0 from `carbs` was indistinguishable on the same face) — the **only** fifth hue, reserved for records.
- **Macros & water (new semantic tokens):** `protein #E07A7A` coral, `carbs #E3A650` honey, `fat #A79FD6` lavender, `water #5AA9E6` sapphire, `calories` = Solar ramp. Fixed app-wide; never re-mapped per screen.
- **Sleep stages (four distinct tokens, not four alphas):** `deep #5B62C9`, `core #A79FD6`, `rem #E07A9A`, `awake #6E6E78`.
- **Split colours for the This-Week panel** (`Color.helix.day(dayKey)` re-keyed): legs A/B = Tide at steps 0.35 / 0.65; upper A/B = Ion at 0.35 / 0.65; Delts & Arms = Ion end-stop (sky); Push/Pull/Legs mirror the same rule. Rest = tertiary grey ring.
- Muscle ramp: 16 landmarks stay a ramp; chest/arms/shoulders on Ion, back/legs on Tide, core on Lunar. Severity (DOMS): none tertiary · mild Good · moderate Record · severe Danger.
- Contrast: every primary/secondary text pairing ≥ 4.5:1 on `.tile` material; verified in the AX pass.

### 3.3 Typography

- SF Pro only. Numerals `.fontDesign(.rounded).monospacedDigit()` with `.contentTransition(.numericText())`.
- **Scale (replaces `HelixType` literals):** hero `.title` 28 bold rounded (−0.02 em) · display `.title3` 20 semibold · body 17 · secondary 15 · caption 13 · micro 11 (labels only, never data). **Nothing below 11 pt in the app; widgets may go to 9 via a widget-only `HelixWidgetType`.**
- Nav titles `.inline` on every tab except Today, which carries the Onyx wordmark at `.large` collapsed to inline on scroll.
- Dynamic Type mandatory; AX5 screenshot in every gate.

### 3.4 Motion & haptics

- `HelixMotion` values stay (move 0.4/1.0, flick 0.4/0.8, drawer 0.3/0.8). Bounce only after momentum.
- **Haptic map (the whole list):** `.selection` on every stepper detent, slider snap, segmented change, radio row; `.impact(.soft)` on set logged, swipe-complete commit, tile drop; `.impact(.rigid)` on swipe threshold crossed; `.success` on session finished, PR, sync complete after pull-to-refresh; `.error` on sync failure, sign-in failure. Nothing else.
- Every drag 1:1 and interruptible; swipe rows use `.swipeActions` where a `List` exists, a custom `DragGesture` with rubber-band only in the logger deck.
- Reduce Motion: springs → 200 ms cross-fade; auto-rotating stacks stop.

### 3.5 Charts (Swift Charts, `dataviz` rules)

- One style modifier `helixChart(domain)`. Tight non-zero domains with **both bounds labelled** (port of `tightDomain`). Every point tappable via `chartXSelection`; dense mode hides marks past 8 points, keeps hit targets. Empty state = `HelixChartEmpty`, never a blank card.
- Micro-graphs (per set / per exercise) are `Sparkline`-class primitives, 40×16 pt, no axes.

### 3.6 The "not web" checklist v2

A screen passes review only if: nav title inline or collapsing · no tile taller than its content · no box that only repeats the box above it · one accent per screen plus gold for records · every number has a unit and a reserved delta line · every list is a `List` or `Form`, not a `ScrollView` of cards, unless it is a grid · pull-to-refresh present on Today · AX5 screenshot does not clip.

---

## 4. Information architecture

```
TabView
├─ Today      (Onyx wordmark, mark trailing, pull-to-refresh, hairline sync)
│    └─ History door (calendar icon) → HistoryView → WeekDaysView → DayScreen (existing) → SessionDetailView
├─ Workout    (This week · Today's session · Ready to progress · Cardio · Library door · History door)
│    ├─ LiveLoggerView (fullScreenCover(item:))
│    ├─ SessionDetailView (post-workout page)
│    ├─ ExerciseLibraryView → ExerciseDetailView
│    └─ TrainingTrendsView (kept, re-cut)
├─ Nutrition  (Calories · Macros · Water · 7-day strip · Nutrients door · context chips)
├─ Pulse      (Now strip · Sleep · Vitals · Fatigue row · DOMS body · Scale · Body trends door)
└─ Settings   (Plan · Targets/Levers · Units & week start · Training · Sync status · About)
```

Deleted: Pathfinder (`Features/Pathfinder/`), `SwapDayTile` from Pulse (swap moves to a Today context action on the session card), Fuel `EntriesTile` and `DayTargetTile`, Today `Edit` button, `HelixPalette`, `HelixSurface`, `HelixType` literal sizes.

---

## 5. Screen specs

Each spec lists: layout top-to-bottom · interactions · data sources · what is deleted. Files named are the ones to rewrite; new files sit beside them.

### 5.1 Today (`Features/Today/`)

1. Nav: Onyx wordmark (`.large` → inline), trailing `OnyxMark` 18 pt. **No Edit button**; long-press jiggle stays (`TileFrame`).
2. **Now strip** (replaces 104 pt orb): one `.tile` row, 64 pt — battery ring 36 pt, score numeral, next session chip, "Synced 2s ago" tertiary caption trailing. Tap → Pulse.
3. Sync hairline: 1 pt Lunar line under the nav bar while `SyncCoordinator.state == .running`, fades on completion with `.success` haptic.
4. `DashboardGrid` unchanged in mechanics; tile padding `m`, gap 10, radius 16.
5. `WeekSoFarView` becomes a 44 pt row.
6. `.refreshable` → `SyncCoordinator.syncNow(reason: .pull)`.

Sheets (`DomainSheets.swift` rewritten): a sheet is **one** face at the sheet's width plus **zero** repeated content. Sleep: arc 180 pt wide with four stage colours, stage 2×2 grid, seven-night bars padded to 7, debt gauge. Vitals: one `List` of metric rows (value, unit, delta chip, 7-day sparkline), then Steps/Stand/Active rows once.

Data binding: every face reads `TodayFeedBuilder`, which reads GRDB; GRDB observation (`ValueObservation`) drives invalidation so a HealthKit write repaints within one frame. No face keeps its own copy.

### 5.2 Workout (`Features/Train/TrainTabView.swift` → `WorkoutTabView.swift`)

1. Nav inline "Workout"; trailing: Library (`books.vertical`), History (`clock`), Trends (`chart.xyaxis.line`).
2. **This week panel** (`.tile`, 88 pt): seven 36 pt day cells, weekday initial above, filled circle in split colour when logged (tap → `SessionDetailView`), hollow ring when planned, tertiary dot for rest, sessions `3/5` and tonnage trailing. Colours per §3.2.
3. **Today's session** (`.tile`): split name `.title3`, "7 exercises · 17 sets", atlas thumb 44 pt trailing, exercise rows 36 pt (name · sets×reps). When logged, the tile collapses to a summary strip (volume · sets · PRs · duration) and tap pushes `SessionDetailView`. Swap/rest via `contextMenu`.
4. **Ready to progress** (`.tile`, appears only when non-empty): rows from `Ceilings.progressionVerdict` over the last two sessions of each of today's lifts: `Incline DB Press  40 → 42.5 kg` (Good) or `1 more session` (Record). Timed moves: `extend hold`.
5. **Cardio** row (44 pt): last bout summary; `+` opens `CardioLogSheet` (moved from Pulse). Cardio bouts also draw as a small Tide dot under the day cell in This week.
6. Footer CTA 52 pt: Start / Resume / Done, Ion ramp, `.fullScreenCover(item: $session)`.

### 5.3 Live Logger (`Features/Logger/`) — hybrid overhaul

- Off `HelixPalette` entirely (6 files). Background `helixScreen(.train)`.
- Rest timer lives in the nav bar (`principal` placement) as a capsule with `Text(timerInterval:)`; the `RestTimerBar` sheet dies. Tap → skip; long-press → ±15 s.
- Set rows 44 pt: badge · weight × reps steppers inline (`.selection` per detent) · RPE word chip · **swipe right to log** (`.impact(.rigid)` at threshold, `.impact(.soft)` on commit, row tints Good for 300 ms) · swipe left = note / drop-set / failure toggles. Long-press = duplicate set.
- Exercise cards are a deck (`ScrollView` + `scrollTargetBehavior(.viewAligned)`), current card scales 1.0, others 0.96.
- PR flash: gold hairline sweep on the row + `.success`; sets done/planned live in `ContentState` (decision 16).
- Finish: `.presentationDetents([.medium, .large])` sheet — RPE dial, summary, **"View summary"** pushes `SessionDetailView`.
- Add `logger` and `logger-finish` to `PreviewHarness` + `native-shot.sh`.

### 5.4 Post-workout page (`Features/History/SessionDetailView.swift` rebuilt)

Structural port of the web `/session/[id]`, elevated:

1. Title band: day-coloured wash (split colour, 30 % → 0), title `.title` in split colour, meta `Session #12 · Tue 1 Sep · 07:12`, tag row: plan (`Helix-5`), phase (`Cut · W7`), lever (`Lever 1` / `Maintenance`), resolved **for that date** via `Levers.leverForDate` + `Phases`.
2. Metric grid: row A 3 cells (Volume kg, Duration, Sets with W/F/D composition chips), row B 4 cells (Difficulty x/10, Records, Avg HR, Calories). Reserved delta sub-line vs previous same-split session. `calc` superscript on estimated values (`avg_bpm_estimated`, `calories_estimated`).
3. **Progression** card: verdict sentence, Swift Charts line through every session of this split (tight domain, both bounds labelled, points tappable), footer `5,158 kg · +1 % vs 25 Aug`. PR markers as gold points.
4. **Muscle focus** card: hit-tested atlas 96 pt (tap → `MuscleDistributionSheet`) + stacked ramp bar + legend with weighted set counts (`MuscleCredit.weightedSets`).
5. **Ledger** (one `List`, sections per exercise): header washed in exercise hue, prescription, `2/3 @ ceiling`, progression cue chip, 40×16 sparkline of est-1RM across sessions; rows = `SetBadge` · `42 kg × 10` · `prev 40 × 10` · RPE word; PR row gold inset; tap badge → "what this record beat" popover; tap header → `ExerciseDetailView`.
6. Cardio card when a `cardio_logs` row shares the date.

Zero-latency requirement: the page is built from GRDB by `SessionAnalysis` synchronously on push; the millisecond a session closes, `LoggerModel.finish` writes sets + PRs + `daily_scores` in **one transaction**, and every observer (Today tiles, Library stats, Trends) repaints from the same observation.

### 5.5 Exercise Library (`Features/Exercises/`)

List: `.searchable`, sections per muscle group in group tint, rows 44 pt with `48 sets · last 1 Sep` and a 40×16 sparkline. Detail: segmented Summary | History; Summary = 3-cell strip (Heaviest · Best est-1RM · Best session volume), caveat line (heaviest single set · total reps), hero area chart est-1RM (or reps/session for unloaded), prev/next exercise chevrons. History = reverse-chron sessions with compact set grids.

### 5.6 Nutrition (`Features/Fuel/` → `Features/Nutrition/`)

1. Nav inline "Nutrition", date chevrons + calendar trailing (existing).
2. **Calories card** (`.tile`, 76 pt): numeral 28 pt `1,420` + `/ 1,955 kcal` secondary + `535 left` trailing; below, one `Gauge(.accessoryLinearCapacity)` tinted Solar with a 1 pt target tick and coral overshoot segment. 7 adherence dots (Exception lavender / Estimated honey / Tracked good / Untracked tertiary).
3. **Macros card** (`.tile`): three stacked 36 pt rows P / C / F — label, `128 / 170 g` numerals, gauge in the macro token, remaining trailing. Untracked macro renders greyed with `—`.
4. **Water** row (`.tile`, 44 pt): droplet, `2.1 / 3.0 L`, sapphire gauge; tap = +250 ml (`.selection`), long-press = quick-edit sheet (litres stepper, goal).
5. **Context chips** (one 32 pt row): active lever chip, day-shape chip, exception chip if declared. Tap chip → picker sheet. Replaces `FlagsTile`.
6. **7-day macros vs goal** mini chart (`.tile`, 120 pt): four stacked bars per day normalised to goal, dashed 100 % line.
7. **Nutrients** chevron row → `NutrientsView` (new): groups from `NutrientTargets`, floor/ceiling gauges, stack contribution shown separately.
8. **Long-press** on Calories or any macro row → `MacroEditSheet`: four steppers linked by `MacroMath` (§6.3); shows the kcal recomputing live with `numericText`.

Deleted: `EntriesTile` ("Logged"), `DayTargetTile`, `FlagsTile` body. Targets are inline on every gauge and come from `TargetResolver` only.

### 5.7 Pulse (`Features/Day/` → `Features/Pulse/`)

1. Nav inline "Pulse", date chevrons, trailing Body trends door.
2. **Now strip**: score numeral, battery ring, one-line fuel summary (`1,420 / 1,955 kcal · P 128 · water 2.1 L`) — no macro gauges here (they live in Nutrition).
3. **Sleep** (`.tile`): 180 pt arc with four stage colours, bed/wake at the ends, `7h 17m` centred, `+22m vs goal` chip; 2×2 stage grid (dot · label · % · duration); debt gauge; onset trouble as a compact toggle row.
4. **Vitals** (`List` section): HRV, Resting HR, Respiratory, SpO₂, Wrist temp, Steps, Stand hours, Active kcal — each 44 pt: value · unit · delta chip · 7-day sparkline. Wired to `daily_logs` via HealthKit (`appleStandTime` sums to hours).
5. **Fatigue** row (44 pt): latest level word in its colour, `before training · 2 of 3`, cost chip, three hollow/filled dots; tap → bottom sheet with the three slot pickers.
6. **DOMS** (`.tile`): hit-tested atlas front/back (flip on swipe, spring), tinted by severity; **tap a muscle → severity popover** (none/mild/moderate/severe, `.selection`), credited session caption. No text label list.
7. **Scale** row: last weigh-in, skip reason chip, `+` opens `InBodyEntryView`.
8. Stack (supplements) row stays as a 44 pt row with `6/8` and a sheet.

Deleted: `SwapDayTile`, `CardioTile` (moved to Workout).

### 5.8 Settings (`Features/You/` → `Features/Settings/`)

Stock `Form`. Sections: **Plan** (Training plan) · **Targets** (Levers · Weekly set volume · Body targets · Reports) · **Units & display** (Weight units · **Week starts on** — now wired to `WeekWindow` · Reduce motion) · **Training** (Track RPE) · **Sync** (status: last full sync, per-table rows `daily_logs · 2s ago · 412 rows`, outbox pending count, "Sync now", "Re-run backfill" with confirmation) · **About** (Onyx, version, privacy).

Levers screen: radio rows for Baseline / Lever 1 / Lever 2 / My own numbers, Release section with the Maintenance week toggle + until-date, Targets rows read-only when a rung holds them. Selecting a rung writes `user_goals.active_lever` through the outbox and `TargetResolver` republishes; every gauge in the app repaints on the same GRDB observation tick.

### 5.9 History (`Features/History/HistoryView.swift`, new)

Door from Today. `List` of **week capsules** newest first: `Week 7 · Cut W7 · 30 Aug – 5 Sep`, meta (sessions, tonnage, sets, PR count, weight Δ), 7-dot day strip in split colours (hollow = planned, tertiary = rest). Segmented filter by era (All / Helix / PPL) reuses `Phases`. Tap capsule → **WeekDaysView**: day rows (date, split or Rest, volume, sets, steps, PRs, sleep) + a 2×4 `WeekVitalsRow` (weight Δ, fat Δ, battery, sleep score) + Export week / Report actions (existing `WeeklyExportBuilder`, `ReportReaderView`). Tap day → existing `DayScreen` for that date (Pulse layout, read-only past). Second segment **Body**: weight + composition + steps charts with a range picker (port of `BodyProgressPanel`), reusing `BodyTrendsView` sections. Calendar-jump sheet: month grid with dots.

Every week/day number here uses `WeekWindow` (§6.4), so changing week start re-cuts the whole list.

---

## 6. Engines (Track E · Fable unless stated)

### 6.1 Battery v8 — extend v7

`Scoring/Battery.swift`. Keep charge − drains; keep `maxTotalDrain < 100` invariant.

- **Morning charge** `55 + 45·q` where `q = clamp(0.55·ratio + 0.15·stagesQ + 0.15·hrvQ + 0.15·rhrQ, 0, 1)`; `stagesQ = clamp((deep+rem)/(0.45·sleepMin), 0, 1)` (45 % restorative share = 1); `hrvQ = clamp(0.5 + (hrv − hrvBaseline)/(2·hrvBaseline), 0, 1)`, 0.5 when either nil; onset trouble (`sleep_onset_trouble`) subtracts 3 from the charge.
- **Stress drain** (new, cap 10): `4·max(0, (rhr − baseline)/10) + 3·max(0, (hrvBaseline − hrv)/hrvBaseline·2) + fatigueTerm`, where `fatigueTerm` = 0/1/2/3/4 for Fresh/Fine/Worn/Heavy/Empty of the latest logged slot today.
- **Workout drain** unchanged in shape; `workoutMaxByDay` retuned legs 32 / upper 24 / arms 16 so a leg day costs a third more than upper, and `trailingAvgVolumeKg` is **wired** (last 6 same-day-key sessions from GRDB, maintenance excluded — same rule as `WidgetSnapshotBuilder`).
- New invariant: `timeMax 35 + activityCap 12 + workoutMax 32 + stressCap 10 = 89 < 100`.
- Web parity: add the same terms to `src/lib/scoring/battery.ts`, `npm run golden`, `invariant-auditor` on the diff, `scripts/recompute-scores.mjs` for stored days (memory: formula changes need it).

### 6.2 TargetResolver (global levers)

`HelixData/Targets/TargetResolver.swift` (new, `@Observable`, one instance in `AppEnvironment`). Input: `ValueObservation` over `user_goals`, `daily_targets`, `target_profiles`, `schedule_overrides`. Output: `targets(for date) -> ResolvedTargets` (kcal, P, C, F, water, steps, sleep h, lever id, profile id) via `Levers.goalsForDate` + `DailyTargets.apply`. Every gauge, widget snapshot, export and score input reads **this** and nothing else. Lever change = one outbox row + one observation tick; no view caches.

### 6.3 MacroMath (Opus-callable, but the rules are Fable)

`HelixCore/Nutrition/MacroMath.swift`: `adjust(edited: .calories(kcal))` → protein pinned, `delta = kcal − atwater(current)`, carbs/fat absorb `delta` in ratio `c·4 : f·9`, rounded to 1 g, kcal recomputed as Atwater so the sum is exact; `adjust(edited: .protein/.carbs/.fat)` → kcal = Atwater sum. Untracked macro (nil) is skipped by the ratio. Golden vectors from a TS twin in `src/lib/nutrition/macroMath.ts`.

### 6.4 WeekWindow — the weekly reset

`HelixCore/Time/WeekWindow.swift`: `WeekWindow(containing date, startDay)` → `start`, `end`, `number` (via `Week.number`), `isCurrent`, `days`. `startDay` from `Preferences.weekStartDay`. Every "this week" read (`WeekSoFar`, This-week panel, targets, export, History) takes a `WeekWindow`, never a date arithmetic of its own. `AppEnvironment` schedules a `Timer` at the next local 00:00 of the first weekday (and every midnight for day rollover) that bumps a `dayTick` published value; views observe it. Nothing is written. Changing "Week starts on" republishes and re-cuts everything.

### 6.5 Ready to progress + series builders

`Ceilings.progressionVerdict` already exists; `HelixData/History/ProgressionQueue.swift` (new) scopes it to today's day key over the last two sessions per lift. Series builders in `HelixCore/Charts/`: `E1rmSeries`, `SessionVolumeSeries(splitDay)`, `MacroAdherenceSeries(7 days)`, `VitalSeries(metric, 7/30 days)`, `dailySeries` padded to `limit`. Golden vectors for each.

### 6.6 Weekly export audit

`invariant-auditor` runs on `Reports/WeeklyExport.swift` + `WeeklyExportBuilder.swift` against `export-*` tests; the six known "reconstructed" fields (`is_pr`, `split_day`, `total_volume_kg`, `set_count`, `avg_bpm`, `calories_burned`) get read from the mirror once E-2.1 lands instead of being derived. Format stays Markdown; a `## Derived` line is added for battery and stress inputs so the AI sees the same numbers the app shows.

### 6.7 Atlas hit-testing (DOMS)

`HelixUI/Atlas/HelixAtlasHit.swift`: `muscle(at point, in rect, side) -> LandmarkMuscle?` by iterating `HelixAtlas.muscles` paths in z-order and `Path.contains`. `AtlasFigure` gains `onPick`. `accessibilityHidden` replaced by per-muscle `accessibilityElement` children with labels and severity values. Shading: 145° gradient per fill (flesh / belly / worked), 0.5 pt hairline, drop shadow under the figure; front↔back flip is a `rotation3DEffect` spring on swipe.

---

## 7. The Great Sync (Track E · Fable)

### 7.1 SyncCoordinator

`HelixData/Sync/SyncCoordinator.swift` (actor, one per app lifetime, owned by `AppEnvironment`):

- `state: .idle | .running(progress) | .failed(error)`; `lastSync: [table: Date]` persisted in a new `sync_status` GRDB table (migration `v10.syncStatus`, append-only).
- `syncNow(reason: .launch | .foreground | .pull | .realtime(table) | .healthKit)`: **order** = `resetInFlight()` → `SyncEngine.drain()` (push first so pulls do not overwrite local edits) → `HealthSync.syncRecent()` → `MirrorPuller.refresh` + `TrainingPuller.pull` → `writeDailyScore(today)` + `writeDailyScore(yesterday)` → widget timeline reload. Coalesced: a second call while running is queued once.
- Conforms to `MirrorRefreshing`; `MirrorRealtime` subscribed on sign-in, coalesced 400 ms.
- **Shipped 2.1 (2026-09-04), one departure from the order above:** the HealthKit read runs BEFORE the first drain, not after. `saveMirrorRows` is a blind upsert, so a pull between a local write and its push overwrites the write with the server's older row and the outbox then pushes that back — today's steps would vanish on every sync. Apple first, push second keeps the rule the order exists for. A realtime note goes through the same queue (never a bare single-table pull, same reason) and skips the HealthKit step.
- Hooks: sign-in resolved, `scenePhase == .active`, `.refreshable`, realtime, HealthKit write, `dayTick`.

### 7.2 First-launch backfill

`BackfillRunner` inside the coordinator: when `sync_status` is empty for a user, present `BackfillSheet` (full-screen, non-dismissable, per-table rows with row counts, elapsed, Cancel = sign out). Pulls in dependency order (`user_goals`, `plans`, `exercises` first; sessions then sets; then everything else), **paginated 1000 rows** via `.range(from:to:)` until a short page, `windowDays: nil` (cap removed from `MirrorPuller`; the type keeps the parameter for tests). History start `2026-03-10`. On completion: score recompute for the last 14 days, `.success`, dismiss. Idempotent; "Re-run backfill" in Settings clears cursors and repeats.

> **Shipped 2026-09-05 (Wave 2.3).** Two departures from the text above, both deliberate: (1) a backfill reads HealthKit **after** the pull, not before — a first launch has no local write for the pull to clobber, and `requestAuthorization` awaits the Health permission sheet, which the whole history must not sit behind; (2) the ledger is written only when every table landed, so a backfill that died halfway reads as "never synced" at the next launch and runs again from the top. The row-count gate lives in `BackfillLiveTests` (env-gated, `HELIX_LIVE_SESSION_FILE`) and a DEBUG `HELIX_SESSION_FILE` launch hook signs a fresh simulator in without a password.

### 7.3 Pagination & window removal

`PostgRESTMirrorRemote.select/selectIn` gain `range`; `MirrorPuller.since` returns nil for `.window` when `windowDays == nil`; `.delta` behaviour unchanged. `selectIn` chunks session-id lists at 200.

### 7.4 HealthKit

- `HealthSync` runs inside the coordinator, not on its own `Task`.
- Add `HKWorkout` reads for lifting sessions overlapping a `workout_sessions` window → `avg_bpm`, `calories_burned` with `*_estimated = false`; estimates (`LIFTING_MET 6.0`, median kcal/min over 90 days) ported to `Sessions/Estimates.swift` for the nil case.
- `HKObserverQuery` + `enableBackgroundDelivery` for sleep, HRV, steps `ADP`; `BGAppRefreshTask` nightly `ADP`. Code lands behind `#if HELIX_ADP`, screenshots not gated on it.

> **Shipped 2026-09-05 (Wave 2.3):** `HealthSync.syncSessionMetrics` (HelixData `Health/SessionMetrics.swift`) runs after every pull; `Estimates.swift` was already in HelixCore. `HealthObservers` compiles with `HELIX_ADP=1` in the build environment (`Package.swift` reads it); the app-side hook in `AppEnvironment` also needs `HELIX_ADP` in `SWIFT_ACTIVE_COMPILATION_CONDITIONS` and the `background-delivery` entitlement. `BGAppRefreshTask` is NOT done (app target + Info.plist, Track U at Gate 0).

### 7.5 Score persistence

`writeDailyScore` gets its production caller (7.1). `ScoringInputsBuilder` fills `trailingAvgVolumeKg`, `newPRsToday` (from `personal_records` for the date), `contextMode` (from `daily_targets`/exception day), `sessionVolumeKg` (`SessionVolume`). `daily_scores` rows enqueue to the outbox as today. Freeze rule unchanged.

### 7.6 Latency budget (honest)

Local write → repaint: < 16 ms (GRDB observation). HealthKit `syncRecent`: 150–300 ms. Supabase pull of a day's delta: 150–400 ms round trip. Outbox drain of a 30-set session: 2 requests, < 500 ms. The UI never awaits any of it; the hairline reports it.

---

## 8. Branding — Onyx

- **Name:** Onyx. Bundle display name, `CFBundleName`, App Store name, nav wordmark, export header (`# ONYX · WEEK …`). Bundle id unchanged until Gate 0 (a rename there is free; before it, it breaks the widget App Group plan).
- **Mark:** a single ring, 2 pt stroke, Lunar → Ion gradient, with a small gap at 1 o'clock (the "O" that is also a battery ring). Drawn as one `Shape` in `HelixUI/Brand/OnyxMark.swift`; replaces `HelixMark`/`HelixStrand`/`HelixRungs` in all 30 tile faces, sized 14–16 pt, 70 % opacity, top-right. Wordmark = SF Pro Display semibold, −0.03 em, "Onyx".
- **App icon prompt** (for the image model, after name lock):

> A premium iOS app icon, 1024×1024, no text. Subject: a single polished black onyx stone rendered as a perfect rounded squircle that fills the frame, its surface deep black with subtle lapidary depth, faint smoky banding visible only at the edges. Centred on the stone, a thin luminous ring — one continuous stroke about 4 % of the icon width — with a small break at the one o'clock position, glowing softly in a gradient from lavender (#A79FD6) at the top-left to indigo (#6B78F0) at the bottom-right, casting a faint glow onto the black surface. Lighting: one soft key light from the upper-left creating a delicate specular highlight along the top edge of the squircle, no other reflections. Materials: obsidian glass, matte-to-satin finish, no noise, no glitter, no chromatic aberration. Style: Apple Human Interface Guidelines icon, flat front-on view, no perspective, no drop shadow outside the squircle, no border, no bevel, no gradient background, edges perfectly clean for masking. Mood: quiet, expensive, restrained, minimal. Negative: text, letters, DNA, helix, dumbbell, heart symbol, neon, rainbow, multiple colours, clutter, 3D extrusion, plastic look.

- Widget mark placement: trailing in the face header, baseline-aligned with the caption, never on the Lock Screen accessory faces (they use the ring as the whole glyph).

---

## 9. Waves — with model routing

Rules: Opus (high) = layout, compaction, tokens, settings, data binding, logger UI. Fable (high) = math, DOMS hit-testing, chart series algorithms, physics/drag, sync engine. Each wave ends with `code-reviewer`, `graphify update .`, screenshots (`scripts/native-shot.sh`) at default + AX5, and a commit (`git-commit-helper`), `[skip ci]` by default. Est. in working days for one session each.

| Wave | Track · Model | Scope | Gate |
|---|---|---|---|
| **2.0** | U · **Opus** | **Tokens v2.** `HelixTokens` values (§3.2), `HelixSpace`, `HelixType` scale (delete literals), `HelixCorner` 10/16/28, `helixScreen` 8 %/240, `OnyxMark`, delete `HelixSurface`; tile faces onto scale with a widget-only `HelixWidgetType`; token-discipline test extended; `design-system/onyx/MASTER.md`. Skills: `ui-ux-pro-max:design-system`, `apple-design`. | `npm test` token test green; `widgets-*` shots unchanged in layout, changed in colour. 2 d |
| **2.1** | E · **Fable** | **SyncCoordinator + wiring** (§7.1, 7.3, 7.5): coordinator actor, `sync_status` migration, pagination, window removal, `resetInFlight`, realtime subscription, score persistence, `ScoringInputsBuilder` holes filled. Agents: `swift-expert`, `schema-truth-checker` before any column claim. | `swift:data` green + new coordinator tests; a device pull shows `outbox` draining. 3 d |
| **2.2** | U · **Opus** | **Shell + Today + sheets.** Tab renames (Workout/Nutrition/Pulse/Settings), inline titles, Onyx wordmark, Edit button removed, Now strip, History door stub, `DomainSheets` dedupe (Sleep, Vitals), `dailySeries` padding (one function in `Derive.swift`), pull-to-refresh → coordinator, hairline + "Synced" caption. | `today`, `today-sheet` (sleep + vitals) shots; AX5. 2 d |
| **2.3** | E · **Fable** | **Backfill + HealthKit** (§7.2, 7.4): `BackfillRunner`, `BackfillSheet` model, `HKWorkout` HR/kcal, `Estimates.swift`, `#if HELIX_ADP` observers. | Fresh install on simulator with a seeded remote pulls every table; row counts match `select count(*)` via `schema-truth-checker`. 3 d |
| **2.4** | U · **Opus** | **Live Logger overhaul** (§5.3): `fullScreenCover(item:)`, off `HelixPalette` (then delete it), nav-bar rest timer, 44 pt rows, inline steppers, swipe-to-log with haptics, deck, finish sheet → summary. `PreviewHarness` + SCREENS gain `logger`, `logger-finish`. Skill: `apple-design` §3, §5, §9. | `logger` shots; `LoggerModelTests` green; Live Activity still updates. 3 d |
| **2.5** | E · **Fable** | **TargetResolver + MacroMath + WeekWindow** (§6.2–6.4) + midnight `dayTick`; TS twins + golden vectors; `invariant-auditor` on levers/targets. | `swift:core` + `golden` green; lever change on device repaints Nutrition without relaunch. 2 d |
| **2.6** | U · **Opus** | **Nutrition tab** (§5.6): Calories/Macros/Water cards, long-press `MacroEditSheet` bound to `MacroMath`, context chips, 7-day strip, `NutrientsView`, deletions. | `fuel`, `fuel-over`, `fuel-empty`, new `nutrients`, `macro-edit` shots. 2 d |
| **2.7** | E · **Fable** | **Series builders + Ready-to-progress + atlas hit-testing** (§6.5, 6.7): `E1rmSeries`, `SessionVolumeSeries`, `MacroAdherenceSeries`, `VitalSeries`, `ProgressionQueue`, `HelixAtlasHit`, shaded `AtlasFigure` with `onPick`. | vectors green; `HelixUITests` hit-test table (16 muscles × 2 sides). 3 d |
| **2.8** | U · **Opus** | **Workout tab + Post-workout page + Library** (§5.2, 5.4, 5.5): This week panel, compact today, cardio row, Ready-to-progress box, `SessionDetailView` rebuild, ledger, `ExerciseDetailView` charts, entry points (decision 8). Skill: `dataviz`. | `train`, `session`, `exercise-history`, `library` shots; finishing a session in the simulator pushes the summary and updates the Library stats without relaunch. 4 d |
| **2.9** | U · **Opus** | **Pulse tab** (§5.7): Now strip, sleep arc + stage grid, vitals list with sparklines, fatigue row + sheet, DOMS tappable body (binds 2.7), scale row, deletions; cardio out. | `day`, `day-empty`, `doms` shots; AX5. 3 d |
| **2.10** | E · **Fable** | **Battery v8** (§6.1): Swift + TS twins, golden vectors, `invariant-auditor`, `recompute-scores.mjs` dry run then run; export audit (§6.6). | invariant test `89 < 100`; auditor report clean; export tests green. 2 d |
| **2.11** | U · **Opus** | **Settings + History** (§5.8, 5.9): renames, levers re-skin, week start wired to `WeekWindow`, Sync status section, `HistoryView`/`WeekDaysView`/calendar jump/Body segment; delete Pathfinder. | `you`, `levers`, `history`, `history-week`, `sync-status` shots. 3 d |
| **2.12** | U · **Opus** | **Widgets + Live Activity + brand**: all faces on tokens v2 + `OnyxMark`, `ContentState` gains `prsThisSession`, `setsDone`, `setsPlanned`; rest-skip `AppIntent` button; app icon asset from the generated image; display name Onyx; `APP_STORE.md` refreshed. Agent: `ios-developer`. | `widgets-*` shots; Live Activity screenshot on device; Release build (`ios-build-verify-command` memory). 2 d |
| **2.13** | both | **Ship gate**: `capacitor-apple-review-preflight` checklist (native sections only), `security-review`, full shot loop default + AX5, `code-reviewer` on the phase diff, memory + `docs/` refresh, `graphify update .`. | Every screen in SCREENS has a current PNG; `npm test`, `swift:core`, `swift:data` green; Release build clean. 1 d |

Critical path: 2.0 → 2.2 → 2.4 → 2.6 → 2.8 → 2.9 → 2.11 → 2.12 → 2.13 (Track U, ~24 d). Track E runs 2.1 → 2.3 → 2.5 → 2.7 → 2.10 (~13 d) and is always ahead of the U wave that binds it; if a U wave arrives first, it binds to a stub `protocol` and E fills it.

---

## 10. Tracks & merge recipe

- **Track U** — Opus, `feature/native-migration-wave-1`, owns `native/HelixNative/`, `native/HelixNativeWidgets/`, `native/Packages/HelixUI/`, `scripts/native-shot.sh`, `native/__screenshots__/`.
- **Track E** — Fable, worktree `.claude/worktrees/track-s` on `track-s/sync` (exists; memory `track-s-worktree`), owns `native/Packages/HelixCore/`, `native/Packages/HelixData/`, `src/lib/**` TS twins, `src/tests/golden-vectors.test.ts`, fixtures. Exception: 2.7's `HelixAtlasHit.swift` lands in HelixUI from Track E as a single new file, announced in the commit.
- Merge per wave: `git merge origin/feature/native-migration-wave-1` into `track-s/sync`, run `swift:core` + `swift:data`, then `git push origin track-s/sync:feature/native-migration-wave-1`. Pushes stay batched with `[skip ci]` (memory `batch-pushes-not-per-part`).
- Never edit the same package from both tracks in one wave. `Shared/HelixWorkoutAttributes.swift` is Track U only (2.12).

---

## 11. Verification

Per wave (in the gate column) plus, at 2.13:

1. `npm test` (token discipline, golden staleness, atlas parity, export layout), `npm run swift:core`, `npm run swift:data`.
2. `scripts/native-shot.sh` full SCREENS list including the new `logger`, `logger-finish`, `nutrients`, `macro-edit`, `doms`, `history`, `history-week`, `sync-status`; review every default + `-ax5` PNG against §3.6.
3. Device run (simulator is enough before ADP): sign in → backfill sheet completes → History shows weeks back to March → start a workout → log a set by swipe → finish → summary pushes → Library stats and Today tiles reflect it → change lever in Settings → Nutrition gauges repaint → pull-to-refresh shows hairline then "Synced".
4. `schema-truth-checker` confirms `sync_status` is local-only (no server DDL in this phase) and that row counts after backfill equal `count(*)` per table.
5. `invariant-auditor` clean on battery, levers, macro math, export.
6. Release build: `xcodebuild … -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` (never `-sdk iphoneos`).

---

## 12. Commands

```bash
cd native && xcodegen generate                      # after any project.yml change
npm run swift:core && npm run swift:data            # package gates
npm run golden                                      # after any TS formula change (E)
scripts/native-shot.sh <screen>                     # default + AX5 PNGs
SHOT_AX=0 scripts/native-shot.sh logger             # quick single shot
graphify update .                                   # after every code change
```

## 13. First actions on approval

1. Copy this file to `docs/NATIVE_PHASE_2_PLAN.md`; add a one-line "superseded by Phase 2 for design + sync" note at the top of `docs/NATIVE_MIGRATION_PLAN.md` §3.
2. Write memory `phase-2-plan` (name Onyx, decisions table, track split, wave order).
3. Start **2.0** (Opus) and **2.1** (Fable) in parallel.
