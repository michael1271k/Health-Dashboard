import WidgetKit
import SwiftUI

// MARK: - The original five
//
// ── WHY THIS FILE IS NOW SHORT ───────────────────────────────────────────────
// It was 482 lines holding the palette, every primitive, the timeline provider,
// five faces and the bundle. Every primitive was `private`, so a second file
// physically could not use one — the length was self-enforcing.
//
// Split into `HelixPalette`, `HelixPrimitives`, `HelixProvider`, `HelixIntents`,
// `HelixLifestyle` and `HelixPerformance`. No Xcode target-membership step was
// needed: `HelixWidgets` is a `PBXFileSystemSynchronizedRootGroup`, so every
// .swift file in the folder is a member of `HelixWidgetsExtension` by virtue of
// being in the folder.
//
// These five stay `StaticConfiguration`. They each answer exactly one question,
// a picker on a one-question widget is a setting nobody opens, and — more to the
// point — anything already sitting on a home screen keeps working untouched.

/// Small · what is left to eat today.
struct FuelView: View {
  let entry: HelixEntry
  @Environment(\.widgetRenderingMode) private var mode

  private var s: HelixSnapshot? { entry.snapshot }
  private var proteinProgress: Double? {
    HelixSnapshot.progress(s?.macros.proteinG, s?.macros.proteinGoalG)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: true)
      } else {
        Caption("KCAL LEFT")
        BigValue(value: s?.caloriesRemaining.map { "\($0)" })
        Spacer(minLength: 0)
        HStack(spacing: 4) {
          Image(systemName: "fork.knife").font(.system(size: 9)).foregroundStyle(Helix.emerald)
          BigValue(
            value: s?.macros.proteinG.map { "\(Int($0.rounded()))g" },
            size: 12, color: .white
          )
          Spacer(minLength: 0)
          if entry.isStale { StaleTag() }
        }
        Rail(progress: proteinProgress, color: mode == .accented ? .white : Helix.emerald)
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(HelixLink.nutrition)
  }
}

/// Small · how much of the day's battery is left, and what today is.
struct BatteryView: View {
  let entry: HelixEntry
  // Was missing entirely, so in iOS 18's tinted mode the ring stayed emerald or
  // oxide while everything around it flattened to the accent — the one element
  // on the face that looked like a rendering bug.
  @Environment(\.widgetRenderingMode) private var mode

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: true)
      } else {
        HStack(spacing: 4) {
          Caption(s?.workout.isRestDay == true ? "REST" : "TRAIN", color: Helix.steel)
          Spacer(minLength: 0)
          if s?.workout.logged == true {
            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 10))
              .foregroundStyle(mode == .accented ? .white : Helix.emerald)
          }
        }
        Spacer(minLength: 0)
        HStack {
          Spacer(minLength: 0)
          BatteryRing(pct: s?.battery, size: 78, monochrome: mode == .accented)
          Spacer(minLength: 0)
        }
        Spacer(minLength: 0)
        Text(s?.workout.label ?? "—")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(Helix.muted)
          .lineLimit(1)
      }
    }
    .containerBackground(Helix.background, for: .widget)
    // A rest day opens Progress (recovery is the day's job); a training day
    // opens the logger, which is the next thing you were going to do anyway.
    .widgetURL(s?.workout.isRestDay == true ? HelixLink.progress : HelixLink.workout)
  }
}

