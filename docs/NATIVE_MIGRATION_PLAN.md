# HELIX — Native Migration Plan

**Status:** live architecture document. The authority on why the native app is
shaped the way it is. Point new sessions here.
**Adopted:** 2026-09-02 · **Branch:** `feature/native-migration-wave-1`
**Wave 1 foundation:** shipped, commit `40609e7`

---

## Context — why this exists

HELIX today is a Next.js 15 / React 19 app inside a Capacitor WKWebView that
loads a **remote Netlify URL**, plus 9,539 loc of hand-written Swift (widgets,
Watch, HealthKit, Live Activities). It does not feel native, and the two weeks of
commits before this decision were performance mitigations against a ceiling that
never moved.

Decision taken 2026-09-02: rewrite as a 100 % native SwiftUI app for iPhone and
Apple Watch, and retire Netlify. Wave 0 — the bundled-webview control experiment
that would have measured how much of the "web feel" was the remote URL — was
**skipped by founder decision**: the result would not have changed the
destination.

The web app stays installed, deployable and daily-driven under
`app.helix.health.michael` for the whole migration. The native app builds beside
it as `app.helix.health.michael.native`, against the same Supabase. There is no
day on which neither app works.

---

## The ten decisions

| # | Question | Answer | What it changes |
|---|---|---|---|
| 1 | Swift knowledge | **Zero** | Small increments, teaching comments, tests as the safety net. See §Working agreement. |
| 2 | Velocity | **Maximum** | Waves run back-to-back; the gate is review, not calendar. |
| 3 | Screens to cut | **None.** Desktop `xl:` layouts only | Measured at 11 occurrences in 6 files. See §Answer 3. |
| 4 | Dashboard smart stacks | **Keep — premium native redesign** | Wave 2 stays the riskiest UI wave. Prototype the interaction first. |
| 5 | iPad | **No** — iPhone + Watch only | No size classes, no `NavigationSplitView`. Revisit at $99. |
| 6 | The Watch | **PIVOT — a full logging client** | The largest change here. See §The Watch pivot. |
| 7 | FMT v2 reports | **`WKWebView` inside the native app** | Deletes the hardest single port item. −1.5 weeks. |
| 8 | Data layer | **GRDB + SQLite + outbox** | Confirmed. Must also be *multi-writer* — see §6. |
| 9 | Multi-tenant | **Single user** | No household path beyond the RLS already in place. |
| 10 | Visual review | **Small increments, screenshot, adjust** | The binding constraint on every UI wave. |

Carried forward: Apple Developer Program **deferred** (free personal team, 7-day
re-sign), Android **never**, parity bar **native-first redesign** rather than
transliteration.

---

## The Watch pivot — and why it lands in Wave 1

The shipping watch app is 331 loc: five read-only screens polling
`/api/widget/snapshot` over Wi-Fi/LTE. The requirement is now a Hevy-class
logging client — log sets, edit weight and reps, mark set quality, run rest
timers, watch a live dashboard, on the wrist, offline.

That is not a larger Wave 6 line item. **It changes the shape of the data layer,
so the decision lands in Wave 1** even though the Watch UI is Wave 5.

### Why it cannot be retrofitted

A single-writer store and a two-writer store are different databases. Retrofitting
means rewriting every primary key, the outbox, and the merge rule. Deciding now
costs days. Deciding at Wave 5 costs the store.

### Verified feasible

| Requirement | Status |
|---|---|
| GRDB on watchOS | ✅ `Package.swift` declares `.watchOS(.v7)` |
| supabase-swift on watchOS | ✅ declares `.watchOS(.v9)` |
| Project floor | ✅ `WATCHOS_DEPLOYMENT_TARGET = 10.6` |
| `WatchConnectivity` on a free team | ✅ no entitlement required |
| HealthKit on a free team | ✅ already shipping in `HelixHealth.swift` |
| `HKWorkoutSession` + `workout-processing` | ⚠ **needs device verification** — untestable from a dev machine |

The Watch does **not** need an App Group: it gets its own GRDB store and its own
Supabase client. That is a free-team *win* — the watch stops depending on
`/api/widget/snapshot` entirely. Only the widgets still need that route, so it
survives until the paid program.

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

**Cost:** +3–4 weeks. Wave 5 becomes its own wave rather than a line in Wave 6.

---

## Answer 3, measured

"Nuke all `xl:` layouts" is **11 occurrences across 6 files**. It is not dead
weight worth a task, and every one of those files is deleted at Wave 7 anyway.

**Do not touch the web app.** Simply never build a desktop variant in Swift.
Editing code that is already scheduled for deletion is churn against the app
still being daily-driven. All domain screens stay.

---

## Architecture as built

```
native/
├── project.yml            XcodeGen spec — the .xcodeproj is GENERATED, never committed
├── Packages/
│   ├── HelixCore/         pure domain. Foundation only. Builds + tests on macOS.
│   │   └── Fixtures/      1,849 golden vectors exported from the TypeScript
│   └── HelixData/         GRDB store + outbox + Keychain + Supabase
├── Shared/                in BOTH app and extension — ActivityKit attributes
├── HelixNativeWidgets/    widget extension. One face: the Live Activity.
└── HelixNative/           the SwiftUI app target (views only)
```

