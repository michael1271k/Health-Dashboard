# Wave B — Widgets

Part 1.5, wave two. Wave A (`30adf62`) shipped the blockers; this is the home
screen. Nothing here is testable locally — the extension only runs on device
against a Netlify deploy — so the spec carries more proof-by-reading than Wave A
did, and every claim below cites the line it came from.

## What is actually there

Four `AppIntentConfiguration` kinds (`HelixWidgets.swift:37-108`), each with a
focus picker: Fuel (3 focuses), Training (6), Body (3), Lock (4). Sixteen
focuses over three sizes. One generic provider
(`HelixIntentProvider`, `HelixProvider.swift:101`).

There is **no App Group** — free personal team, stated twice in the source
(`HelixSnapshot.swift:9-17`, `HelixWidgetBridge.swift:7-12`). The extension
fetches `/api/widget/snapshot` itself with a token from Info.plist and caches
per-scope into its own `UserDefaults` (`HelixSnapshot.swift:494-512`). The app
has exactly two levers: make the server's answer fresher, and call reload.

Five problems, in the order they cost the most:

1. **Reload is untargeted.** `reloadAllTimelines()` (`HelixWidgetBridge.swift:43`)
   from one funnel (`applyComputedScore.ts:94`) with six callers. Logging a
   glass of water spends the Training widget's refresh budget.
2. **`generatedAt` is never read by Swift.** It is in the payload
   (`snapshot.ts:172`, written at `route.ts:317`) and decoded
   (`HelixSnapshot.swift:238`) and then ignored. `isStale`
   (`HelixProvider.swift:27`) is `status != .ok` — so a payload fetched
   successfully at 06:00 and still on screen at 14:00 shows no tag at all.
3. **Links land on tab roots.** Eight static paths (`HelixPalette.swift:171-179`),
   three of them (`micros`, `reports`, `session`) referenced by nothing. Tapping
   a Sunday in the calendar grid opens `/pathfinder`, not Sunday.
4. **The Today face is a hole on the day you look at it.** `TodayStats` renders
   only `if !compact, let done` (`HelixTraining.swift:120`); Small never renders
   stats (`:50`, `:125`). An unlogged training day is a title, "not logged yet"
   (`:149`), a `Spacer`, and the week chips.
5. **The calendar is a trailing window, and the ring outdraws the date.**
   `CalendarFace` slices the last `weeks × 7` days (`:464-468`) and captions
   Small "THIS WEEK" (`:473`). A logged day is a **solid** fill of the day
   colour with the date in `Helix.background` on top (`:600`, `:612`) at
   `size * 0.42` — roughly 4.6pt in a Small cell.

Nothing is branded: no Helix mark on any face, and the only mark in the repo is
a photoreal 1024px render (`Assets.xcassets/AppIcon.appiconset`).

---

## B1. Sync

### B1.1 Targeted reload

`WidgetCenter.reloadTimelines(ofKind:)` in place of `reloadAllTimelines()`, with
the kinds chosen by the write path.

The bridge's own comment argues against this — *"enumerating that list here would
be a second place to forget a widget"* (`HelixWidgetBridge.swift:39-42`) — and it
is right that a hand-kept list rots. The answer is not to give up targeting but
to stop hand-keeping the list:

- `src/lib/native/widgetKinds.ts` exports `WIDGET_KINDS = ['HelixFuelFamily',
  'HelixTrainingFamily', 'HelixBodyFamily', 'HelixLockFamily', 'HelixDailyFamily']`
  as the single source.
- `src/tests/widget-kind-parity.test.ts` greps `kind: "…"` out of
  `HelixWidgets.swift` and asserts set equality with `WIDGET_KINDS`. Adding a
  Swift widget without registering it fails the suite — the same mechanism that
  already keeps `DAY_COLOR` honest (`day-color-parity.test.ts`).
- `reloadWidgets()` with **no argument keeps meaning "all"**, so every existing
  call site is correct until it is deliberately narrowed.

Swift side: `reload` gains an optional `kinds: [String]`; empty or absent →
`reloadAllTimelines()`.

