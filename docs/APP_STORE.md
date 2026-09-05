# ONYX — App Store 1.0

Everything App Store Connect asks for, in the order it asks. Written for Wave 8
of `NATIVE_MIGRATION_PLAN.md`, refreshed at Wave 2.12 of
`NATIVE_PHASE_2_PLAN.md` — the wave that renamed the app. Fill the `⟨…⟩`
placeholders in the web form; every other line is already true of the binary and
was verified against a Release build, not asserted.

**The app is called Onyx.** The bundle identifiers still read `app.helix.health…`
and they stay that way until Gate 0: renaming a bundle id before the App Group
is provisioned means re-provisioning it, and the id is never shown to anyone.

---

## 1. Identity

| Field | Value |
|---|---|
| Bundle ID | `app.helix.health.michael.native` |
| Widget extension | `app.helix.health.michael.native.widgets` |
| Version (`CFBundleShortVersionString`) | `1.0` |
| Build (`CFBundleVersion`) | `1` |
| Team | `W9UMPV973P` |
| Deployment target | iOS 18.0 |
| Devices | iPhone only, portrait only |
| Primary category | Health & Fitness |
| Secondary category | *(leave empty)* |
| Age rating | 4+ — no user-generated content, no web view of arbitrary URLs, no ads |
| App icon | `native/HelixNative/Resources/Assets.xcassets/AppIcon.appiconset` — one 1024 × 1024, no alpha: the black onyx squircle with the broken lavender→indigo ring (§8 of the Phase 2 plan). The same ring `OnyxMark` draws in the app, so the Home Screen and the nav bar show one object. Verified compiled into `Assets.car`. |

The app and the widget extension carry the **same** marketing and build numbers.
App Store Connect rejects an extension whose version differs from its host, and
they are set from one pair of values in `native/project.yml`.

**The Home Screen name is `Onyx`** (`CFBundleDisplayName`, set in
`native/project.yml` for both the app and its widget extension, which reads
`Onyx Activity`). It is already distinct from the Capacitor app's `HELIX`, so
the two icons still tell themselves apart while both are installed.

---

## 2. Metadata template

**Name** (30 chars) — `Onyx`

**Subtitle** (30) — `⟨Training, fuel and recovery⟩`

**Promotional text** (170, editable without a review)

> ⟨Week 8 of the cut. Every set, every meal and every night's sleep in one
> place, with the numbers that actually move.⟩

**Description** (4000)

> ⟨Onyx is a single-user training and nutrition system. It logs strength
> sessions set by set, reads activity, heart, sleep, body-measurement and
> nutrition data from Apple Health, and turns both into a daily readiness score,
> a training battery and an energy balance you can act on the same morning.
>
> • Live logger — prescribed sets, double progression, rest timer on the Lock
>   Screen, RPE where you want it
> • Today — one screen of the tiles you choose, in the order you choose
> • Nutrition — targets that follow the phase you are actually in, not a fixed
>   number
> • Pulse — sleep, heart, soreness and the recovery battery in one place
> • History — every week back to the first session, day by day
> • Charts — every metric back to the first session
> • Home Screen and Lock Screen widgets for all of it
>
> Onyx does not sell your data, share it with anyone, or send it to an
> advertising network. It talks to exactly one server: your own private
> account.⟩

**Keywords** (100, comma-separated, no spaces)

> `⟨gym,workout,lifting,strength,hypertrophy,macros,cutting,recovery,hrv,sleep,progressive,overload⟩`

**Support URL** — `⟨https://helix-health-fitness.netlify.app/support⟩`
**Marketing URL** — *(optional; leave empty)*
**Privacy Policy URL** — `https://helix-health-fitness.netlify.app/privacy`

> **This page must exist and return 200 before you submit.** App Review opens it
> for every app carrying the HealthKit entitlement, and a 404 is an instant
> rejection under 5.1.1. The same URL is linked in-app from **Settings → About**
> (`HelixLinks.privacyPolicy`) — change it in one place.
>
> It has to say, in plain language: what is collected (Health data, email),
> why (to compute the scores the app displays), where it goes (this device and
> one Supabase project), that it is never sold or shared, and how to delete it.

---

## 3. App Privacy answers

Match `PrivacyInfo.xcprivacy` exactly — a questionnaire that disagrees with the
manifest is its own rejection.

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data? | **Yes** |
| Health & Fitness → Health | Collected · **Linked** to identity · not used for tracking · App Functionality |
| Health & Fitness → Fitness | Collected · **Linked** · not tracking · App Functionality |
| Contact Info → Email Address | Collected · **Linked** · not tracking · App Functionality |
| Any other category | **No** |
| Used for tracking? | **No** — `NSPrivacyTracking` is `false`, `NSPrivacyTrackingDomains` is empty |
| Third-party SDKs | GRDB and swift-crypto, both bundled with their own manifests; neither collects |

**Required-reason APIs declared** (app and extension both):

| API category | Reason | Why |
|---|---|---|
| `UserDefaults` | `CA92.1` | App Group suite, read by the app and the timeline provider; never leaves the device |
| `FileTimestamp` | `C617.1` | GRDB stats `helix.sqlite` and its `-wal` when it opens them |
| `DiskSpace` | `E174.1` | SQLite checks free space before a write |

The extension carries its **own** manifest: the required-reason check runs per
Mach-O binary at upload, so the app's does not cover `HelixNativeWidgets.appex`.

---

## 4. Review notes

Paste into **App Review Information → Notes**:

> Onyx is a single-user personal training log. There is no public sign-up — the
> account is created server-side — so a demo account is provided below.
>
> Sign in with:
>   Email: ⟨demo@…⟩
>   Password: ⟨…⟩
>
> The account is seeded with several months of training, nutrition and body
> data, so every tab has real content on first launch.
>
> Apple Health: the app asks for **read** access on first foreground and works
> fully without it — the demo account's data is already on the server, so you
> can decline the Health prompt and still review every screen. Health data is
> used only to compute the readiness, recovery and energy-balance figures shown
> in the app; it is never sold, shared or used for advertising.
>
> Home Screen widgets: add any Onyx widget from the widget gallery. They read
> the same local database the app writes and make no network requests.

`Sign in required: Yes`. Demo credentials are a **hard** requirement here — the
first screen is a login wall, and a reviewer who cannot get past it rejects
under 2.1.

---

## 5. Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in the binary, so App Store Connect
does not ask and TestFlight never stalls in *Missing Compliance*. The answer is
correct: the only cryptography is HTTPS to Supabase and the system Keychain,
both exempt under Category 5 Part 2.

---

## 6. Screenshots

```bash
scripts/store-shots.sh
```

Writes `native/__store__/6.9in/` (1320 × 2868, **required**) and
`native/__store__/6.3in/` (1206 × 2622) — six screens each: Today, Workout,
Nutrition, Pulse, Body trends, History, in that order. That is the app's own tab
order, then the two screens that show it has history. Deterministic: the
`--helix-screen` harness seeds in-memory data, so no account and no network are
involved and the same command produces the same PNGs tomorrow.

The output is gitignored. Regenerate, upload, move on.

---

## 7. Preflight checklist

Against `capacitor-apple-review-preflight`'s rule set. Every row answered.

| Rule | Verdict |
|---|---|
| `design/minimum_functionality` | **Pass.** Native SwiftUI, five tabs (Today · Workout · Nutrition · Pulse · Settings), live logging, widgets, an interactive Live Activity. Not a web wrapper — the Capacitor shell is a separate bundle ID and is not what ships. |
| `design/sign_in_with_apple` | **N/A.** No third-party or social login. Email + password to a first-party server only, which does not trigger 4.8. |
| `entitlements/unused_entitlements` | **Pass.** Two entitlements, both used: `com.apple.developer.healthkit` (`HealthSync.requestAuthorization`) and the App Group (the shared GRDB file the widgets read). No `.access`, no `.background-delivery`. |
| `privacy/privacy_manifest` | **Pass.** `PrivacyInfo.xcprivacy` in both bundles; verified present in the Release build, not just in the repo. |
| `privacy/unnecessary_data` | **Pass.** Health read scope is exactly `HealthCatalogue` plus sleep analysis, and every type feeds a figure on screen. No contacts, no location, no camera, no photos, no ATT. |
| `metadata/accurate_metadata` | **Open** until §2 is filled in. The description must not promise the Watch app — that is 1.1. |
| `metadata/apple_trademark` | **Pass** as long as §2 says "Apple Health" and "Home Screen", never "iOnyx", "for iPhone" in the name, or an Apple logo in a screenshot. |
| `metadata/china_storefront` | **N/A.** No ICP filing needed; ship to all storefronts or exclude China — either is fine, nothing in the app requires a licence. |
| `metadata/competitor_terms` | **Pass.** No competitor name in the keywords above. Keep it that way — "Hevy" and "Whoop" appear nowhere in shipping copy. |
| `subscription/*` (3 rules) | **N/A.** No IAP, no subscription, no paywall. Nothing in the binary links StoreKit. |

**Security gate** (verified against `Release-iphonesimulator/HelixNative.app`):

- The only credential in the bundle is the Supabase **anon** JWT — the role
  claim was decoded and read `anon`. RLS is what protects the data.
- `service_role` appears in no file in the bundle and in no source file.
- The session JWT lives in the Keychain (`KeychainAuthStorage`), never in
  `UserDefaults`.
- `Secrets.xcconfig` is gitignored and untracked.
- **No `UIBackgroundModes` at all** — no `processing`, no `fetch`, nothing to
  register or justify. Health is pulled on foreground; the Live Activity clock
  runs without waking the app.

**Performance gate:**

- Launch path audited: `HelixNativeApp` draws a `ProgressView` and does the
  database open and Keychain read inside a `.task`; `AppEnvironment.start()` is
  async; the Health pull is a detached task on foreground, never on launch. No
  synchronous network and no blocking work before the first frame.
- The **< 1 s cold-launch number itself is not measured yet.** It needs
  Instruments against a device build, which needs the paid Developer Program —
  Gate 0, still open. A simulator figure would be a Mac CPU running unthinned
  binaries and would not mean anything.

---

## 8. What is actually blocking submission

1. **Gate 0 — the Apple Developer Program.** A free personal team cannot sign
   the App Group entitlement, cannot upload to App Store Connect, and cannot
   run Instruments on a device. Nothing below moves until this is bought.
2. **The privacy-policy page.** URL is wired into the app and the metadata; the
   page has to exist.
3. **The demo account.** Create it, seed it, put the credentials in §4.
4. §2 filled in, §6 run, §3 typed into the questionnaire, archive, upload.

Everything else that Wave 8 owns is done and was verified against a Release
build: the privacy manifests, the export-compliance key, the version pair, the
app icon, the screenshot loop, the security gate — and a Release-configuration
build that compiles at all, which before this wave it did not.