`HelixData` depends on `HelixCore`; never the reverse — the domain does not know
a database exists. The split exists so almost the whole app is verifiable from
the command line without Xcode, a device, or a signing certificate, which matters
when provisioning expires every seven days.

**Verified at the foundation commit:** `HelixCore` 21 tests · `HelixData` 9 tests
· web suite 2,497 tests · `tsc --noEmit` clean · `xcodebuild` BUILD SUCCEEDED ·
installed and running on the iPhone.

### The golden vectors — the risk control the port rests on

`src/tests/golden-vectors.test.ts` runs the **shipping TypeScript** over fixed
inputs and writes `{input, expected}` pairs into the Swift test resources.
`swift test` replays all 1,849 against the Swift port.

Proven in both directions:

- Swift drift (`tefFactor` 0.105 → 0.10) fails two Swift suites, naming the case
  and both values.
- TypeScript drift (`TEF_FACTOR` → 0.11 without regenerating) fails the web suite
  with `tef.json is stale`.

**Any domain module without golden vectors does not ship.** The arithmetic here
breaks silently: the `weight === 0` blind spot that printed "1RM 0" for months,
the TDEE that omitted TEF and made every deficit ~200 kcal/day too small, the
battery v6 whose drain budget exceeded its charge budget. Every one was invisible
on screen and would have been caught by a fixture.

`jsRound` exists because `Math.round` rounds halves toward +∞ while Swift's
`rounded()` rounds away from zero. They disagree on every negative half. Use
`jsRound`, never `rounded()`, wherever the TypeScript calls `Math.round`.

### Repo hygiene: keep SwiftPM out of the code graph

`swift build` / `swift test` write a `.build` directory that, left inside the
repo, is walked by `graphify update .` — it once made **74 % of the code graph
vendored dependency source** (35,671 of 48,398 nodes were GRDB and supabase-swift
internals), and a query for the workout logger returned a Supabase example
project.

The `swift:core` / `swift:data` npm scripts therefore pass `--scratch-path` into
`~/Library/Caches/helix-swift/`. **Never run a bare `swift test` inside
`native/`** — use the npm scripts, or pass `--scratch-path` yourself.

---

## Wave plan

| Wave | Scope | Estimate |
|---|---|---|
| **1a** ✅ | Foundation: packages, GRDB, Keychain, Supabase, golden vectors, app shell | done |
| **1b** | Multi-writer store (event log + pencil) ✅, **Live Logger** UI ✅, sync ⏳ | 3–4 wks |
| **2** | Dashboard + **Smart Stacks**, native redesign. Prototype the interaction in week 1 | 3 wks |
| **3** | `/day/[date]`, nutrition, macros, water, fatigue slots, supplements, DOMS, cardio | 2 wks |
| **4** | Swift Charts port, exercise library, session analysis, progression trail | 2 wks |
| **5** | **Watch as a logging client** — sets, rest timers, `HKWorkoutSession`, WCSession | 3–4 wks |
| **6** | Reports (`WKWebView`), Settings, Pathfinder, levers, plan, body targets | 2–3 wks |
| **7** | Widgets on the App Group, retire Netlify, delete `src/` | 1–2 wks · **needs $99** |

**Total: 13–18 weeks.** Up from the original 11–16: the Watch adds 3–4, the
`WKWebView` reports decision gives back roughly 1.5.

### Wave 1b, as shipped so far

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

### Two hard gates

> **Gate A — end of Wave 1b.** When the native app becomes the daily driver, the
> 7-day provisioning expiry stops being an annoyance and becomes the reason to go
> back to the web app. Buy the Apple Developer Program here at the latest.
>
> **Gate B — Wave 7.** Deleting Netlify and the 832-loc `/api/widget/snapshot`
> route is impossible on a free team: without an App Group the widgets have no
> other way to read the app's data.

---

## What deletes rather than ports

Roughly 2,300 loc of the web app exists only to simulate native behaviour. None
of it is ported; all of it is replaced by a system modifier.

| Today | loc | Native replacement |
|---|---|---|
| `lib/nav/useEdgeSwipeBack.ts` — hand-rolled back gesture with its own projection and rubber-banding | 227 | `NavigationStack` |
| `lib/nav/scrollMemory.ts` — per-route scroll restoration | 171 | `NavigationStack` / `TabView` |
| `ui/PullToRefresh.tsx` | 301 | `.refreshable {}` |
| `ui/Sheet.tsx` + `ui/overlay.tsx` — drag-to-dismiss bottom sheet | 472 | `.sheet` + `.presentationDetents` |
| `nav/BottomNav.tsx` + `Sidebar.tsx` — `layoutId` tab indicator | 404 | `TabView` |
| `providers/QueryProvider.tsx` — cache caps, budget, JSON-safety walk, paused-mutation outbox | 277 | GRDB + the outbox table |
| `sw.ts`, `SerwistRegister.tsx`, `/api/version`, `offline.html`, the black-screen defence | ~250 | all gone — no stale-bundle bug class exists in a signed binary |
| `lib/motion/springs.ts` | 233 | `.spring(response:dampingFraction:)` — a direct translation |