`recomputeAndPaint(qc, date, body, post, kinds?)` passes them through. The six
callers, mapped by what the payload field each family actually reads:

| Caller | Kinds | Why not the others |
|---|---|---|
| `useWaterOverride.ts:37` | Fuel, Body, Lock, Daily | Training reads calendar/streak/today-session. A glass of water moves none of them. |
| `useMacroOverride.ts:83` | Fuel, Body, Lock, Daily | Same. |
| `useNutritionException.ts:120` | Fuel, Body, Lock, Daily | Same. |
| `useDayVault.ts:180` | Body, Fuel, Lock, Daily | Weigh-in / InBody. Battery and score move, so Fuel and Lock are in. |
| `useSessionDraft.ts:344` | **all** | A commit moves today, calendar, streak, volume, score, battery. |
| `NativeBoot.tsx:42` | **all** | Foreground after an unknown gap. |

Training is spared on four of six paths. That is the whole saving, and Training
is the kind with the most content and the most reason to be fresh when it does
reload.

### B1.2 Cadence — and why not 15 minutes

The approved plan says day 30 → 15 min. **That will make the widget staler, not
fresher**, and I am not implementing it as written.

WidgetKit grants roughly 40–70 timeline refreshes per day, per kind — the number
`HelixProvider.swift:57-58` already cites. A flat 15-minute interval asks for 96.
Past the grant the system does not shorten the interval, it drops the requests,
and the widget sits on whatever it last got. The current flat 30 spends 48, which
is already at the top of the band, and 3 of those land between midnight and 06:00.

Shape the budget instead of flattening it:

```
00:00–06:00   150 min   → 2.4    asleep; the battery decays predictably
06:00–10:00    20 min   → 12     the morning look: sleep landed, day starts
10:00–17:00    45 min   → 9.3    at work; nothing is being logged
17:00–22:00    20 min   → 15     training and the evening meal
22:00–00:00    60 min   → 2      winding down
                       ≈ 41/day
```

Fewer refreshes than today, and roughly twice as dense in the two windows where
the numbers actually move. `HelixRefresh.nextRefresh` becomes a lookup over a
`[(startHour, minutes)]` table so the shape is one readable constant, and the
failure interval stays at 5 minutes and separate.

A pure-Swift test is not available here, so the table gets a TS mirror
(`src/lib/widget/cadence.ts`) plus a parity test asserting the Swift literal and
the TS literal agree, and that the daily total stays inside 30–60. The mirror is
a guard, not a second implementation — nothing on the web side reads it.

### B1.3 Honest staleness

`HelixEntry` gains:

```swift
/// Age of the payload on screen, from its own `generatedAt`. Nil when
/// unparseable — an unknown age must not render as a fresh one.
var age: TimeInterval? { ... }
/// Cached-because-the-fetch-failed, OR fresh-but-old. Both are "do not trust
/// this to the minute", and the tag now says which.
var isStale: Bool { status != .ok || (age ?? 0) > 45 * 60 }
```

`StaleTag` takes the age and renders `"2h ago"` / `"last known"`, replacing the
fixed `"last known"` string (`HelixPrimitives.swift:147-153`). Six call sites
pass `entry`.

45 minutes is deliberately longer than the densest cadence (20) and shorter than
the sparsest daytime one (45) — a tag that appears during normal operation is a
tag that gets ignored.

### B1.4 Source protocol

`HelixSnapshotClient` gets a `HelixSnapshotSource` protocol with the network
implementation as the only conformer. No behaviour change; it is the one-file
seam for an App Group if a paid account ever happens. Ten lines. If it starts
growing, it is out of scope.

---

## B2. Precision deep links

`safePath` already allows `/day` (`deepLink.ts:26`) and already returns the path
**with its query string intact** (`:53-56` splits only to validate the root).
So `helix://open?path=/day/2026-08-17?section=sleep` works today, end to end,
with no change to the allow-list. Only the two ends are missing.

**App end.** `day/[date]/page.tsx:195` reads `?section=` and handles exactly one
of the six `DaySheet` values (`:42`). Replace the boolean with a validated parse
over the whole union:

