# HELIX — Native iOS (Capacitor + HealthKit)

The native iOS app is a Capacitor shell around the existing web app. It loads the
live Netlify deploy (web content updates over-the-air) and adds native HealthKit
reads + haptics. All native code is guarded by `Capacitor.isNativePlatform()`, so
the web build ships zero native code and behaves identically.

## Architecture at a glance
- **Shell:** `capacitor.config.ts` → `server.url` = the Netlify URL. UI is 100% reused.
- **Auth:** the user signs in inside the WebView; the Supabase JWT persists in the
  container. No per-device secret.
- **Data path:** HealthKit → flat payload → `POST /api/ingest` with `Authorization:
  Bearer <jwt>` → the same `ingestDailyLog` fan-out + scoring the web uses. Realtime
  reflects the push on the phone AND any open desktop tab within ~1s.
- **Files:** `src/lib/native/healthkit.ts` (read + POST), `sync.ts` (resume
  orchestration), `haptics.ts`. That is the whole directory.
  (A `platform.ts` exporting `usePlatform` / `isNative` was documented here for a
  long time and has never existed; `isNative` survives only as a private local in
  `src/lib/supabase/client.ts`.)

## HealthKit metric map (`healthkit.ts`)
| HealthKit type | payload key | reduce |
|---|---|---|
| StepCount | steps | sum |
| ActiveEnergyBurned | active_energy | sum |
| AppleExerciseTime | training_minutes | sum |
| AppleStandHour | standing_minutes | sum |
| HeartRateVariabilitySDNN | hrv | avg |
| RestingHeartRate | avg_rest_heart_rate | latest |
| RespiratoryRate | respiratory_rate | avg |
| OxygenSaturation | blood_oxygen | latest |
| VO2Max | vo2max | latest |
| BodyMass | weight | latest |
| SleepAnalysis | (sleep_minutes — via category samples) | sum of asleep |

The ingest schema's adaptive rules already handle these (e.g. `standing_minutes`
minutes→hours, `training_minutes`→`exercise_minutes`).

## Smart background sync

- **Foreground — SHIPPED.** `initNativeSync()` runs on app resume (`@capacitor/app`
  `appStateChange`), behind a 10s re-entrancy guard (which collapses iOS's
  duplicate resume events; it is not a throttle, and every genuine app-open runs
  a full sync). Its `/api/compute-score` POST shares a watermark with the
  dashboard's — see `src/lib/utils/scoreWatermark.ts`.

- **Background — NOT IMPLEMENTED.** This section used to describe a
  `BGAppRefreshTask` calling `backgroundSync()` as though it existed. It does
  not, at any layer:
  - `Info.plist` declares two identifiers (`app.helix.health.refresh`,
    `app.helix.health.processing`), but **no Swift code registers a handler for
    either** — no `BGTaskScheduler` call exists anywhere in `ios/`.
  - The JS entry point `backgroundSync()` had zero callers for its whole life and
    was removed on 2026-08-12. This paragraph was its only reference, which is
    exactly how it survived a dead-code sweep: the doc made it look wired.

  To actually build it: register the identifiers in `AppDelegate`, bridge to a
  JS entry point, and re-add the export. Also worth pairing with HealthKit
  **Background Delivery** for sleep/HRV, coalesced and skipped when unchanged.

- **Battery:** per-metric last-synced watermark; `.immediate` delivery only for
  sleep on wake. (Also aspirational — the current sync pulls the full metric map
  each pass.)

## Your build steps

**→ Follow [`docs/ios-deploy-guide.md`](./ios-deploy-guide.md)** — the complete,
zero-assumed-knowledge walkthrough for putting HELIX on your iPhone with a
**free Apple ID** (no $99 Developer Program needed for personal installs;
HealthKit works on a free "Personal Team"). The paid program is only required
later for TestFlight/App Store distribution and for background-delivery
entitlements that survive longer provisioning windows.

## App Store review notes
- The shell is more than a webview wrapper: native HealthKit integration + background
  sync provide the "minimum functionality" that satisfies guideline 4.2.
- Health data usage strings must be clear; only READ scopes are requested.
- No secrets in the bundle — auth is the user's own JWT, RLS-scoped.

## Deployment
- **Web + web content in the app:** push → Netlify build → live for both instantly.
- **Native shell (plugins/entitlements/icons):** versioned Xcode build → TestFlight →
  App Store. CI for web is unchanged.