## What genuinely has to be rebuilt

| Today | Native | Difficulty |
|---|---|---|
| `dashboard/WidgetGrid.tsx` (1,044 loc) — 2D bento reorder, long-press edit, smart stacks | `LazyVGrid` + `.draggable`/`.dropDestination`, redesigned toward WidgetKit's own size-class + edit-mode model | **Hardest single item.** Prototype before committing Wave 2's date. |
| `command-center/` (7,246 loc) — `ExerciseCard` 1,435, `SetEditorRow` 832, 9 sheets, clock, rest countdown, RPE ladder | SwiftUI `List` + `.presentationDetents` sheets + `TimelineView` | **Biggest by volume**, structurally simple |
| Recharts (11 surfaces) | Swift Charts; `HelixPrimitives.swift` already ships hand-drawn `Sparkline` / `BarChart` / `DepthArc` / `BatteryRing` | Moderate |
| FMT v2 report renderer | **`WKWebView`** (decision 7) | Was the hardest item; now cheap |
| ~15 hand-drawn SVG components | `Path` / `Canvas` | Mechanical; most already have Swift equivalents |
| Body atlas | **Already ported** — `HelixAtlas.swift`, generated from `atlas.ts`, parity-tested | Free |
| `lib/theme` (592 loc) | `HelixPalette.swift` — exists, parity-tested against `palette.ts` | Mostly done |
| lucide-react | SF Symbols | Better — variable weight, Dynamic Type aware |
| 24 `localStorage` keys / 230 call sites | GRDB tables + `@AppStorage` | Simplification; the legacy `apex_*` keys finally die |

**Known drift to fix during Wave 5:** the Watch app carries its own private
`enum HelixTheme` palette in `ContentView.swift` while also reaching into the
shared `Helix` palette. Two copies that both look right — the exact failure the
atlas generator was built to prevent. Collapse it onto `HelixPalette`.

---

## Working agreement

Zero Swift knowledge and maximum velocity pull in opposite directions. The
resolution is not to slow down — it is to make every increment provable without
reading the Swift:

- **Tests are the review.** Domain code ships with golden vectors; store code
  ships with GRDB tests. A green `npm run swift:core` is a claim that can be
  checked without Swift.
- **Comments teach.** Non-obvious Swift constructs get a comment explaining the
  language feature, not only the intent.
- **Small increments.** One screen or subsystem per commit, always building,
  always installable. Never a half-migrated state left overnight.
- **Screenshots close the loop.** The UI cannot be seen from here. Deploy,
  screenshot, adjust. This is the binding constraint on Waves 2–6.

## Conventions

- **Never edit `HelixNative.xcodeproj`.** Edit `project.yml`, run `xcodegen
  generate`. The project file is gitignored.
- **Migrations are append-only.** Never edit a registered migration; add another.
  An edited migration runs on a fresh install and not on an existing one.
- **Column names match Postgres exactly** (snake_case), so a row from PostgREST
  inserts locally with no translation layer. `columnNamesMatchPostgres` guards it.
- **Views read from GRDB and nowhere else.** Nothing in the UI awaits the network
  to draw.
- **`nil` is not `0`.** The domain distinguishes absent from zero in at least
  three places that have caused real bugs. Neither the store nor the port may
  erase that.
- **All native work lives on `feature/native-migration-wave-1`**, never on `main`,
  until the web app is retired at Wave 7.

## Free-team constraints

| Missing | Consequence today | What changes at $99/yr |
|---|---|---|
| App Groups | Widgets cannot read app data; each fetches over the network | Snapshot moves to a shared container; `/api/widget/snapshot` (832 loc) is deleted |
| Keychain sharing group | `KeychainAuthStorage` is private to its target | Extensions share the session |
| TestFlight | Provisioning expires every 7 days; re-sign from Xcode | Installs stay valid; updates arrive as a notification |
| APNs `content-available` | No server-pushed background refresh | Background sync becomes possible |

---

## Commands

```bash
# first run
cd native
cp HelixNative/Support/Secrets.example.xcconfig HelixNative/Support/Secrets.xcconfig
$EDITOR HelixNative/Support/Secrets.xcconfig   # host WITHOUT https://, plus anon key
xcodegen generate
open HelixNative.xcodeproj                     # select iPhone, Product ▸ Run

# verification, no Xcode needed
npm run swift:core     # domain: 1,849 golden vectors + invariants
npm run swift:data     # store: migrations, outbox, Keychain
npm run golden         # regenerate the vectors after a TypeScript formula change
npm test               # includes the golden-vector + atlas staleness checks

# the app and its extension, without a device or a signing certificate
cd native && xcodegen generate
xcodebuild -project HelixNative.xcodeproj -scheme HelixNative \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Never pass `-sdk iphoneos` to that build: it drags a watch AppIcon check into an
iPhone-only project and fails on an asset that does not exist.

The URL in `Secrets.xcconfig` carries **no `https://`** — an xcconfig treats `//`
as the start of a comment and truncates the value. `SupabaseConfig.fromBundle`
adds the scheme back.
