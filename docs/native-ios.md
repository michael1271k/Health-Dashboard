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
- **Files:** `src/lib/native/healthkit.ts` (read + POST), `sync.ts` (resume +
  background orchestration), `platform.ts` (`usePlatform`, `isNative`),
  `haptics.ts`.

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
- **Foreground:** `initNativeSync()` runs on app resume (`@capacitor/app`
  `appStateChange`), throttled by a 30-min watermark in localStorage.
- **Background (native config, in Xcode):** register HealthKit **Background
  Delivery** for sleep/HRV and a **BGAppRefreshTask** (`BGTaskScheduler`) on a
  ~2–4h cadence that calls `backgroundSync()`. Coalesce; skip when unchanged.
- **Battery:** per-metric last-synced watermark; `.immediate` delivery only for
  sleep on wake.

## Your build steps (Apple toolchain)
1. Join the **Apple Developer Program** ($99/yr).
2. `npm install` then `npx cap add ios` (needs Xcode + CocoaPods).
3. Add a HealthKit Capacitor plugin pod (e.g. `@perfood/capacitor-healthkit`) and
   ensure it registers as `CapacitorHealthkit` (matches `registerPlugin` in
   `healthkit.ts`) — or adjust the plugin name to your chosen library.
4. In Xcode: add the **HealthKit** capability, `NSHealthShareUsageDescription`
   ("HELIX reads your health metrics to compute readiness."), and **Background
   Modes → Background fetch / processing**.
5. Set the bundle id to `app.helix.health` (or your own; update `capacitor.config.ts`).
6. `npx cap sync ios`, run on device, grant Health permission.
7. Release via **Fastlane → TestFlight → App Store**.

## App Store review notes
- The shell is more than a webview wrapper: native HealthKit integration + background
  sync provide the "minimum functionality" that satisfies guideline 4.2.
- Health data usage strings must be clear; only READ scopes are requested.
- No secrets in the bundle — auth is the user's own JWT, RLS-scoped.

## Deployment
- **Web + web content in the app:** push → Netlify build → live for both instantly.
- **Native shell (plugins/entitlements/icons):** versioned Xcode build → TestFlight →
  App Store. CI for web is unchanged.
