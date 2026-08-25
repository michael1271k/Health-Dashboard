import WidgetKit
import SwiftUI

// MARK: - The bundle
//
// ── WHAT HAPPENED TO THE OTHER SEVEN ─────────────────────────────────────────
// This file used to hold five `StaticConfiguration` widgets — Fuel, Battery,
// Today, This Week and Battery (Lock Screen) — alongside two configurable
// composites declared elsewhere. Seven kinds, and the content overlapped badly:
// "Today" was the Lifestyle ledger with a fixed focus, "This Week" was the
// Performance ledger with a fixed focus, and "Battery" was one ring that also
// appeared on three other faces. The gallery listed the same numbers three times
// and none of the copies could be reconfigured.
//
// Four families now, each `AppIntentConfiguration` with its own focus picker,
// split by what you are asking rather than by which screen the number came from:
//
//   Fuel      calories · macros · water            S M L
//   Training  today · calendar · volume · streak · records · 1RM   S M L
//   Body      weight · sleep · well-being          S M L
//   Vitals    panel · recovery · breathing · temperature   S M L
//   Lock      battery · calories · steps · workout accessory
//
// ⚠️ THE OLD KINDS ARE GONE, and a widget kind that no longer exists disappears
// from the Home Screen on install. Every previously placed Helix widget has to
// be added again once. That is deliberate and was accepted — carrying seven
// dead kinds forever to avoid one re-add is how a widget gallery becomes a
// museum.
//
// Every face lives in its own file (`HelixLifestyle`, `HelixTraining`,
// `HelixPerformance`, `HelixLock`) with the shared parts in `HelixPrimitives`,
// `HelixPalette` and `HelixProvider`. No Xcode target-membership step is needed:
// `HelixWidgets` is a `PBXFileSystemSynchronizedRootGroup`, so every .swift file
// in the folder belongs to `HelixWidgetsExtension` by virtue of being in it.
// `ios/App/Shared/` is NOT synchronized — files added there still need manual
// target membership.

struct HelixFuelWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixFuelFamily",
      intent: FuelConfiguration.self,
      provider: HelixIntentProvider<FuelConfiguration>()
    ) { entry in
      FuelView(entry: entry, focus: entry.fuelFocus)
    }
    .configurationDisplayName("Fuel")
    .description("Calories, macros and hydration. Tap through to Nutrition.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HelixTrainingWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixTrainingFamily",
      intent: TrainingConfiguration.self,
      provider: HelixIntentProvider<TrainingConfiguration>()
    ) { entry in
      TrainingView(entry: entry, focus: entry.trainingFocus)
    }
    .configurationDisplayName("Training")
    .description("Today's session, the month, volume, streak and records.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HelixBodyWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixBodyFamily",
      intent: BodyConfiguration.self,
      provider: HelixIntentProvider<BodyConfiguration>()
    ) { entry in
      BodyView(entry: entry, focus: entry.bodyFocus)
    }
    .configurationDisplayName("Body")
    .description("Weight, sleep and the daily score. Tap through to Progress.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HelixVitalsWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixVitalsFamily",
      intent: VitalsConfiguration.self,
      provider: HelixIntentProvider<VitalsConfiguration>()
    ) { entry in
      VitalsView(entry: entry, focus: entry.vitalsFocus)
    }
    .configurationDisplayName("Vitals")
    .description("Overnight readings against your own normal — HRV, resting HR, temperature, blood oxygen, breathing.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HelixLockWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixLockFamily",
      intent: LockConfiguration.self,
      provider: HelixIntentProvider<LockConfiguration>()
    ) { entry in
      LockView(entry: entry, focus: entry.lockFocus)
    }
    .configurationDisplayName("Helix (Lock Screen)")
    .description("One fact on the Lock Screen: battery, calories, steps or today's session.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

@main
struct HelixWidgetsBundle: WidgetBundle {
  var body: some Widget {
    // The gallery lists a bundle in declaration order, so this is the order the
    // families are offered in: what to eat, what to train, how the body is
    // doing, the whole day at once, and then the accessory sizes.
    //
    // ⚠️ `kind:` strings are load-bearing beyond WidgetKit: the app names them
    // when it reloads a subset of timelines, and `widget-kind-parity.test.ts`
    // asserts this file's set matches `WIDGET_KINDS` in
    // src/lib/native/widgetKinds.ts in both directions. Adding a widget without
    // registering it there fails the suite — which is what makes targeted
    // reloads safe to rely on.
    HelixFuelWidget()
    HelixTrainingWidget()
    HelixBodyWidget()
    // ADDING a kind is safe — it is REMOVING one that wipes placed instances.
    // Nothing above is disturbed by this line.
    HelixDailyWidget()
    // Same reasoning as the line above: ADDING a kind disturbs nothing that is
    // already on a Home Screen.
    HelixVitalsWidget()
    // ── The running workout ──
    // An `ActivityConfiguration`, not a `StaticConfiguration`, so it never
    // appears in the widget gallery and has no `kind:` string — which is why it
    // is deliberately absent from `WIDGET_KINDS` and why the parity test does
    // not know about it. Nothing places it; the app starts it when a session
    // begins and ends it when the session commits. See `HelixWorkoutActivity`.
    //
    // Availability-gated rather than raising the extension's deployment target:
    // 16.1 is where ActivityKit lands, the rest of the bundle is happy at 16.6,
    // and a target bump is a change to every widget to enable one.
    if #available(iOS 16.1, *) {
      HelixWorkoutActivityWidget()
    }
    HelixLockWidget()
  }
}