/// Medium · the whole day in one glance.
struct TodayView: View {
  let entry: HelixEntry
  @Environment(\.widgetRenderingMode) private var mode

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mode == .accented ? .white : c }

  var body: some View {
    HStack(spacing: 14) {
      if entry.isEmpty {
        Unavailable(status: entry.status)
      } else {
        VStack(alignment: .leading, spacing: 7) {
          HStack(spacing: 5) {
            Caption("TODAY")
            if entry.isStale { StaleTag() }
          }
          Metric(
            value: s?.caloriesRemaining.map { "\($0)" },
            label: "kcal left", color: tint(Helix.ember)
          )
          Metric(
            value: s?.macros.proteinG.map { "\(Int($0.rounded()))g" },
            label: "protein", color: tint(Helix.emerald)
          )
          Metric(
            value: s?.steps.count.map { "\($0)" },
            label: "steps", color: .white
          )
          Metric(
            value: s?.water.ml.map { String(format: "%.1fL", $0 / 1000) },
            label: "water", color: tint(Helix.sapphire)
          )
        }
        Spacer(minLength: 0)
        // The battery is its own region and its own destination — a tap on the
        // ring is a question about recovery, not about lunch.
        Link(destination: HelixLink.home ?? HelixLink.nutrition!) {
          BatteryRing(pct: s?.battery, monochrome: mode == .accented)
        }
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(HelixLink.nutrition)
  }
}

/// Medium · the training week so far.
struct WeekView: View {
  let entry: HelixEntry
  @Environment(\.widgetRenderingMode) private var mode

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mode == .accented ? .white : c }

  /// The week is optional here, its FIELDS are not — `sessions`, `volumeKg`,
  /// `sets` and `prs` are plain `Int`/`Double` because a snapshot always counts
  /// them, even at zero. That is why they are formatted off this one optional
  /// rather than in place: in `s?.week.volumeKg.map { … }` the `.map` binds to
  /// the *unwrapped* `Double`, which has no such member, so the whole file
  /// fails to compile. Only a leaf that is itself optional (`macros.proteinG`)
  /// can take `.map` mid-chain.
  private var week: HelixSnapshot.Week? { s?.week }

  /// Sessions carry a denominator when the plan states one. "3" alone is not a
  /// fact you can act on at a glance; "3/5" is.
  private var sessions: String? {
    guard let week else { return nil }
    if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target)" }
    return "\(week.sessions)"
  }

  var body: some View {
    HStack(spacing: 14) {
      if entry.isEmpty {
        Unavailable(status: entry.status)
      } else {
        VStack(alignment: .leading, spacing: 7) {
          HStack(spacing: 5) {
            Caption("THIS WEEK")
            if entry.isStale { StaleTag() }
          }
          Metric(value: sessions, label: "sessions", color: tint(Helix.sapphire))
          Metric(
            value: week.map { String(format: "%.1f t", $0.volumeKg / 1000) },
            label: "volume", color: .white
          )
          Metric(value: week.map { "\($0.sets)" }, label: "sets", color: Helix.steel)
          Metric(value: week.map { "\($0.prs)" }, label: "PRs", color: tint(Helix.gold))
        }
        Spacer(minLength: 0)
        Link(destination: HelixLink.home ?? HelixLink.workout!) {
          BatteryRing(pct: s?.battery, monochrome: mode == .accented)
        }
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(HelixLink.workout)
  }
}

/// Lock screen / Smart Stack · the battery alone.
struct BatteryAccessoryView: View {
  let entry: HelixEntry
  // Accessory families render in `.accented` or `.vibrant`; a Gauge that keeps
  // its own tint there fights the lock screen's rendering rather than joining it.
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    Gauge(value: Double(entry.snapshot?.battery ?? 0), in: 0...100) {
      Image(systemName: "bolt.fill")
    } currentValueLabel: {
      // Still an em dash when unknown — the gauge sits at zero because it
      // has to sit somewhere, but the NUMBER never lies about it.
      Text(entry.snapshot?.battery.map { "\($0)" } ?? "—")
    }
    .gaugeStyle(.accessoryCircular)
    .tint(mode == .fullColor ? Helix.battery(entry.snapshot?.battery) : nil)
    .containerBackground(.clear, for: .widget)
    .widgetURL(HelixLink.home)
  }
}

// MARK: - Widget declarations

struct HelixFuelWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HelixFuel", provider: HelixProvider()) { entry in
      FuelView(entry: entry)
    }
    .configurationDisplayName("Fuel")
    .description("Calories remaining and protein for today.")
    .supportedFamilies([.systemSmall])
  }
}

struct HelixBatteryWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HelixBattery", provider: HelixProvider()) { entry in
      BatteryView(entry: entry)
    }
    .configurationDisplayName("Battery")
    .description("Today's recovery battery and scheduled session.")
    .supportedFamilies([.systemSmall])
  }
}

struct HelixTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HelixToday", provider: HelixProvider()) { entry in
      TodayView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Fuel, protein, steps, water and the recovery battery.")
    .supportedFamilies([.systemMedium])
  }
}

struct HelixWeekWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HelixWeek", provider: HelixProvider()) { entry in
      WeekView(entry: entry)
    }
    .configurationDisplayName("This Week")
    .description("Sessions, volume, sets and PRs against the plan.")
    .supportedFamilies([.systemMedium])
  }
}

struct HelixBatteryAccessoryWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HelixBatteryAccessory", provider: HelixProvider()) { entry in
      BatteryAccessoryView(entry: entry)
    }
    .configurationDisplayName("Battery (Lock Screen)")
    .description("Recovery battery as a lock-screen gauge.")
    .supportedFamilies([.accessoryCircular])
  }
}

@main
struct HelixWidgetsBundle: WidgetBundle {
  var body: some Widget {
    // The composites first — they are the ones worth a home-screen slot, and the
    // gallery lists a bundle in declaration order.
    HelixLifestyleWidget()
    HelixPerformanceWidget()
    HelixFuelWidget()
    HelixBatteryWidget()
    HelixTodayWidget()
    HelixWeekWidget()
    HelixBatteryAccessoryWidget()
  }
}
