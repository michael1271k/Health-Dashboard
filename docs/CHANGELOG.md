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