```ts
const SECTIONS: readonly NonNullable<DaySheet>[] =
  ['sleep', 'body', 'inbody', 'water', 'water-edit', 'macros', 'nutrition']
const requested = searchParams.get('section')
const section = SECTIONS.includes(requested as never) ? requested as DaySheet : null
useEffect(() => { if (section) setSheet(section) }, [section])
```

An unknown `section` opens the day with no drawer — never throws, never guesses.

**Widget end.** `HelixLink` gains dated builders:

```swift
static func day(_ iso: String, section: String? = nil) -> URL?
```

Focus links become:

| Face | Today | Now |
|---|---|---|
| Body · sleep | `/pathfinder` | `/day/<snapshot.date>?section=sleep` |
| Body · weight, composition | `/pathfinder` | `/day/<date>?section=inbody` |
| Fuel · water | `/nutrition` | `/day/<date>?section=water` |
| Fuel · macros, calories | `/nutrition` | `/nutrition` (correct already) |
| Training · today | `/workout` | `/workout` (correct already) |
| Calendar cell | *(none — inherits the face URL)* | `/day/<that cell's ISO>` |

The date comes from `snapshot.date` (the user's logical date, resolved
server-side), never from `Date()` in the extension — a widget whose midnight is
its own would open the wrong day for anyone whose logical day is not the
calendar day.

Per-cell links: `DayCell` wraps in `Link(destination:)`. This works in
`.systemMedium`/`.systemLarge` only — Small gets one tap target, which stays the
face URL. That limit is iOS's, and the Small calendar keeps the whole-face link.

**Dead links.** `micros`, `reports`, `session` are referenced by nothing. Delete
`session` (there is no widget-shaped reason to open a blank logging deck), keep
`micros` and wire it to the Fuel macros Large footer, keep `reports` and wire it
to the Body well-being Large footer. Anything still unreferenced after that gets
deleted rather than kept "for later".

`widget-link-parity.test.ts` extends: its regex currently only matches
`static let x = path("…")` (`:22`), so it would not see the new builders. Add a
case that constructs `HelixLink.day` output for a sample ISO **and** a sample
section and runs both through `safePath`, and assert every `section` string the
Swift file emits is a member of `SECTIONS`.

---

## B3. Branding and type

### B3.1 The mark

No webfont — `layout.tsx:18-30` is deliberate and stays. Shipping a font to a
widget is not what makes a widget look expensive.

The mark is **drawn, not imported**. The only Helix mark in the repo is a
photoreal render with a glow, a gradient and a specular highlight, at 1024px. At
13pt in a widget corner it is four grey pixels. And it cannot tint: iOS 18's
accented rendering mode flattens an image to one colour, so the copper/steel
contrast that IS the logo disappears.

`HelixMark: Shape` in `HelixPrimitives.swift` — two half-period sine strands
crossing twice, stroked at `lineWidth: size * 0.13`, `.round` caps. Ember strand
in front, steel behind; both `.white` at 0.55 in accented mode. It reads at 11pt
because it is two lines, it tints correctly because it is two `Path`s, and it is
recognisably the icon's geometry.

`HelixBrand` places it: top-trailing, 13pt, `opacity 0.55`, `allowsHitTesting(false)`.
One view, so it cannot drift between faces.

Placement per family: Medium and Large get it. **Small does not** — a Small is
150pt of which the mark would claim a corner that a Small cannot spare, and
nobody needs a logo on a widget they chose to install. Lock Screen accessories
do not get it either; the space is measured in glyphs. If that reads as
inconsistent on device it is a two-line change to add it.

### B3.2 The type scale

`HelixType` in `HelixPrimitives.swift`, replacing ad-hoc `.system(size:weight:)`
across four view files:

```swift
enum HelixType {
  static func hero(_ size: CGFloat)   -> Font  // .rounded, .bold — big values
  static func figure(_ size: CGFloat) -> Font  // .monospaced, .bold — anything that changes
  static func label(_ size: CGFloat)  -> Font  // .default, .semibold — names
  static let caption = Font.system(size: 10, weight: .heavy)  // + tracking 1.5
}
```

