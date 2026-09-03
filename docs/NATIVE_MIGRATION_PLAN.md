# HELIX — Native Migration: the Ultra Plan

**Status:** live architecture document and the authority for every native session. Point new sessions here first, then at `native/README` if one exists.
**Adopted:** 2026-09-03 (supersedes the 2026-09-02 plan) · **Branch:** `feature/native-migration-wave-1`
**Target:** App Store 1.0 (iPhone + widgets) in **~9 weeks**; Watch logging client as 1.1 three weeks later (~12). Down from 13–18.

---

## 0. Why this rewrite of the plan

The 2026-09-02 plan was correct on architecture and wrong on speed. It serialised seven waves behind one screenshot-gated UI track, and it treated the Apple Developer Program as a late gate. Three facts from the full codebase map change the ordering:

1. **Domain code is headless and already 2,111-vector-proven.** Porting the remaining ~19k loc of pure TypeScript needs no screenshots, no device, no signing. It can run in a second worktree the whole time the UI track is busy. Serialising it was the biggest waste in the old plan.
2. **~7,000 loc of shipping SwiftUI widget drawing lifts nearly as-is** once an App Group exists. The dashboard tiles and the Home Screen widgets should be *one* implementation in a shared package. Building the dashboard before the widget lift (old Wave 2 before old Wave 7) meant drawing every tile twice.
3. **The $99 membership deletes ~2,400 loc on day one** (`/api/widget/snapshot` 832, `HelixSnapshot.swift` 690, `SecureStore` 96, `HelixWidgetBridge` 64, `HelixBackgroundRefresh` 101, `widget_tokens`, token plumbing) and is a hard prerequisite for the App Store anyway. It is Gate 0, not Gate B.

Everything below is built on the map in §2. The founder decisions of 2026-09-02 stand except **decision 6** (Watch moves to 1.1) and **Gate A/B** (collapsed into Gate 0).

---

## 1. Decisions

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Swift knowledge | Zero | Tests are the review; comments teach; every increment installable. Unchanged. |
| 2 | Velocity | Maximum | **Three parallel tracks** (§4), not one serial line. |
| 3 | Screens cut | None; no desktop | 9 `xl:` + 3 `lg:` occurrences. Never built in Swift. `Sidebar.tsx` is not ported. |
| 4 | Smart stacks | Keep, native redesign | Built on `TabView(.page)` + WidgetKit families, from the *same* tile views as the widgets. |
| 5 | iPad | No | Unchanged. |
| 6 | Watch | **Full logging client, shipped as 1.1** | Event log + pencil already exist (Wave 1b shipped). Watch UI leaves the 1.0 critical path. |
| 7 | Reports | `WKWebView` for rendering; `buildWeeklyExport` ported to Swift | ~950 loc stays HTML, ~2,750 loc ports (§2.4). |
| 8 | Data | GRDB + SQLite + outbox, multi-writer | Confirmed. **The outbox has no drainer today** — Track S item 1. |
| 9 | Tenancy | Single user | Unchanged. |
| 10 | Visual review | Screenshot loop | **A native `visual-check` sibling is built in Wave 0** (§5.0). |
| 11 | **Design** | **Obsidian Glass — not a clone** | §3. Every screen is re-designed, not transliterated. |
| 12 | **Colour scheme** | Dark-only 1.0 | Semantic tokens from day one so light mode is a 1.x token file, not a rewrite. |
| 13 | **Apple Developer Program** | **Buy at Wave 0** | App Group, Keychain sharing, TestFlight, push. Deletes ~2,400 loc immediately. |

---

## 2. The codebase map (measured 2026-09-03)

`src/` = 553 files / 101,515 loc. `native/` = 48+ Swift files / ~8,900 loc (125 tests), plus the in-flight Wave 1b work: Live Logger UI (`LoggerModel`, `ExerciseCardView`, `AtlasFigure`), `native/Shared/` (ActivityKit attributes in both targets) and a `HelixNativeWidgets` extension with one face, the Live Activity. `ios/App/` = 9,712 loc legacy Capacitor Swift.

**Wave 1b state (from the session shipping it, see Appendix A):** event log ✅ · pencil ✅ · logger UI ✅ · **sync ⏳**. Known translation gaps: local `workout_sets.set_index` is `set_number` on the server; local `workout_sessions.date` has no server column. `muscleMap.ts` is deliberately not ported yet; each lift in `Program.swift` carries a copied answer until the exercise library lands.

### 2.1 Four buckets

| Bucket | What it is | loc (approx) | Fate |
|---|---|---|---|
| **WEB-SIM** | Code that exists only to fake native behaviour inside a WKWebView | ~5,900 | **Never ported.** Replaced by a SwiftUI modifier or container. |
| **HEAVY-DOMAIN** | Arithmetic, rules, state machines. Pure or extractable. | ~28,000 (19k in `lib/`, ~9.5k trapped inside components) | **Ported with golden vectors.** Track D. |
| **EASY-UI** | Thin presentational components with a stock SwiftUI equivalent | ~4,800 | **Redesigned**, not translated. Track U. |
| **DEAD** | Unreferenced now | 111 (`components/training/RestTargetControl.tsx`) | Delete at Wave 9 with the rest. |

### 2.2 WEB-SIM — the delete list (never build these)

