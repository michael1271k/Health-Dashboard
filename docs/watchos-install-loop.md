# Breaking the watchOS install loop

The HelixWatch app spins forever on the Watch — "Installing…" that never
finishes, or an icon that appears, greys out, and vanishes. This is the runbook,
ordered cheapest-first, with a check after every step so you stop the moment it
works.

**Setup this is written for:** Capacitor + Next.js host app (`app.helix.health.michael`),
`HelixWatch Watch App` target (`app.helix.health.michael.watchkitapp`), plus a
`HelixWidgets` extension. Xcode workspace `ios/App/App.xcworkspace` (never the
`.xcodeproj` — CocoaPods).

---

## Read this first: "Code Sign On Copy" is *supposed* to be greyed out

You reported you can't tick **Code Sign On Copy** in the Embed Watch Content
phase. **You are not meant to be able to.** Xcode disables that checkbox for a
watch app on purpose:

> A watch app is signed by **its own target**, with its own provisioning profile.
> Re-signing it while copying it into the host app would replace that signature
> and break the `WKCompanionAppBundleIdentifier` pairing — which is exactly the
> failure you're chasing.

An un-clickable checkbox here is a correctly-configured project, not a broken
one. Chasing it is a dead end. (Where the checkbox *is* live and *does* matter
is **Embed Foundation Extensions** for `HelixWidgetsExtension.appex` and any
embedded `.framework`.)

## And: your Embed phase already exists and is correct

Verified in `ios/App/App.xcodeproj/project.pbxproj`:

```
4C90F04C3013EFF60096E03F /* Embed Watch Content */ = {
    isa = PBXCopyFilesBuildPhase;
    dstPath = "$(CONTENTS_FOLDER_PATH)/Watch";   ← correct destination
    dstSubfolderSpec = 16;                       ← 16 = "Products Directory"/Watch
    files = ( … HelixWatch Watch App.app … );    ← correct product embedded
};
```

and the pairing keys line up:

| Setting | Value | Must be |
|---|---|---|
| Host app bundle id | `app.helix.health.michael` | — |
| Watch app bundle id | `app.helix.health.michael.watchkitapp` | host id + `.watchkitapp` ✓ |
| `WKCompanionAppBundleIdentifier` | `app.helix.health.michael` | exactly the host id ✓ |
| `SKIP_INSTALL` (watch target) | `YES` | YES — it installs *inside* the host ✓ |
| `TARGETED_DEVICE_FAMILY` (watch) | `4` | 4 = Apple Watch ✓ |
| `WATCHOS_DEPLOYMENT_TARGET` | `10.0` | ≤ your watchOS ✓ |

**So the committed project is not the problem.** That is genuinely good news: it
means every remaining cause is on the *devices* — trust, pairing state, Developer
Mode, or the install transport — which is what the rest of this document fixes.

But check your **working tree** against the committed file first: an in-Xcode
edit can silently break a configuration that is correct in git. See the
`buildActionMask` box immediately below.

### ⚠️ Check this before anything else: `buildActionMask`

If you have been editing the phase in Xcode, check what it did to
`buildActionMask` on **Embed Watch Content**:

```bash
git diff ios/App/App.xcodeproj/project.pbxproj
```

```diff
  4C90F04C3013EFF60096E03F /* Embed Watch Content */ = {
      isa = PBXCopyFilesBuildPhase;
-     buildActionMask = 2147483647;    ← Xcode's default: run for EVERY action
+     buildActionMask = 12;            ← restricted to a subset of actions
```

`2147483647` (`0x7FFFFFFF`) is "run this phase for every build action".
A smaller mask means someone unticked boxes under the phase's
**Build for:** row — *Running, Testing, Profiling, Archiving, Installing,
Analyzing*.

**If Running is unticked, the watch app is never embedded when you press Run.**
Xcode reports a successful build, the phone app installs, and the Watch then
spins forever waiting for a bundle that was never inside it. That is an install
loop with no error anywhere, because nothing failed — the work simply wasn't
scheduled.

**Fix:** App target → **Build Phases** → expand **Embed Watch Content** → tick
**every** box on the **Build for:** row. Confirm the file goes back to
`buildActionMask = 2147483647`, then Clean Build Folder and reinstall.

While you're there, check the phase ORDER too. **Embed Watch Content** should
run *after* `[CP] Embed Pods Frameworks`, not before — CocoaPods' script stages
frameworks into the app bundle, and embedding the watch app first can have it
copied into a bundle the pods phase then rewrites.

---

> If you ever *do* need to recreate the phase: select the **App** target →
> **Build Phases** → **+** → **New Copy Files Phase** → set **Destination** to
> **Watch App** (not "Resources", not "Frameworks") → drag
> `HelixWatch Watch App.app` from Products into it. The destination dropdown is
> what makes it an Embed Watch Content phase; renaming a Resources phase does
> nothing.