The rule it encodes is already half-observed: `BigValue` is `.rounded`
(`HelixPrimitives.swift:57`), `Stat` is `.monospaced` (`:416`) — a value that
changes between refreshes must not reflow the layout when a `1` becomes a `7`.
Making it a named scale means the next face gets it right by default. Mechanical
conversion; no visual change intended, and any that appears is a bug.

---

## B4. Today — the dead space

The prescription is not in the payload. `prescribedFor(dayKey, phase)`
(`programs.ts:349`) returns `{exercises, sets}` and the route never calls it,
which is why an unlogged day has nothing to say.

**Payload.** `WidgetSnapshot.workout` gains three fields:

```ts
workout: {
  label: string; dayKey: string | null; logged: boolean; isRestDay: boolean
  /** What the PLAN asks of today. Null on a rest day and when the day key
   *  resolves to no program day — never 0, which reads as "nothing to do". */
  plannedExercises: number | null
  plannedSets: number | null
  /** Tonnage the last time this same dayKey was trained. The number that
   *  answers "what am I chasing", and the route already holds the sessions. */
  lastVolumeKg: number | null
}
```

`lastVolumeKg` comes from `allSessions` — already read for the week aggregates
(`route.ts:216`) — filtered to the same `day_key`, most recent before today.
Zero extra round trips. Phase comes from the same `goals` row the macros use.

**Faces.**

- **Small** — day colour rule, session label, then one line that changes with
  state: `12 exercises · 34 sets` when due, `38 min · 8.4 t` when done,
  `recovery is the session` on rest. Streak chip bottom-right. The `Spacer` that
  used to be the bottom two-thirds is gone.
- **Medium** — header, label, and a four-stat row that is present in **both**
  states: due → `EXERCISES / SETS / LAST TIME / WEEK`, done → the existing
  `TIME / EFFORT / VOLUME / RECORDS`. Same shape, same height, different
  contents — which is the rule the file already states for itself at
  `HelixTraining.swift:80-83` and then breaks by omitting the row entirely.
- **Large** — `TodayLargeFace` is the one face that already works
  (`:283-345`). It gains the due-state stat row in the TODAY register and is
  otherwise untouched.

---

## B5. Calendar → month

### B5.1 The window

A month grid needs the days **after** today. The payload is 42 trailing days
ending today (`route.ts:286-287`), so the back half of the current month is not
in it and the grid cannot draw it.

`calendarDays` already takes an arbitrary date array and a resolver
(`route.ts:288-303`), and the resolver is `scheduleDayIn` / `isTrainingDayIn` —
both pure plan resolution that answers for any date, future included. So the
change is the window, not the machinery:

```ts
// Trailing 42 for the streak, UNION the current calendar month for the grid.
// The union, not a replacement: the streak must keep counting over exactly
// STREAK_WINDOW_DAYS or the widget and the dashboard disagree again — the
// failure lib/training/streak.ts exists to end.
const monthStart = date.slice(0, 8) + '01'
const monthEnd = lastDayOfMonth(date)
```

`lastDayOfMonth` does not exist — it is new in `src/lib/utils/week.ts`, beside
`isoAddDays`, and gets a February/leap-year test. Everything else in that block
is already there.

Cost: up to 30 extra entries, capped by construction at 72 and typically ~55.
Training scope only.

**`streakFrom` is already safe against future days** — `current` skips
`x.d > todayISO` (`streak.ts:78`) and `best` is a max that a future unlogged day
can only interrupt at the boundary, never lower. This is load-bearing and
currently untested, so it gets a test: a calendar with future scheduled days
produces the same `{current, best}` as one truncated at today.

### B5.2 The grid

- Caption: `weeks == 1 ? "THIS WEEK" : "CALENDAR"` (`:473`) → the month name from
  `snapshot.date`. Small keeps a trailing week — 42 cells in a Small is texture,
  which `:456-458` already argues — but captions it honestly as the week it is.
