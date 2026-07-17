# HELIX on your iPhone 15 — the absolute beginner's guide

This walks you from the PyCharm terminal to a native HELIX app on your own
iPhone, with a **free Apple ID** — no paid Developer Program. Zero Xcode
experience assumed. Budget ~1–2 hours the first time (most of it is Xcode
downloading).

**The mental model:** the native app is a thin Capacitor shell. It opens the
live Netlify deploy inside a WebView (so the UI always updates itself — no
rebuilds for web changes) and adds the one thing a website can't do: native
HealthKit access, pushed to `/api/ingest` with your own login token. You only
rebuild in Xcode when *native* things change (plugins, permissions, icons).

---

## 0. What you need

| Thing | Why |
|---|---|
| This Mac, ~40 GB free disk | Xcode is enormous |
| Xcode 15+ (free, Mac App Store) | Builds and signs the app |
| Your Apple ID (the normal iCloud one) | Free "Personal Team" code signing |
| iPhone 15 + USB-C cable | First install must be over cable |
| The repo, `npm install` already run | You have this |

**Free-account limits to know up front (all fine for personal use):**
- The app signature expires every **7 days** → once a week, plug in and press
  Run again (data is untouched — it's a re-sign, not a reinstall).
- Max **3 sideloaded apps** per free Apple ID.
- **HealthKit works on a free account.** Only App Store/TestFlight distribution
  and some heavyweight entitlements need the $99/year program.

---

## 1. Install Xcode

1. Mac App Store → search **Xcode** → Get. Go make coffee; it's ~12 GB.
2. Open Xcode once. Accept the license, let it "install additional components,"
   and when it asks which platforms to develop for, make sure **iOS** is checked
   (that download is another few GB).
3. In the terminal:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -runFirstLaunch
   ```
4. Install CocoaPods (Capacitor's iOS dependency manager):
   ```bash
   brew install cocoapods        # or: sudo gem install cocoapods
   pod --version                 # any modern version is fine
   ```

## 2. Sign in with your free Apple ID

1. Xcode → **Settings… → Accounts** (⌘,) → **+** → *Apple ID* → sign in with
   `michael127k@gmail.com` (or whichever Apple ID your iPhone uses).
2. You'll see a team named **"Michael (Personal Team)"**. That's your free
   signing identity. Nothing else to do here.

## 3. Generate the iOS project

From the repo root in your PyCharm terminal:

```bash
npm install @capacitor/ios
npx cap add ios          # creates the ios/ folder (native Xcode project)
```

Now the HealthKit plugin (native pod — this is why it wasn't in package.json
before):

```bash
npm install @perfood/capacitor-healthkit
npx cap sync ios         # copies config + runs pod install
```

> The bridge code in `src/lib/native/healthkit.ts` calls
> `registerPlugin('CapacitorHealthkit')` — that's exactly the name
> `@perfood/capacitor-healthkit` registers, so no code changes are needed.

Open the native project (always via this command, never the .xcodeproj):

```bash
npx cap open ios
```

## 4. One-time Xcode project setup

In the left sidebar click the blue **App** project icon → select the **App**
target → **Signing & Capabilities** tab:

1. **Team:** pick *Michael (Personal Team)*.
2. **Bundle Identifier:** free personal teams need a globally unique id.
   Change `app.helix.health` → **`app.helix.health.michael`** (anything unique).
   Then mirror it in the repo — edit `capacitor.config.ts` → `appId:
   'app.helix.health.michael'` — and run `npx cap sync ios` again so they match.
3. Leave **"Automatically manage signing"** checked. If it shows a "failed to
   register bundle identifier" error, the id isn't unique — add another suffix.
4. **+ Capability** (top-left of that pane) → add **HealthKit**.
   - If a *Background Delivery* checkbox appears under HealthKit, tick it.
5. **+ Capability** → **Background Modes** → tick *Background fetch* and
   *Background processing* (future-proofs the scheduled sync).
6. **Info tab** (same target) → hover any row → **+** → add these two keys
   (type them exactly; Xcode shows the friendly names):
   - `Privacy - Health Share Usage Description` →
     `HELIX reads your Apple Health metrics (steps, sleep, heart data, body composition) to compute your daily readiness.`
   - `Privacy - Health Update Usage Description` →
     `HELIX does not write to Apple Health, but the framework requires this description.`

## 5. Prepare the iPhone

1. Plug the iPhone into the Mac with the cable. Tap **Trust** on the phone.
2. iOS 16+: enable **Developer Mode** — Settings → Privacy & Security →
   Developer Mode → on → restart the phone. (If the toggle is missing, it
   appears after your first Run attempt from Xcode.)

## 6. Run it

1. In Xcode's toolbar, the device dropdown (next to the ▶) → pick **your
   iPhone** (not a simulator — HealthKit data lives only on the real device).
2. Press **⌘R** (Run). First build takes a few minutes.
3. The install will fail once with *"Untrusted Developer"* — that's normal:
   on the iPhone → Settings → General → **VPN & Device Management** → tap your
   Apple ID under *Developer App* → **Trust**. Press ⌘R again.
4. HELIX opens. Sign in as usual. When the HealthKit permission sheet appears,
   tap **Turn On All** → Allow.

**Verify the pipe:** open the app the next morning → Dashboard/`/vitals`
should show HealthKit numbers without the Shortcut. (The web `/api/ingest`
path your Shortcut uses keeps working in parallel — retire the Shortcut only
once you've seen a few days of clean native syncs.)

## 7. Life with a free account

- **Weekly re-sign:** after ~7 days the app icon greys out / won't open.
  Plug in, ⌘R, done. Your data is server-side; nothing is lost. (Upgrading to
  the paid program later extends this to 1 year + unlocks TestFlight.)
- **Web changes need nothing** — the shell loads the Netlify deploy, so every
  `git push` updates the app content over the air.
- **Rebuild (⌘R) only when** you add/remove a Capacitor plugin, change
  permissions/entitlements, or change the app icon.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `pod install` fails during `cap sync` | `cd ios/App && pod install --repo-update` |
| "Failed to register bundle identifier" | Bundle id taken — add a suffix, mirror it in `capacitor.config.ts`, `npx cap sync ios` |
| "Untrusted Developer" on launch | Settings → General → VPN & Device Management → Trust |
| "Developer Mode disabled" | Settings → Privacy & Security → Developer Mode → on → restart |
| Blank white screen in the app | The shell couldn't reach the Netlify URL — check the phone's internet; the `server.url` in `capacitor.config.ts` must be live |
| `CapacitorHealthkit plugin not implemented` in the console | Plugin not synced into the native project — `npx cap sync ios`, rebuild |
| HealthKit permission sheet never appears | The HealthKit capability is missing (step 4.4) or you ran on a Simulator |
| App won't open after a week | Free-signing expiry — plug in and ⌘R (step 7) |
| Build error mentioning signing certificates | Xcode → Settings → Accounts → select the team → *Download Manual Profiles*, then Product → Clean Build Folder (⇧⌘K) and ⌘R |

---

Architecture, metric map, and background-sync design live in
[`docs/native-ios.md`](./native-ios.md).