---

## Step 0 — Confirm what you're actually looking at (30 seconds)

Different symptoms, different causes. Find yours:

| Symptom | Most likely cause | Jump to |
|---|---|---|
| Progress ring stuck at 0%, never moves | Watch never received the payload — transport | Step 3, 4 |
| Ring fills to ~100% then restarts | Signature/trust rejected at the end | Step 1, 2, 6 |
| Icon appears, greys out, disappears | Provisioning profile expired or untrusted | Step 2, 6 |
| "Unable to install" alert on iPhone | Bundle id / entitlement mismatch | Step 5, 7 |
| Xcode says "Build succeeded", nothing on Watch | Install ran against the phone only | Step 3 |

Also note the obvious one: **the Watch installs the watch app from the iPhone,
not from the Mac.** Xcode hands the bundle to the phone; the phone hands it to
the Watch over its own link. Most "loops" are that second hop failing silently.

---

## Step 1 — Developer Mode on **both** devices

Since iOS 16 / watchOS 9 this is mandatory, and the Watch is the one everyone
forgets. A Watch without Developer Mode will accept the transfer and then refuse
to launch — which presents as an endless install.

**iPhone:** Settings → Privacy & Security → scroll to the bottom → **Developer
Mode** → on → Restart when prompted → after reboot, tap **Turn On** on the
confirmation alert.

**Apple Watch:** Settings → Privacy & Security → **Developer Mode** → on →
**restart the Watch** (hold the side button → Power Off → hold side button to
boot).

> If **Developer Mode** doesn't appear on the Watch at all: it only shows after
> the Watch has been the target of at least one development install attempt.
> Connect the iPhone to the Mac, run once, then look again.

**Check:** both devices show Developer Mode = on, both have been restarted since
enabling it.

---

## Step 2 — Trust the developer certificate on the Watch

Trusting on the iPhone does **not** trust on the Watch. They are separate trust
stores, and this is the single most common cause of the ~100%-then-restart loop.

- **iPhone:** Settings → General → **VPN & Device Management** → your Apple ID →
  **Trust**.
- **Watch:** Settings → General → **VPN & Device Management** → your Apple ID →
  **Trust**. If the entry is absent, the app has never fully landed — do Step 3
  first, then come back here.

**On a free / Personal Team account:** the signature expires every **7 days**. An
app that worked last week and now loops is an expired profile, not a new bug.
Re-run from Xcode to re-sign. (This is described in `docs/ios-deploy-guide.md`.)

**Check:** the Watch's Device Management screen lists your certificate as
Trusted.

---

## Step 3 — Install over a wired proxy, with Bluetooth out of the way

The Watch↔iPhone link is Bluetooth by default, and BT is far too slow for an
app bundle — large installs time out and restart, forever. Force the pair onto
Wi-Fi and give the phone a wired path to the Mac.

1. Connect **iPhone → Mac by cable** (USB-C/Lightning). Not wireless debugging.
2. On the iPhone, turn **Bluetooth off** in Settings (not Control Centre —
   Control Centre only "disconnects" and it re-enables itself).
3. Confirm **both** iPhone and Watch are on the **same Wi-Fi network**, and that
   it is a normal 2.4/5 GHz network — not a captive-portal or guest network with
   client isolation, which blocks the peer-to-peer link entirely.
4. Keep the Watch **on its charger**, unlocked, screen awake, next to the phone.
   A locked or low-battery Watch defers installs indefinitely and reports nothing.
5. In Xcode, choose the scheme **HelixWatch Watch App** and pick your **Watch**
   as the run destination (not the iPhone). Run.

**Check:** Xcode's device list shows the Watch (not greyed out), and the install
progresses past where it previously stalled.

> Watch the *phone*, not Xcode. The Watch app icon appears on the iPhone's
> Watch app → My Watch list with a progress ring. That ring is the truth.

---

## Step 4 — Clear Derived Data and the stale build products

A half-written watch bundle inside Derived Data will be re-embedded, unchanged,
on every subsequent build — so a corrupted payload survives any number of
rebuilds and looks like an unfixable install loop.

```bash
# Quit Xcode FIRST — it holds file handles and will rewrite the folder.
rm -rf ~/Library/Developer/Xcode/DerivedData
```

Then, with Xcode reopened on `ios/App/App.xcworkspace`:

1. **Product → Clean Build Folder** (⇧⌘K).
2. Delete the app from the **iPhone** (long-press → Remove App). This removes the
   embedded watch app too.
3. Build once, targeting the **iPhone**, and confirm it launches.
4. Then run the **HelixWatch Watch App** scheme against the Watch.

If Capacitor's web assets are also suspect, resync them before building:

```bash
npm run build && npx cap sync ios
```

**Check:** a clean build succeeds and the iPhone app launches before you attempt
the watch install.

---

## Step 5 — Verify the deployment targets against the *actual* OS versions

You're on iOS 18 beta / watchOS 11 beta. Deployment targets are **minimums**, so
these are already compatible — but a mismatch in the other direction (a target
*above* the installed OS) makes the install fail with no useful message.

Current values in this project:

| Target | Setting | Value |
|---|---|---|
| App | `IPHONEOS_DEPLOYMENT_TARGET` | 16.6 |
| HelixWidgets | `IPHONEOS_DEPLOYMENT_TARGET` | 17.0 |
| HelixWatch Watch App | `WATCHOS_DEPLOYMENT_TARGET` | 10.0 |

Read the real versions off the devices (Settings → General → About) and confirm
each is **≥** the row above. Also confirm in Xcode → Settings → Platforms that a
**watchOS SDK is installed** — a Mac with only the iOS platform downloaded will
build the phone app happily and silently produce a stale/absent watch product.

**Check:** watchOS platform present in Xcode; device OS ≥ every deployment target.

---

## Step 6 — Turn off complications before installing

A complication from a previous build keeps the old watch app pinned as "in use".
The installer then tries to replace a bundle the system is actively holding, and
retries indefinitely.

1. On the Watch, long-press the face → **Edit** → remove every HelixWatch
   complication.
2. Do the same on **every** watch face you have, not just the active one.
3. Also remove HelixWatch from the **Dock** (Settings → Dock, or side-button list).
4. Reboot the Watch.
5. Install again.

**Check:** no HelixWatch complication or Dock entry survives before you install.

---

## Step 7 — Unpair and re-pair (the reset that actually clears tokens)

Do this only after 1–6. It costs ~30–60 minutes but it is the only thing that
clears corrupted pairing/provisioning tokens on the Watch, and those are
invisible from the Mac.

1. Keep Watch and iPhone together. Watch app on iPhone → **All Watches** → ⓘ →
   **Unpair Apple Watch**. **This automatically backs the Watch up to the phone.**
2. Wait for the unpair to complete fully (the Watch reboots to the pairing
   screen).
3. Re-pair → choose **Restore from Backup** → pick the backup just made.
4. Re-enable **Developer Mode** on the Watch (Step 1 — unpairing clears it).
5. Re-trust the certificate (Step 2).
6. Install again via Step 3.

**Check:** Watch re-paired, Developer Mode on, certificate trusted.

---

## Step 8 — If it still loops: get the real error

Stop guessing and read the log. The install failure is always logged, just never
surfaced in the UI.

**Console.app**
1. Open **Console** (⌘Space → "Console").
2. Select the **Apple Watch** in the left sidebar. (If it's absent, the Watch
   isn't reachable — go back to Step 3.)
3. Filter on `installd`, then reproduce the install.
4. Look for `MIInstallerErrorDomain`, `ApplicationVerificationFailed`,
   `MismatchedApplicationIdentifierEntitlement`, or `deviceOSVersionTooLow`.

**Xcode**
- **Window → Devices and Simulators** → select the Watch → **View Device Logs**.
- **Product → Run** with the watch scheme, then read the full build transcript
  (⌘9 → latest build → expand any "Embed Watch Content" or "CodeSign" step).

What the common errors mean here:

| Log string | Meaning | Fix |
|---|---|---|
| `ApplicationVerificationFailed` | Signature not trusted on the Watch | Step 2 |
| `MismatchedApplicationIdentifierEntitlement` | Watch bundle id ≠ host + `.watchkitapp` | Step 5 table |
| `deviceOSVersionTooLow` | Deployment target above the installed OS | Step 5 |
| `Failed to load Info.plist` | Corrupt embedded bundle | Step 4 |
| No `installd` entries at all | Payload never reached the Watch | Step 3 |

---

## Quick reference

```
1. Developer Mode  — iPhone AND Watch, restart both
2. Trust cert      — iPhone AND Watch (separate trust stores)
3. Wired proxy     — phone on cable, Bluetooth OFF, same Wi-Fi, Watch on charger
4. Derived Data    — quit Xcode, rm -rf, Clean Build Folder, delete app
5. Targets         — device OS ≥ deployment target; watchOS SDK installed
6. Complications   — remove from every face + Dock, reboot Watch
7. Unpair/re-pair  — last resort, backs up automatically
8. Console.app     — filter `installd`, read the actual error
```

**Two things to stop doing:**
- Chasing the greyed-out **Code Sign On Copy** checkbox — it is disabled by
  design for watch apps.
- Recreating the **Embed Watch Content** phase — this project's is already
  correct, and rebuilding it risks breaking a working configuration.