- **The circles.** `DayCell` (`:597-616`) today: logged = solid `Circle().fill(color)`
  with the date in `Helix.background`. Replace with:
  - logged → `Circle().fill(color.opacity(0.22))` + `strokeBorder(color, 1.5)`
  - scheduled, not logged → `strokeBorder(color.opacity(0.5), 1.5)` (unchanged
    in spirit, thinner in contrast)
  - rest → a 2.5pt dot at `Helix.muted.opacity(0.5)` **below** the number, so the
    grid still reads as a grid
  - **the date is `.white` in every state.** This is the actual complaint and the
    actual fix: at `size * 0.42` in a Small cell the number is ~4.6pt, and 4.6pt
    of near-black on gold is not small text, it is a smudge.
  - today → the outer white ring (`:604-606`) becomes a 3pt filled dot under the
    number, so today and "logged" stop competing for the same circle.
- Days outside the current month render at `opacity 0.35` rather than being
  padded out, so the month has edges without the grid having holes.

---

## B6. New surfaces

Three asks. Two of them are focuses, not kinds — and that is the recommendation,
not a shortcut. A new kind costs a gallery entry, a provider generic, an intent,
and a scope decision; a focus costs a switch case. Cardio *is* training and
composition *is* body, so the picker is where a user would look for them.

### B6.1 Cardio — a seventh `TrainingFocus`

New payload block, training scope:

```ts
cardio?: {
  last: { kind: string; date: string; distanceM: number | null
          durationMin: number | null; paceMinPerKm: number | null } | null
  weekSessions: number      // sessions ≥ 20 min this week
  weekTarget: number        // ZONE2_WEEKLY_TARGET
  weekMinutes: number
  trend?: TrendPoint[]      // 7 days of minutes, oldest first
}
```

**Zone 2 in Helix is a session count, not minutes.** `useCardio.ts:151-170`:
`ZONE2_WEEKLY_TARGET = 2`, `ZONE2_MIN_MINUTES = 20`, and the query *counts rows*
≥ 20 min. The approved plan says "Zone-2 minutes"; shipping minutes would put a
different definition on the widget than in `CardioLogger`, which is the streak
bug again with a different noun. The route reuses the app's constants.

Pace via `paceMinPerKm` from `lib/cardio/metrics.ts` — never recomputed in Swift.
Pace is a **minimum with a 1 km floor**, and a second implementation would get
that wrong.

Faces: Small = last session (kind, distance, pace). Medium = Zone-2 pips against
target + week minutes + last session. Large = 7-day bar chart (`BarChart` exists,
`HelixPrimitives.swift:474`) + the ledger.

Link: `/day/<date>` — cardio is logged on the day page.

### B6.2 Body composition — a fourth `BodyFocus`

`CompositionRow` already exists (`HelixLifestyle.swift:674-699`) and composition
already appears inside the weight Large. What is missing is a composition-**led**
face: fat % as the hero rather than a row under the scale weight.

- Small: fat % + delta + `fatTrend` sparkline.
- Medium: fat % hero, then Lean Soft Tissue / Skeletal Muscle / FFM as
  `CompositionRow`s (make it internal), each with `upIsGood` set per metric.
- Large: adds the fortnight trend and the weigh-in date.

Three rules that are non-negotiable and already written down in the file's own
header (`:666-671`): SMM (~27) ≠ lean soft tissue (~50) ≠ FFM (~53);
`muscleKg` is **labelled "Lean Soft Tissue"**, never "muscle"; and down-is-good
is per metric, never per sign.

**The atlas figure is not in this wave.** `src/lib/body/atlas.ts` does not exist
yet — it is C5, and the Swift generator depends on it. Wave B ships the numbers;
the figure lands when the atlas does.

No new payload: `body` and `weight` already carry everything
(`snapshot.ts:151-167`).

### B6.3 Helix Daily — one new kind

The only genuinely cross-family ask, so the only one worth a kind.
`kind: "HelixDailyFamily"`, scope `.full`, **`.systemLarge` only** — a 2×2
register grid at Medium is four illegible quadrants.

Four `Register`s (`HelixPrimitives.swift:567`), each a `Link` to its own
destination:

```
┌── FUEL ──────────────┬── WATER ─────────────┐
│ 1,240 / 1,955 kcal   │ 2.1 / 3.5 L          │
│ P ███░ C ██░░ F ██░  │ ▓▓▓▓▓░░░              │
├── STEPS ─────────────┼── TRAINING ──────────┤
│ 8,420 / 10,000       │ Legs & Core B        │
│ ▓▓▓▓▓▓▓░              │ due · 12 ex · 34 sets│
└──────────────────────┴──────────────────────┘
```

