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
    // doing, and then the accessory sizes.
    HelixFuelWidget()
    HelixTrainingWidget()
    HelixBodyWidget()
    HelixLockWidget()
  }
}