| Today | loc | SwiftUI replacement |
|---|---|---|
| `ui/Sheet.tsx` + `ui/overlay.tsx` (28 call sites) | 472 | `.sheet` + `.presentationDetents` + `.presentationBackground(.thinMaterial)` |
| `ui/PullToRefresh.tsx` | 301 | `.refreshable {}` |
| `nav/*` (BottomNav, Sidebar, AppBar, NavChevron) | 404 | `TabView`, `.toolbar`, system back |
| `lib/nav/*` (edge swipe, scroll memory, transition) | 437 | `NavigationStack` |
| `lib/motion/*` + `providers/MotionProvider` | 306 | `HelixMotion.swift` (exists; Apple's own spring values) |
| `providers/QueryProvider`, `lib/query/workoutKeys`, tanstack persister | 395 | GRDB `ValueObservation` — the cache invalidates itself |
| `providers/SerwistRegister`, `sw.ts`, `/api/version`, `app/global-error`, `app/error`, `CrashRecorder`, `ReloadHome`, `AnimatedBento`, `fx/*` | ~700 | Nothing. No stale-bundle bug class in a signed binary. `MetricKit` for crashes. |
| `command-center/{LiveSessionPill, LiveSessionBar, DatePickerPopover, ExerciseDeckList}` | 811 | Live Activity, `.toolbar` collapse, `DatePicker(.graphical)`, `List.onMove` |
| `dashboard/StackSheet` + the gesture half of `WidgetGrid` (StackFaces) | ~450 | `TabView(.page)` + `.draggable`/`.dropDestination` |
| `launch/LaunchSurface`, `app/template.tsx`, `app/layout.tsx` inline script, `loading.tsx` ×2 | ~370 | Launch storyboard; `@AppStorage` |
| `lib/native/*` (Capacitor bridges: healthkit, sync, liveActivity, widgets, haptics, deepLink) | 945 | Direct HealthKit / ActivityKit / WidgetCenter / `.sensoryFeedback` / `.onOpenURL`. **The payload types survive** (§2.5). |
| `lib/supabase/client.ts` two-tier storage, `AuthGate` | 206 | `KeychainAuthStorage.swift` (done) |
| All 6 `src/app/api/*` routes | 1,173 | **Zero need a server equivalent** (§2.6). |
| 26 `localStorage` keys / ~230 call sites | — | GRDB tables + `@AppStorage`. Legacy `apex_*` keys die. |

### 2.3 HEAVY-DOMAIN — what ports, and what has no vectors yet

Already ported with vectors (2,111 cases): `battery`, `readiness`, `energy`/TEF, `phase`, `exceptionDay`, `epley`, `day`/LogicalDay. Ported *without* vectors: `landmarks` (structural tests only), `programs` deck.

**Un-vectored, ranked by risk × loc — Track D works this list top-down:**

| # | Module | loc | Why it matters |
|---|---|---|---|
| 1 | `scoring/score.ts` (all component scores, `computeAlerts`) | 443 | Largest un-vectored arithmetic surface; no Swift file exists. |
| 2 | `training/prEngine.ts` + `prTruth.ts` + `prSeed.ts` | 1,189 | 4-axis PR detection; `prFloorFor` not raw `PR_TRUTH`; 808 loc of TS tests to convert. |
| 3 | `nutrition/levers.ts` + `maintenance.ts` + `context.ts` + `profiles.ts` + `dailyTargets.ts` | 1,190 | `leverForDate`, Atwater-exact triples, lever ≠ phase axis. |
| 4 | `training/ceilings.ts` + `effort.ts` + `setTags.ts` + `restTargets.ts` (pure half) | 1,182 | Progression verdicts, CR10 ladder, set quality, rest prescription. |
| 5 | `sessions/volume.ts` + `draft.ts` pure fns + `nextSet` + `prevAlign` + `livePrs` + `estimates` + `sessionElapsed` + `sessionClock` model | ~1,400 | Unilateral-pair scored ONCE at the weaker side; the highest bug-per-line file in the repo. |
| 6 | `dashboard/layout.ts` slot algebra | 924 | `stackSlots`/`canStack`/`resizeSlot`/`moveSlot`/`sizesFor`. `WidgetGrid.tsx` evaporates; this does not. |
| 7 | `reports/weeklyExport.ts` + `derived.ts` + `weekJson.ts` + `weekNumber.ts` | 2,782 | Deterministic string output — trivially fixturable, never was. |
| 8 | `body/{composition, deltaVerdict, compGap, weighIn}` | 422 | Three deliberate asymmetries in `deltaVerdict`; `null` skip reason = "As Planned". |
| 9 | `coach/insights.ts` | 446 | Explicitly deterministic; ideal fixture. |
| 10 | `cardio/*`, `sleep/nightWindow`, `schedule/{swap,layout}`, `charts/{scale,muscleAggregate,intensityCalendar}`, `widget/derive`, `exercises/*`, `phases.ts`, `supplements.ts`, `types/workout.ts`, `utils/{week,setFormat,measure,format}` | ~2,900 | Smaller, all pure. |
| 11 | **Logic trapped inside components** — extract to `lib/` in TS first, vector it, then port: `ExerciseCard.groupSets` + `STATUS_META`, `SetEditorRow` plate ladder (2.5 / 0.25 microload), `MuscleDistribution.draftMuscleSets/draftPhysicalSets`, `ProgressionAlerts.scopeToDay`, `setGrid.ts`, `parts.mean/vsBaseline`, `PlanWidgets.ledgerWindow/consistencyWindow`, `FuelWidget.nutrientRisk`, `DailyWidgets.stepMarks` + slot scheduling, `ExerciseBreakdown.{toRows,progressionCue,exerciseStats}`, `SessionHighlights.{strongestOf,highlightsOf}`, `MetricGrid.pctOf`, `VolumeChart.resolveChartSplit`, `BodyCompositionChart.mergeBodyComposition`, `day/InBody` mass derivation, `SleepDebtGauge` 14-night decay, `RealtimeProvider` table→invalidation map | ~2,500 | Extraction is a TS refactor with existing tests as the net; the port follows. |

Rule unchanged: **any domain module without golden vectors does not ship.** `jsRound`, never `rounded()`.

### 2.4 Reports split (decision 7, measured)

- **Ports to Swift (~2,750 loc):** `buildWeeklyExport`, `derivedWeek`, `weekJsonBlock`, `weekNumber`, `fmtV2.parseTargets` + `targetMatch` (they feed the *logger*, not the report page).
- **Stays HTML inside a `WKWebView` (~950 loc):** `MarkdownView`, `FmtV2Report`, `smartBlocks`, react-markdown + remark-gfm. Built once as a static bundle in the app, loaded from the `reports.report_md` column.

### 2.5 Native contracts that survive verbatim

- `lib/native/healthkit.ts` `METRIC_MAP` (31 quantity types with reducer + scale: SpO2 ×100, BodyFat ×100, LeanBodyMass → `fat_free_mass`) and `READ_TYPES` — this exact set is the `requestAuthorization` argument.
- `lib/native/liveActivity.ts` `WorkoutActivityState` is `ActivityAttributes.ContentState` (`spark` capped at 12). `ios/App/Shared/HelixLiveActivity.swift` lifts as-is.
- `lib/widget/snapshot.ts` shape + `derive.ts` arithmetic + `cadence.ts` refresh schedule → the WidgetKit `TimelineProvider` policy.
- `lib/native/widgetKinds.ts` `WIDGET_KINDS` (WidgetKit budgets reloads per kind).
- `lib/native/deepLink.ts` `safePath` allow-list (a trust boundary). `/nutrition/micros` alias must stay routable until the old widget binary is off the phone.
- `lib/ingest/dailyLog.ts` validation + column mapping (`standToHours`, unit scales) — becomes the HealthKit → GRDB write path.
- `ios/App/HelixWidgets/*` drawing (~7,000 loc) — lifts into `HelixUI` with the palette swapped (§3).

### 2.6 API routes — none survive

| Route | loc | Native answer |
|---|---|---|
| `widget/snapshot` | 832 | Widgets read the App Group GRDB store. Delete route + `widget_tokens`. |
| `sessions` | 116 | Outbox → PostgREST. PR math from `save.ts` ports to HelixCore first. |
| `compute-score` | 93 | `HelixCore.Battery` + `Readiness` on-device; write `daily_scores` via outbox. |
| `ingest` | 59 | HealthKit → GRDB → outbox. No hop. |
| `today` | 55 | A latency patch for a client with no local DB. GRDB reads. |
| `version` | 18 | App Store versioning. |

**One thing Netlify does that must outlive it:** serving `/.well-known/apple-app-site-association` (webcredentials) for Password AutoFill. Wave 9 moves it to any static host on the same domain before the Netlify site is deleted.

### 2.7 Schema truth

`lib/supabase/types.ts` declares 17 tables; the app queries **29**. Fourteen call sites are silently `any`. **The GRDB mirror is generated from the live database via `schema-truth-checker`, never from `types.ts`.**

---

## 3. The Design Mandate — Obsidian Glass

**The native app is not a port of the web app's look.** It is inspired by HELIX's identity (dark, data-dense, one accent per domain, the body atlas) and is otherwise new. `HelixPalette.swift` / `HelixType.swift` / `HelixSurface.swift` as they exist today are a Tailwind transliteration (hex constants, `white/[0.03]` fills, CSS `clamp()` frozen at 390 px). **They are replaced in Wave 1, not extended.**

### 3.1 Material, not paint

- **Base:** true black `#000000` (OLED) with a single `MeshGradient` bleed per domain at ≤ 12 % opacity behind the top of every screen. Nothing else is painted a colour.
- **Layers:** hierarchy is *material weight*, not border lines. `ultraThinMaterial` for tiles and rows; `thinMaterial` for sheets; `regularMaterial` for navigation chrome. Never stack two light materials. Hairlines are 0.5 pt at 8 % white and only where content meets chrome.
- **Depth:** shadows are large, soft and darker over busy content (`shadow(color: .black.opacity(0.35), radius: 24, y: 12)` for sheets; none on rows).
- **Corners:** `.continuous` squircles, concentric — inner radius = outer radius − padding. Tiles 20 pt, sheets 32 pt, rows 12 pt.
- One modifier owns all of this: `helixGlass(_ level: GlassLevel)`. If the deployment target ever rises to iOS 26, `glassEffect` replaces the body of that one modifier and nothing else moves.

### 3.2 Colour — four domain accents, semantic tokens only

| Domain | Name | Mesh stops | Used for |
|---|---|---|---|
| Train | **Ion** | `#7C5CFF → #38E1FF` | logger, PRs, volume, muscle |
| Fuel | **Solar** | `#FFB13D → #FF5E7A` | nutrition, levers, water |
| Body | **Tide** | `#3DFFB0 → #12C2B0` | composition, atlas intensity, cardio |
| Recover | **Lunar** | `#B9A7FF → #DCEBFF` | sleep, readiness, fatigue, DOMS |

- Text: `primary` white 92 %, `secondary` 62 %, `tertiary` 38 % (tertiary only for non-essential labels — it fails 4.5:1 by design). Danger `#FF453A` (system red, dark variant). Warm-up / failure / drop-set / PR set states derive from the domain accent's mesh at fixed offsets, never from a fifth hue.
- **No raw hex in any view.** Views use `Color.helix.*` semantic tokens. `palette-discipline` gets a Swift twin test that greps `Features/` for `0x` and `Color(red:`.
- The 16 landmark-muscle ramp stays a *ramp* (family hue × step × alpha) but re-keyed onto the four accents: chest/arms/shoulders → Ion, back/legs → Tide, core → Lunar. The atlas geometry does not change.

### 3.3 Typography

- System font only, but *used*: `.largeTitle` display with `.fontWeight(.semibold)` and `-0.02em` tracking; body at `0`; captions at `+0.01em`. Tracking is size-specific — never one value.
- **Numerals are the product.** Every number is `.fontDesign(.rounded).monospacedDigit()` and animates with `.contentTransition(.numericText())`. Hero numbers (readiness, load, kcal) use `.system(size: 56, weight: .bold, design: .rounded)` with `-0.03em`.
- Dynamic Type is mandatory and layout scales with it (`@ScaledMetric`, no fixed heights). Largest accessibility size is a screenshot in every UI wave's gate.

### 3.4 Motion & feedback

- `HelixMotion.swift` stays (Apple's own values: move 0.4/1.0, flick 0.4/0.8, drawer 0.3/0.8). Bounce only after a gesture that carried momentum.
- Feedback on touch-**down** (`HelixPressStyle`, scale 0.96, 100 ms). Every drag tracks 1:1 and is interruptible; SwiftUI springs re-target from the presentation value for free — never use `withAnimation(.linear(duration:))` on anything a finger can touch.
- Haptics through `.sensoryFeedback`: `.impact(.soft)` on set logged, `.success` on session finished / PR, `.selection` on steppers. Nothing else. Sound never.
- `accessibilityReduceMotion` swaps every spring for a 200 ms cross-fade. No looping ambient motion.

### 3.5 Structural differences from the web (the "not a clone" checklist)

A screen passes design review only if it differs from its web ancestor in at least these ways:

- **Today:** tiles are WidgetKit families (`small` 2×2, `medium` 4×2, `large` 4×4) laid out by `Grid`; smart stacks are `TabView(.page)` with page dots; edit mode is the iOS jiggle (`.symbolEffect(.wiggle)` on iOS 18) entered by long-press; no separate "desktop" layout exists.
- **Logger:** one scrolling deck, sets are inline rows with steppers (no modal set editor); the rest timer lives in the navigation bar *and* the Live Activity; the finish flow is a `.presentationDetents([.medium, .large])` sheet.
- **Day / Fuel:** `Form`-based with `Section` headers as domain accents, `LabeledContent` rows, `Gauge` for macros (native `.accessoryLinearCapacity` style, tinted by mesh), `DatePicker(.graphical)` for the date.
- **Charts:** Swift Charts with `.chartScrollableAxes(.horizontal)` and `.chartXSelection` — no custom scrub legend, no custom tooltip.
- **Settings:** stock `Form`, stock `Toggle`/`Stepper`/`Picker`, one `Section` per concern.
- **Navigation:** `TabView` with five tabs (Today · Train · Fuel · Body · You); `NavigationStack` per tab; sheets for everything modal; `.searchable` on the exercise library.

### 3.6 Skills that govern every UI task

`apple-design` (principles §1–§17 apply directly; its CSS is ignored) · `ui-ux-pro-max:ui-ux-pro-max` with `--stack swiftui` for every screen and its `references/pro-rules.md` pre-delivery checklist at every UI gate · `frontend-design` for aesthetic intent when a screen "looks templated" · `ui-ux-pro-max:design-system` once, in Wave 1, to persist `design-system/helix-native/MASTER.md`.

---

## 4. The three tracks

```
week   0  1  2  3  4  5  6  7  8  9  10 11 12 13
U  ▓W0│▓▓W1 Logger │W3 tabs│▓▓W4 Day/Fuel│W5 lift│▓▓▓W6 Today│▓▓W7 Charts│W8 ship│W9 retire│
S     │▓▓▓W2 sync spine     │ (drain, mirror, HK, realtime, score)  │ background sync  │
D     │▓▓▓▓▓▓▓▓▓▓▓ Track D: domain port, vectors first, top-down §2.3 ▓▓▓▓▓▓▓│
W                                                                    │▓▓▓▓▓ W10 Watch 1.1 ▓▓▓▓│
```

- **Track U (UI)** — sequential, screenshot-gated, one session at a time on `feature/native-migration-wave-1`.
- **Track S (Sync/Data)** — headless, `swift:data` tests as the gate, runs in a worktree (`superpowers:using-git-worktrees`) and merges at the end of each wave.
- **Track D (Domain)** — headless, `swift:core` + golden vectors as the gate, runs in a second worktree. Consumes §2.3 top-down. UI waves *pull* modules from it; if a UI wave needs a module Track D hasn't reached, the UI session ports that module first, vectors first.

Each track is a separate Claude session. They never edit the same package: U owns `native/HelixNative/` + `HelixUI`; S owns `HelixData`; D owns `HelixCore` + `src/tests/golden-vectors.test.ts`.

---

## 5. Waves

Estimates assume max velocity and the three tracks running. "Gate" is what must be true to start the next UI wave.

| Wave | Track | Scope | Est. |
|---|---|---|---|
| **0** | all | Gate 0: buy ADP; App Group + Keychain sharing; targets in `project.yml`; native visual-check; schema from live DB; `native` skill rewritten | 3 days |
| **1** | U | **Design Language + Live Logger re-skin** (the logger UI already ships; it becomes the design-system prototype). Gate A: daily driver for training | 1.5 wks |
| **2** | S | **Sync spine**: outbox drainer, 29-table GRDB mirror, realtime, HealthKit direct, on-device score | 2 wks ∥ |
| **3** | U | **Cheap tabs**: You (Settings, Levers, Plan, Body targets), Exercise library, Reports (WKWebView), Auth polish | 1 wk |
| **4** | U | **Day + Fuel**: `/day/[date]`, nutrition, macros, water, fatigue, DOMS, supplements, cardio logger, swap day | 1.5 wks |
| **5** | U | **Widget lift** onto App Group + `HelixUI` tiles (re-skinned). Old widget binary retired | 1 wk |
| **6** | U | **Today**: dashboard from `HelixUI` tiles + smart stacks + insights + week-so-far | 2 wks |
| **7** | U | **Charts**: Pathfinder, session analysis, exercise history, progression trail, body composition | 1.5 wks |
| **8** | U | **App Store 1.0**: preflight, privacy manifest, screenshots, metadata, submit | 3 days |
| **9** | all | **Retire the web**: delete `src/`, `ios/App/`, API routes, Netlify (after AASA moves), Capacitor deps; keep golden generator until last | 3 days, after 2 wks daily use |
| **10** | W | **Watch 1.1**: logging client, rest timers, `HKWorkoutSession`, WCSession handoff, palette collapse | 3 wks |

**1.0 in the store: ~9 weeks. 1.1 with Watch: ~12.** TestFlight from Wave 1 onward (Gate 0 makes it possible).

**Do not collide with the live Wave 1b session.** Wave 0 and Track D start immediately in worktrees; Wave 1 (Track U) starts when the 1b session commits its sync work or hands off, whichever first. Wave 2 absorbs whatever part of the sync 1b leaves open.

### Wave 0 — Gates & tooling (3 days)

1. **Buy the Apple Developer Program.** Add `com.apple.security.application-groups` (`group.app.helix.health`) and `keychain-access-groups` to `project.yml`; add `HelixWidgets` and (skeleton only) `HelixWatch` targets; `xcodegen generate`; install.
2. **Native visual-check.** `scripts/native-shot.sh`: build for simulator, launch, deep-link to a screen via `helix://open?path=`, `xcrun simctl io booted screenshot native/__screenshots__/<screen>.png` at 393×852 and at AX5 text size. Plus `#Preview` blocks on every view. No snapshot library — `git diff --stat native/__screenshots__` is the diff. Document it in the rewritten `native` skill.
3. **Schema truth → GRDB.** `schema-truth-checker` dumps all 29 tables; Track S generates `Models.swift` from that dump. `columnNamesMatchPostgres` extends to every table.
4. **Rewrite `.claude/skills/native/SKILL.md`** for `native/` (XcodeGen, SPM scratch path, the shot loop, target membership). The Capacitor content moves to a `legacy` section that Wave 9 deletes.
5. **Design system seed.** Run `ui-ux-pro-max --design-system --persist -p "HELIX Native" --output-dir .` with the Obsidian Glass tokens from §3 hand-corrected into `MASTER.md`. This file is the reference for every UI session.
6. **Golden-vector sprint start** (Track D): `score.ts`, `volume.ts`, `dashboard/layout.ts` vectors written first — the three the map flagged.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| ADP + entitlements + targets | `native` (rewritten), `git-commit-helper` | `ios-developer` | `xcodebuild` BUILD SUCCEEDED, installs, App Group container path prints |
| native visual-check | `native`, `ui-ux-pro-max:ui-ux-pro-max` (`--stack swiftui`) | `ios-developer` | one PNG per existing screen in `native/__screenshots__` |
| schema → GRDB | `schema`, `supabase-postgres-best-practices` | `schema-truth-checker` (read), `swift-expert` (write) | 29 tables in `Models.swift`; `swift:data` green |
| `native` skill rewrite | `graphify` (query first), `native` | — | skill loads; `graphify update .` clean |
| design-system seed | `ui-ux-pro-max:design-system`, `apple-design`, `frontend-design` | — | `design-system/helix-native/MASTER.md` exists with §3 tokens |
| vector sprint | `graphify` | `invariant-auditor` | `npm run golden` writes `score.json`, `volume.json`, `dashboard-layout.json`; `swift:core` fails until ported (expected) |

### Wave 1 — Design Language + Live Logger re-skin (1.5 weeks) · Gate A

The logger is the prototype that *discovers* the design system (apple-design §17). `LoggerModel` + `ExerciseCardView` + `AtlasFigure` (shipped by the 1b session) are the starting point; their chrome is rebuilt on `helixGlass`.

1. Replace `HelixPalette/Type/Surface` with `HelixTokens.swift` (semantic colours, four meshes, type roles) + `HelixGlass.swift` (`helixGlass(level)`) inside a new `native/Packages/HelixUI` package (shared by app and widgets later). Delete the Tailwind transliteration.
2. Port Wave-1 domain dependencies via Track D: `effort` (RPE ladder), `setTags`, `restTargets` pure half, `volume`, `nextSet`, `prevAlign`, `livePrs`, `sessionClock` model, `estimates`, `groupSets` + `STATUS_META` (extract first), plate ladder, `setGridFor`.
3. Screens: Train tab (today's session or start CTA) → Deck (one `List`, inline set rows with steppers, superset grouping, previous-set ghost) → rest timer in toolbar + `TimelineView` → set-type `Menu` → finish sheet (`.medium/.large` detents) → session summary. Live Activity from `HelixLiveActivity.swift` lifted as-is.
4. Writes go through `EventStore` (exists). The outbox fills; Track S drains it in Wave 2. Until then the web app still commits sessions — **Gate A flips when the drainer lands**, not before.
5. Wake lock (`isIdleTimerDisabled`) only while a session is live; the 10 s foreground re-entrancy guard from `sync.ts` is kept.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| `HelixUI` tokens + glass | `apple-design`, `ui-ux-pro-max:design-system`, `frontend-design` | `swift-expert` | Swift `palette-discipline` twin passes; 0 raw hex in `Features/` |
| domain pulls | `graphify` | `swift-expert`, `invariant-auditor` | vectors green in `swift:core` for every pulled module |
| deck + set rows | `apple-design`, `ui-ux-pro-max:ui-ux-pro-max` (`--stack swiftui`, then `pro-rules.md` checklist) | `ios-developer`, `swift-expert` | shots at default + AX5; touch targets ≥ 44 pt; `reduceMotion` shot |
| rest timer + Live Activity | `native`, `apple-design` | `ios-developer` | timer survives background; Lock Screen card matches deck state |
| finish + summary | `ui-ux-pro-max:ui-ux-pro-max` | `ios-developer` | event log shows the session; `swift:data` green |
| review | `code-reviewer` | `caveman:cavecrew-reviewer` | no severity ≥ major open |
| ship | `git-commit-helper` | — | one commit per screen; `graphify update .` |

### Wave 2 — Sync spine (2 weeks, parallel with 1 and 3)

1. **Outbox drainer** — `SyncEngine` actor: pending → PostgREST upsert with the idempotency key → `done`; exponential backoff on `attempts`; runs on foreground, on `NWPathMonitor` regain, and every 15 min via `BGAppRefreshTask`. Session commit = `workout_sessions` + `workout_sets` + PR rows (PR math ported from `save.ts` first). **First job: the local↔Postgres translation 1b left open** — `set_index` ↔ `set_number`, `workout_sessions.date` (derive from `started_at` in the user's logical day; do not add a server column), and every other mismatch `schema-truth-checker` finds in the Wave 0 dump.
2. **29-table mirror** — `NutritionSync`'s four-query pull generalised: one `Puller` per table group (training, daily, body, plan, reports). Pull is delta by `updated_at` where the column exists (verify with `schema-truth-checker`; add where absent via paste-SQL).
3. **Realtime** — Supabase channel → the `RealtimeProvider` table→scope map ported → targeted re-pull. GRDB `ValueObservation` does the rest.
4. **HealthKit direct** — `METRIC_MAP` verbatim; `HKStatisticsCollectionQuery` per day → `ingestDailyLog` rules ported → `daily_logs` + fan-out tables locally → outbox. Yesterday-closeout rule kept.
5. **On-device score** — `Battery` + `Readiness` (ported) + `score.ts` (Track D item 1) → `daily_scores` row → outbox. Finalised-day freeze kept. `/api/compute-score` unused from here.
6. **Preferences** — `@AppStorage` for units, week start, track-RPE, active plan/phase; mirrored to `user_goals` through the outbox like `prefsSync.ts` did.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| drainer | `capacitor-offline-first` (principles only: conflict rules, backoff), `supabase-postgres-best-practices` | `swift-expert` | `swift:data`: replay is a no-op; kill mid-drain and re-run → identical rows |
| mirror | `schema` | `schema-truth-checker`, `swift-expert` | every table round-trips a live row through `Codable` untouched |
| realtime | `supabase-postgres-best-practices` | `swift-expert` | a web-app write appears on device < 2 s |
| HealthKit | `native` | `ios-developer`, `invariant-auditor` | SpO2 stored ×100; LeanBodyMass lands in `fat_free_mass`; parity with web ingest on one day |
| score | `graphify` | `swift-expert`, `invariant-auditor` | `score.json` vectors green; on-device row equals server row for 7 days |
| paste-SQL (if any `updated_at` missing) | `schema`, `backfill` | `schema-truth-checker` | introspect **before** pasting; memory says tolerant columns are often already live |

### Wave 3 — Cheap tabs (1 week)

EASY-UI, stock controls, broad exercise of the tokens. **You** tab: Settings hub, Levers (the 527-loc page becomes one `Form` with a `Section` per rung), Plan + routine, Body targets. **Exercise library** (`.searchable`, grouped by landmark) + exercise page header. **Reports** list + `WKWebView` viewer loading the bundled markdown renderer. Sign-in polish (Password AutoFill needs AASA — still served by Netlify until Wave 9).

Domain pulls: `levers`, `maintenance`, `profiles`, `dailyTargets`, `programs` prefs half, `phases`, `fmtV2.parseTargets` + `targetMatch`, and **`exercises/muscleMap` + `aliases` + `bodyweight` + `unilateral` + `timed`** — the exercise library is where 1b said `muscleMap.ts` lands; the copied answers in `Program.swift` are replaced by lookups and a parity test asserts the two agree.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| Settings/Levers/Plan/Body | `ui-ux-pro-max:ui-ux-pro-max` (`"form stepper picker" --stack swiftui`), `apple-design` | `ios-developer` | writes reach Supabase through the outbox; shots |
| Exercise library | `ui-ux-pro-max:ui-ux-pro-max` | `ios-developer` | search + grouping; VoiceOver order |
| Reports WKWebView | `native` | `swift-expert` | FMT v2 sample renders; no network needed |
| domain pulls | `graphify` | `swift-expert`, `invariant-auditor` | vectors green |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | — |

### Wave 4 — Day + Fuel (1.5 weeks)

`/day/[date]` (Body tab root with `DatePicker(.graphical)`), nutrition entries, macro `Gauge`s with overshoot, day-target override, exception/estimated flags, water, fatigue slots, DOMS map (atlas), supplements checklist with slot clock, cardio logger, swap-day (two dates, undoable), InBody entry (derived masses shown, never entered — no tape measurements, ever), sleep debt gauge, weigh-in skip resolve-on-read.

Domain pulls: `context`, `exceptionDay` (done), `supplementNutrients`, `nutrientTargets`, `body/*` trio, `cardio/*`, `schedule/swap` + `layout`, `sleep/nightWindow`, `InBody` derivation, `SleepDebtGauge` decay, `stepMarks`, slot scheduling, `nutrientRisk`.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| Day screen | `apple-design`, `ui-ux-pro-max:ui-ux-pro-max` | `ios-developer` | every drawer is a `.sheet`; shots ×3 states |
| Fuel screens | `ui-ux-pro-max:ui-ux-pro-max` (`"gauge progress dark contrast"`) | `ios-developer` | macro overshoot visible; `nil` renders as `—`, never 0 |
| swap day + schedule | `graphify` | `swift-expert`, `invariant-auditor` | `swap.json` vectors; undo clears both dates |
| body comp | `graphify` | `swift-expert`, `invariant-auditor` | `deltaVerdict` asymmetries vectored; no tape fields exist |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | — |

### Wave 5 — Widget lift (1 week)

Move `ios/App/HelixWidgets/{Lifestyle,Training,Performance,Vitals,Daily,Cardio,Composition,Lock,Primitives,AtlasFigure}.swift` into `HelixUI` as **tile views** parameterised by `WidgetFamily`; palette calls rewired to `HelixTokens` (the third and fourth palette copies die). `HelixProvider` reads the App Group GRDB file (read-only connection) instead of `HelixSnapshot`; `cadence.ts` becomes the timeline policy. `HelixIntents` configuration kept. Deep links → `.onOpenURL` with the `safePath` allow-list. Old Capacitor widget binary removed from the phone.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| move + re-skin | `native`, `apple-design` | `swift-expert` | every family renders from a local DB with no network; `diff` shows drawing code unchanged apart from colour calls |
| App Group read path | `native` | `swift-expert` | widget timeline updates after an in-app write |
| Live Activity in the new bundle | `native` | `ios-developer` | Dynamic Island compact slots correct (see memory: Watch mirrors them) |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | — |

### Wave 6 — Today (2 weeks)

The dashboard is *composed* from `HelixUI` tiles, so this wave is layout + interaction, not drawing. `Grid` of `small/medium/large` families; `dashboard/layout.ts` algebra ported (vectors from Wave 0); layout persisted in GRDB and mirrored to `dashboard_layouts`; jiggle edit mode by long-press; `.draggable`/`.dropDestination` reorder; resize cycles `sizesFor`; stacks are `TabView(.page)` with the 9 s rotation + per-slot stagger + suspend-on-edit; gallery of hidden tiles in edit mode. Plus `InsightCoach` (`coach/insights` vectored), `WeekSoFar`, weekly-summary CTA, readiness orb (one colour scale), six domain sheets.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| layout algebra | `graphify` | `swift-expert`, `invariant-auditor` | `dashboard-layout.json` vectors green |
| grid + edit mode | `apple-design` (§2–§6, §9 rubber-band), `ui-ux-pro-max:ui-ux-pro-max` (`"drag reorder grid haptics" --stack swiftui`) | `ios-developer`, `swift-expert` | drag tracks 1:1, interruptible; jiggle; shots of edit mode |
| smart stacks | `apple-design` (§3 interruptibility) | `ios-developer` | rotation pauses in edit and on background; swipe up = forward |
| insights + sheets | `ui-ux-pro-max:ui-ux-pro-max` | `ios-developer` | `insights.json` vectors; sheet detents |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | — |

### Wave 7 — Charts (1.5 weeks)

Swift Charts everywhere (`parts.tsx`'s hand-rolled kit is not ported; ~700 loc evaporate). Pathfinder (week-node timeline, era filter, export-to-clipboard from the ported `buildWeeklyExport`, Sentinel save/load), Workout Analysis (`ExerciseBreakdown` rows, progression cue, highlights, muscle focus, cardio section), exercise history (records, e1RM trend, ledger), body composition chart, steps chart, volume stream, RPE calendar, strength trends, vitals groups.

Domain pulls: `charts/*`, `prEngine` trio (if Track D hasn't reached it, this wave does), `ceilings`, `weeklyExport` + `derived` + `weekJson`, `widget/derive`, `useCharts.collapseToSessionBest`, `ExerciseBreakdown` fns, `SessionHighlights`, `pctOf`, `resolveChartSplit`, `mergeBodyComposition`, `VitalsGroups.MetricDef`.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| chart kit on Swift Charts | `dataviz` (form, colour formula, marks), `apple-design` §15 | `swift-expert` | one `HelixChartStyle` modifier; selection + scroll; AX5 shot |
| Pathfinder + export | `report` (contract: deterministic, `—` never 0, no Day Score/Battery lines), `graphify` | `swift-expert`, `invariant-auditor` | `weekly-export.json` string vectors byte-equal |
| Workout Analysis | `ui-ux-pro-max:ui-ux-pro-max` | `ios-developer` | PR records match `personal_records`; `pr-engine.json` green |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | — |

### Wave 8 — App Store 1.0 (3 days)

Privacy manifest (HealthKit reasons, UserDefaults reason codes), `NSHealthShareUsageDescription` per type, no `.processing` background mode unless registered, encryption-exempt flag, screenshots from the shot loop at 6.9" and 6.3", App Store metadata, review notes (single-user app — demo credentials), TestFlight external build, submit.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| preflight | `capacitor-apple-review-preflight` (checklist + rejection patterns only; Capacitor sections skipped), `native` | `ios-developer` | every checklist row answered |
| security | `capacitor-security` (secrets/storage/network rules only — no Capsec run), `security-review` | — | anon key only in the binary; JWT in Keychain; no service-role anywhere |
| performance | `capacitor-performance` (memory/launch principles), Instruments | `ios-developer` | cold launch < 1 s; no hang > 250 ms in the logger |
| submit | `ship` (batch + verify discipline, no Netlify) | — | "Waiting for Review" |

### Wave 9 — Retire the web (3 days, after 2 weeks daily-driving 1.0)

1. Move AASA to a static host on the same domain. Verify AutoFill still prompts.
2. Delete `src/` (keep `src/tests/golden-vectors.test.ts` + `scripts/gen-atlas-swift.mjs` + `atlas.ts` + the domain modules they import, in a `parity/` folder, until Track D is 100 % — then delete those too and the fixtures become frozen Swift test resources).
3. Delete `ios/App/`, `capacitor.config.ts`, `netlify.toml`, `next.config.ts`, all web `package.json` deps; `package.json` keeps only `golden`, `swift:*`, `native:gen`, `atlas` until step 2 finishes.
4. Netlify: delete site + env vars (also the outstanding `NEXT_PUBLIC_DEV_*` + Notion vars from memory). Supabase: drop `widget_tokens`, rotate the password (outstanding since 2026-09-02).
5. `.claude/skills/`: delete `capacitor-*`, `tanstack-query`, `nextjs-best-practices`, `react-best-practices`, `visual-check`; `.agents/` + `skills-lock.json` go with them. Memory files that describe web-only behaviour are marked SUPERSEDED.
6. Merge `feature/native-migration-wave-1` → `main`. `graphify update .`

| Task | Skills | Agents | Gate |
|---|---|---|---|
| AASA move | `native` | — | `curl` returns JSON with the native bundle id |
| deletes | `graphify` (query for stragglers), `git-commit-helper`, `ship` | `caveman:cavecrew-investigator` | `swift:core` + `swift:data` green; app builds; no reference to `src/` in `native/` |
| Supabase cleanup | `schema`, `backfill` (dry-run discipline for any data move) | `schema-truth-checker` | tables listed before and after |
| memory hygiene | — | — | `MEMORY.md` lines for web-only rules marked SUPERSEDED |

### Wave 10 — Watch 1.1 (3 weeks)

Unchanged in substance from the 2026-09-02 §The Watch pivot: own GRDB store + own Supabase client in `HelixData`, `WCSession.transferUserInfo` for set events, `sendMessage` for timer + pencil, Supabase as the merge point, `HKWorkoutSession` + `workout-processing` **verified on the wrist before any UI**. Screens: session picker, set logger (Digital Crown for load, stepper for reps, RPE ladder), rest timer with haptics, live dashboard. Palette: `HelixTokens` only; the `ContentView.swift` private theme dies.

| Task | Skills | Agents | Gate |
|---|---|---|---|
| HKWorkoutSession spike | `native` | `ios-developer` | HR streams on-wrist for 20 min with screen off |
| transport + pencil | `graphify` | `swift-expert` | two-device test: log on both, converge through Supabase, zero lost sets |
| Watch UI | `apple-design`, `ui-ux-pro-max:ui-ux-pro-max` (`--stack swiftui`) | `ios-developer` | Crown/stepper feel; `reduceMotion`; AX shots |
| review/ship | `code-reviewer`, `git-commit-helper` | `caveman:cavecrew-reviewer` | 1.1 submitted |

---

## 6. Agent & skill legend — what each name resolves to

Future sessions: invoke by the **live name** in the middle column. Never cite an archived name as if it were active.

| Requested name | Live invocation | Role in this plan |
|---|---|---|
| `apple-design` | `Skill: apple-design` | Every UI task. Principles only; its CSS is for the web. |
| `ui-ux-pro-max` | `Skill: ui-ux-pro-max:ui-ux-pro-max` + `search.py … --stack swiftui` | Every UI task; `pro-rules.md` checklist at every UI gate. |
| `ui-design-system` | `Skill: ui-ux-pro-max:design-system` | Wave 0/1 token persistence only. |
| `frontend-design` | plugin `frontend-design` | When a screen reads as templated. |
| `brainstorming` | `Skill: superpowers:brainstorming` | Before any *new* interaction not in this plan. |
| `code-reviewer` | `Skill: code-reviewer` (`~/.claude/skills`) | End of every wave. |
| `graphify` | `graphify query` first, `graphify update .` last — hook-enforced | Every session. |
| `native` | `Skill: native` — **rewritten in Wave 0** | Anything under `native/`, `ios/`. |
| `schema` | `Skill: schema` | Before any DDL or column claim. |
| `backfill` | `Skill: backfill` | Any script against live Supabase. Dry-run, row count in the reply. |
| `report` | `Skill: report` | Wave 7 export contract. |
| `ship` | `Skill: ship` | Commit/push discipline. Netlify rules die at Wave 9. |
| `git-commit-helper` | `Skill: git-commit-helper` | Every commit. |
| `supabase-postgres-best-practices` | `Skill: supabase-postgres-best-practices` | Track S. |
| `capacitor-apple-review-preflight` | `Skill: capacitor-apple-review-preflight` | Wave 8 checklist only. |
| `capacitor-security` / `capacitor-performance` / `capacitor-offline-first` | same names | Principles only (Waves 2, 8). Deleted at Wave 9. |
| `visual-check` | `Skill: visual-check` — **web-only** | Replaced by the Wave 0 shot loop. Deleted at Wave 9. |
| `tanstack-query`, `nextjs-best-practices`, `react-best-practices` | same names | **Only** when touching the still-live web app (bug fixes during migration). Deleted at Wave 9. |
| `senior-architect`, `senior-backend`, `senior-frontend`, `senior-fullstack`, `mcp-builder`, `ux-researcher-designer` | `.claude/skills-archive/` — **not active** | Not used. Unarchive (`mv` into `.claude/skills/`) only by explicit founder request. |
| `dataviz` | `Skill: dataviz` | Wave 7 (not in the original list; it is the chart skill this repo actually has). |
| `security-review` | `Skill: security-review` | Wave 8. |
| **Agents** | | |
| `swift-expert` | `Agent: swift-expert` | Tracks D and S; anything with actors, GRDB, Codable, vectors. |
| `ios-developer` | `Agent: ios-developer` | Track U screens, entitlements, HealthKit, ActivityKit, Watch. |
| `invariant-auditor` | `Agent: invariant-auditor` | After every domain port and before every vector regeneration. Read-only gate. |
| `schema-truth-checker` | `Agent: schema-truth-checker` | Before every table/column claim. Read-only gate. |
| `caveman:cavecrew-reviewer`, `caveman:cavecrew-investigator`, `caveman:cavecrew-builder` | `Agent:` of the same name | Review diffs; locate stragglers; 1–2 file edits. |
| `mobile-app-developer` | — | **Not used.** Android half is dead weight; `ios-developer` covers it. |
| `swift-mcp-expert` | — | **Not used.** No MCP server is built in this migration. |

---

## 7. Working agreement (unchanged, plus three rules)

Tests are the review · comments teach · small increments · screenshots close the loop. Plus:

- **Vectors before Swift.** A domain module is ported only after `npm run golden` has written its fixture. `invariant-auditor` reads the diff before the fixture is regenerated.
- **Tokens before pixels.** No view is written until `HelixUI` exports the token it needs. A raw hex in `Features/` fails the build's test target.
- **Not a clone.** Every screen's PR body lists which §3.5 differences it satisfies. A screen that is recognisably the web layout in a new font is rejected.

## 8. Conventions (carried forward)

Never edit the `.xcodeproj` (edit `project.yml`) · migrations append-only · column names match Postgres · views read GRDB only · `nil` is not `0` · `jsRound` not `rounded()` · `--scratch-path` always (`npm run swift:*`) · all native work on `feature/native-migration-wave-1` until Wave 9 · `Secrets.xcconfig` URL carries no `https://`.

## 9. Commands

```bash
cd native && xcodegen generate && open HelixNative.xcodeproj   # first run, after Secrets.xcconfig
npm run swift:core      # HelixCore: vectors + invariants
npm run swift:data      # HelixData: migrations, outbox, events, sync
npm run golden          # regenerate vectors after a TS formula change
npm test                # web suite incl. golden staleness + atlas parity
scripts/native-shot.sh <screen>   # Wave 0: simulator screenshot at default + AX5
graphify update .       # after every code change

# the app and its extension, without a device or a signing certificate
cd native && xcodegen generate
xcodebuild -project HelixNative.xcodeproj -scheme HelixNative \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Never pass `-sdk iphoneos` to that build: it drags a watch AppIcon check into an iPhone-only project and fails on an asset that does not exist. The URL in `Secrets.xcconfig` carries no `https://`.

---

## Appendix A — Wave 1b, as shipped (carried verbatim from the 2026-09-02 doc at overwrite time)

### As written by the session that shipped it (2026-09-02/03)

The event log, the pencil and the Live Logger UI are in. What is **not** in is
the sync, and it is the rest of the wave.

**The deck is domain, not a fixture.** `HelixCore/Training/Program.swift` holds
HELIX-5 — five days, 37 movements, both phases' set counts, the rep windows and
the prescribed rest. `Landmarks.swift` holds the sixteen tracked muscles and the
one credit rule (direct 1.0, assistance 0.5, an overlap taking the maximum and
never the sum). Both are in `HelixCore` because all three consumers — the
logger, the muscle sheet, the phase toggle — have to agree, and the way they
agree is by reading one value.

The credit rule's headline test is a REAL vector, read off the shipping app's
own sheet mid-session: one set of Neutral-Grip Lat Pulldown plus one of
Seated Cable Row (Wide Grip) is 2 physical sets and 5 weighted — Lats 1.5,
Upper back 1.5, Biceps 1, Forearms 1.

**`muscleMap.ts` is not ported.** Every line of that dictionary was bought by
reconciling a real week against Hevy — the fly that is not a triceps movement,
the row that is not rear-delt work, the press that pays the triceps and not the
side delt. Porting it belongs with the exercise library in Wave 4. Until then
each lift in `Program.swift` carries its own resolved answer, **copied** from
that file rather than re-derived.

**`rpe` reached the local store (`v7`).** Postgres has carried
`workout_sets.rpe` all along and the local schema simply never did, so the
logger could record how heavy a set was and not how hard it felt — half of the
double-progression rule. `SetSnapshot` gained the field at the same time, which
is a wire-format change and a safe one in this direction: a new build decoding
an old row sees the key absent and gets `nil`, which is the right answer for a
set logged before ratings existed.

**The atlas is generated twice now.** `gen-atlas-swift.mjs` writes into both
`ios/App/HelixWidgets/` and `native/HelixNative/Features/Logger/`, and
`atlas-parity.test.ts` asserts the copies are byte-identical. Two apps draw the
body and neither can import the other's module; checking only the first copy
would let the second drift silently, which is the exact failure the generator
exists to prevent. The generated types are now `Sendable` — they are pure
geometry, and the native target builds with strict concurrency complete.

**One widget face ships: the Live Activity.** `native/Shared/` is in BOTH the
app and the `HelixNativeWidgets` targets, because ActivityKit matches
`Activity.request` to `ActivityConfiguration` by the attributes TYPE and two
identically-named structs in two modules are two different types — a failure
that builds fine and draws nothing. The iOS 18 floor deletes the Capacitor
app's two-widget-struct `buildLimitedAvailability` dance: `supplementalActivity-
Families` can just be called. Every other face still needs the App Group and
waits for Wave 7.

**What the logger deliberately does not do yet**, so nobody goes looking:

| Not there | Why | Lands in |
|---|---|---|
| Upload to Supabase | `workout_sets.set_index` is `set_number` server-side and `workout_sessions.date` has no counterpart at all. The translation layer is the rest of 1b. | 1b |
| Real PR detection | `prEngine.ts` is 600 loc: per-set tonnage collapsing L/R pairs, a reps axis only when weight is 0, baselines carrying `set_type` and `side`. The logger flags a set that beats the program's own `wk1Kg` seed and writes nothing to `personal_records`. | 4 |
| Real "last time" | Needs synced history. The seed load stands in. | 1b |
| Cardio rows | A different column set (km / min / %) on a different data path. | 3 |
| Swaps and overrides | The plan's weekday layout resolves the day; dated swaps are their own subsystem. | 6 |

*"Lands in" re-mapped to this plan: 1b → Wave 2 · 4 → Wave 7 (PR engine) / Wave 3 (`muscleMap`) · 3 → Wave 4 (cardio) · 6 → Wave 4 (swaps).*

## Appendix B — The event log and the pencil (carried verbatim)

### The design: an append-only event log with a single pencil

Two independent, offline-capable writers editing one live session is the classic
way to lose data silently. Two rules prevent it.

**1. Sets are events, not rows.**

```
set_events(id, session_id, set_id, device_id, seq, kind, body, created_at, is_synced)
live_sessions(session_id, owner_device_id, owner_since, claim_seq)
device_state(row_id, device_id, lamport)
```

`kind` is `append` / `amend` / `void`, denormalised beside the JSON `body` so SQL
can filter without decoding a blob. `set_id` is the set an event is *about* —
many events share one over the life of a set, and it is distinct from the event's
own id.

The set list on screen is a **fold over the log**, not a table: `workout_sets` is
a projection, rebuilt by `SetEventFold` inside the same transaction as every
append, with exactly one writer. An edit appends; a delete appends a tombstone.

`seq` is a Lamport value, stored in `device_state` so it survives relaunch — a
counter that reset to zero would stamp new events below existing ones and reorder
the session under the user. The same clock stamps `claim_seq`, so a contested
pencil resolves by the same total order the fold uses.

Two devices that both UPDATE the same row and merge later drop one write with no
trace. A fold over a device-scoped append-only log cannot lose a set: its worst
failure is showing a set you meant to delete — visible, and fixable in one tap.
For a training log that is the correct direction to fail in.

The outbox already carries idempotency keys, so replaying an event is a no-op.
That property is what makes the log safe to retry forever.

**2. One device holds the pencil.**

```
live_session.owner_device_id, live_session.owner_since
```

Exactly one device is the writer at a time. The other renders the same session
live and read-only, with a *Log here* button that requests handoff. Hevy behaves
this way, and it is why Hevy never asks the user to resolve a conflict.

**Transport, and what is authoritative:**

- `WCSession.transferUserInfo` — queued, guaranteed, delivered even when the
  counterpart app is not running. Carries set events.
- `WCSession.sendMessage` — immediate, needs reachability. Carries the live rest
  timer and the pencil handshake only.
- **Supabase is the merge point.** WCSession is a latency optimisation and is
  never the source of truth. A phone in another room with no signal still
  converges the moment either device reaches the network.

**HealthKit on the wrist:** logging requires an `HKWorkoutSession` so the app
stays foregrounded on-wrist and can read live heart rate. The entitlement is
already held; `WKBackgroundModes: workout-processing` must be added and verified
on a real device.
