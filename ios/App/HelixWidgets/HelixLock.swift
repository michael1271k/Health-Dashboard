import WidgetKit
import SwiftUI

// MARK: - Helix Lock
//
// The accessory families: Lock Screen and Smart Stack. Previously one static
// kind that could only ever show the battery — so the surface with the least
// room was the only one with no choice about what went in it, which is exactly
// backwards.
//
// ── WHY THESE FACES ARE NOT SMALL WIDGETS SHRUNK ─────────────────────────────
// An accessory has no background and renders in `.accented` or `.vibrant`: the
// system flattens everything to one tint, so colour carries NO information here
// and any face that leans on it loses its meaning. What survives is shape (the
// gauge), one glyph, and one number — which is why each focus is a single fact
// and none of them is a ledger.

struct LockView: View {
  let entry: HelixEntry
  let focus: LockFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    Group {
      switch family {
      case .accessoryInline: inlineFace
      case .accessoryRectangular: rectangularFace
      default: circularFace
      }
    }
    // `.clear`, not the widget background: an accessory sits on the wallpaper
    // and painting obsidian behind it draws a black rectangle on the Lock Screen.
    .containerBackground(.clear, for: .widget)
    .widgetURL(focus.link(entry.snapshot?.date))
  }

  // MARK: Circular

  /// A gauge for anything with a goal; a glyph and a number for anything without.
  @ViewBuilder private var circularFace: some View {
    switch focus {
    case .battery:
      Gauge(value: Double(s?.battery ?? 0), in: 0...100) {
        Image(systemName: "bolt.fill")
      } currentValueLabel: {
        // Still an em dash when unknown — the gauge sits at zero because it has
        // to sit somewhere, but the NUMBER never lies about it.
        Text(s?.battery.map { "\($0)" } ?? "—")
      }
      .gaugeStyle(.accessoryCircular)
      .tint(mode == .fullColor ? Helix.battery(s?.battery) : nil)

    case .calories:
      Gauge(value: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal) ?? 0, in: 0...1) {
        Image(systemName: "flame.fill")
      } currentValueLabel: {
        Text(s?.caloriesRemaining.map { "\($0)" } ?? "—")
          .minimumScaleFactor(0.6)
      }
      .gaugeStyle(.accessoryCircular)
      .tint(mode == .fullColor ? Helix.ember : nil)

    case .steps:
      Gauge(value: HelixSnapshot.progress(
        s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init)) ?? 0, in: 0...1) {
        Image(systemName: "figure.walk")
      } currentValueLabel: {
        // Thousands, because five digits inside a 40pt ring is a smudge.
        Text(s?.steps.count.map { "\($0 / 1000)k" } ?? "—")
          .minimumScaleFactor(0.6)
      }
      .gaugeStyle(.accessoryCircular)
      .tint(mode == .fullColor ? Helix.emerald : nil)

    case .workout:
      // No goal to fill, so no gauge — a ring at an arbitrary fraction would be
      // decoration claiming to be a measurement.
      VStack(spacing: 1) {
        Image(systemName: workoutGlyph).font(.system(size: 15, weight: .semibold))
        Text(shortLabel).font(.system(size: 9, weight: .semibold)).lineLimit(1)
      }
    }
  }

  // MARK: Rectangular

  /// Two lines and a glyph. The one accessory family with room for a sentence,
  /// so it is the one that says what today actually is.
  private var rectangularFace: some View {
    HStack(spacing: 6) {
      Image(systemName: workoutGlyph)
        .font(.system(size: 14, weight: .semibold))
      VStack(alignment: .leading, spacing: 1) {
        Text(s?.workout.label ?? "—")
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
        Text(rectangularSub)
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
  }

  private var rectangularSub: String {
    if s?.workout.isRestDay == true { return "rest day" }
    if let today = s?.today {
      let volume = HelixSnapshot.tonnes(today.volumeKg) ?? "—"
      return "done · \(volume)"
    }
    if let battery = s?.battery { return "due · battery \(battery)%" }
    return "due"
  }

  // MARK: Inline

  /// One line beside the clock. Whatever the focus is, said in four words.
  private var inlineFace: some View {
    switch focus {
    case .battery:
      return Text("Battery \(s?.battery.map { "\($0)%" } ?? "—")")
    case .calories:
      return Text("\(s?.caloriesRemaining.map { "\($0)" } ?? "—") kcal left")
    case .steps:
      return Text("\(s?.steps.count.map { "\($0)" } ?? "—") steps")
    case .workout:
      return Text(s?.workout.label ?? "—")
    }
  }

  // MARK: Shared

  private var workoutGlyph: String {
    if s?.workout.isRestDay == true { return "moon.zzz.fill" }
    return s?.today != nil ? "checkmark.circle.fill" : "dumbbell.fill"
  }

  /// The day label trimmed to something that fits a 40pt ring — "Legs & Core B"
  /// becomes "Legs", because a truncated word reads as a bug and a first word
  /// reads as a category.
  private var shortLabel: String {
    guard let label = s?.workout.label, !label.isEmpty else { return "—" }
    if s?.workout.isRestDay == true { return "Rest" }
    return String(label.split(separator: " ").first ?? "—")
  }
}