Every primitive exists. No new payload — `.full` already carries all four.
Adding a kind is safe: the destructive direction is *removing* one, which is what
`HelixWidgets.swift:23-27` warns about.

---

## Files

**New**
```
src/lib/native/widgetKinds.ts          the kind list, single source
src/lib/widget/cadence.ts              refresh table mirror (guard only)
src/tests/widget-kind-parity.test.ts
src/tests/widget-cadence.test.ts
src/tests/widget-section-parity.test.ts
src/tests/streak-future-days.test.ts
ios/App/HelixWidgets/HelixDaily.swift  the Daily kind + its face
ios/App/HelixWidgets/HelixCardio.swift the cardio faces
```

**Changed**
```
src/lib/widget/snapshot.ts             workout extras, cardio block
src/lib/widget/derive.ts               cardio derivation
src/app/api/widget/snapshot/route.ts   month window, prescription, cardio
src/lib/native/widgets.ts              reloadWidgets(kinds?)
src/lib/scoring/applyComputedScore.ts  kinds passthrough
src/lib/hooks/{useWaterOverride,useMacroOverride,useNutritionException,
               useDayVault,useSessionDraft}.ts   kind arguments
src/app/day/[date]/page.tsx            all six ?section= values
src/tests/widget-link-parity.test.ts   dated builders
ios/App/App/HelixWidgetBridge.swift    kinds argument
ios/App/HelixWidgets/HelixProvider.swift    shaped cadence, entry.age
ios/App/HelixWidgets/HelixPrimitives.swift  HelixMark, HelixBrand, HelixType,
                                            StaleTag(age:)
ios/App/HelixWidgets/HelixPalette.swift     HelixLink.day(_:section:)
ios/App/HelixWidgets/HelixIntents.swift     +cardio, +composition, DailyConfiguration
ios/App/HelixWidgets/HelixTraining.swift    Today faces, month calendar, DayCell
ios/App/HelixWidgets/HelixLifestyle.swift   composition focus, CompositionRow internal
ios/App/HelixWidgets/HelixWidgets.swift     HelixDailyWidget
```

## Order

1. Payload first (TS + route + tests) — nothing Swift can be checked until the
   server answers with the new shape.
2. Reload targeting + cadence + staleness — smallest Swift surface, highest value.
3. Deep links, both ends.
4. Today, then Calendar.
5. New focuses, then the Daily kind.

`HelixDailyFamily` goes into `WIDGET_KINDS` in step 5, **with** its Swift widget
— not in step 1. The parity test asserts set equality in both directions, so
registering a kind before the widget exists is a red suite for four steps.

Each step ends green on `npm run check` + `npx vitest run`. Swift does not
compile in this environment at all, so **every Swift change is unverified until
you build it in Xcode** — the same caveat as the Wave A Swift edits, and the
reason the payload half is sequenced first and tested hard.

## Verification

Local: `npm run check`, `npx vitest run`, `npm run build`, `npm run e2e`,
`graphify update .`.

On device, after a Netlify deploy — the parts I cannot do:

1. Every family at every size in the gallery, including the two new focuses and
   the Daily kind.
2. Tap every link and confirm the exact destination: a calendar cell opens
   **that** day, the sleep face opens today's sleep drawer.
3. The streak reads identically on the dashboard, the Training streak face, the
   calendar chip and the Today Large footer, at the same moment.
4. The calendar date is legible on a logged day at Small, Medium and Large.
5. Pull the network, wait an hour, confirm the tag says the real age.
6. `widget_tokens.last_used_at` advances.

## Deliberately not in this wave

- The atlas figure on the composition face — depends on C5.
- An App Group. The protocol seam is there; the capability is not.
- Interactive widgets (`AppIntent` buttons — log water from the home screen).
  iOS 17+ supports it and it is the single biggest thing missing from this
  gallery, but it is a Part 1.6-sized feature, not a polish item.
