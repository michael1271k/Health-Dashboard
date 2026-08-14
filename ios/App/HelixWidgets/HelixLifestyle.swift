import WidgetKit
import SwiftUI

// MARK: - Helix Lifestyle
//
// One widget, three sizes, four focuses. The layout LANGUAGE changes with the
// size, and the focus changes what leads — not merely which number is bold.
//
//   Small   C6 Focus       one idea, said once
//   Medium  C1 Ledger      a hero plus four supporting facts, no boxes
//           C2 Depth Bars  when the focus is sleep — a stacked bar is the shape
//                          of a night, and a row of numbers is not
//           C3 Trendline   when the focus is weight — a fortnight against last
//                          week's mean, so the comparison is seen, not read
//   Large   C5 Split       today in the context of the week

struct LifestyleView: View {
  let entry: HelixEntry
  let focus: LifestyleFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var mono: Bool { mode == .accented }

  var body: some View {
    Group {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: family == .systemSmall)
      } else {
        switch family {
        case .systemSmall:  FocusFace(entry: entry, focus: focus, mono: mono)
        case .systemLarge:  SplitFace(entry: entry, focus: focus, mono: mono)
        default:
          switch focus {
          case .sleep:  DepthFace(entry: entry, mono: mono)
          case .weight: TrendFace(entry: entry, mono: mono)
          default:      LedgerFace(entry: entry, focus: focus, mono: mono)
          }
        }
      }
    }
    .containerBackground(Helix.background, for: .widget)
    // ── EXACTLY ONE widgetURL, AT THE ROOT ────────────────────────────────────
    // `widgetURL` is a per-widget property, not a per-view one: declaring it on
    // an inner stack as well makes the effective target ambiguous, and on a
    // Small — where `Link` is inert and the whole face is one tap target — the
    // inner one silently wins nothing at all. Sub-regions of the Medium and
    // Large faces use `Link`, which IS per-view, and everything they do not
    // cover falls through to this.
    .widgetURL(focus.link)
  }
}

// MARK: - C6 · Focus (Small)
//
// A Small holds exactly one idea. `FuelView` and `BatteryView` already do this
// correctly, so this extends the pattern rather than redesigning it: caption,
// one big number, one supporting line, one rail.

private struct FocusFace: View {
  let entry: HelixEntry
  let focus: LifestyleFocus
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption(caption, color: mono ? .white : accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }
      BigValue(value: hero, size: 30, color: .white)
      if let sub { Text(sub).font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(1) }
      Spacer(minLength: 0)
      Rail(progress: progress, color: mono ? .white : accent)
    }
  }

  private var accent: Color {
    switch focus {
    case .calories: return Helix.ember
    case .steps:    return Helix.emerald
    case .sleep:    return Helix.sapphire
    case .weight:   return Helix.amethyst
    }
  }

  private var caption: String {
    switch focus {
    case .calories: return "KCAL LEFT"
    case .steps:    return "STEPS"
    case .sleep:    return "SLEEP"
    case .weight:   return "WEIGHT"
    }
  }

  private var hero: String? {
    switch focus {
    case .calories: return s?.caloriesRemaining.map { "\($0)" }
    case .steps:    return s?.steps.count.map { "\($0)" }
    case .sleep:    return s.map { HelixSnapshot.formatSleep($0.sleep.minutes) == "—" ? nil : HelixSnapshot.formatSleep($0.sleep.minutes) } ?? nil
    case .weight:   return s?.weight.kg.map { String(format: "%.1f", $0) }
    }
  }

  private var sub: String? {
    switch focus {
    case .calories:
      return s?.macros.proteinG.map { "\(Int($0.rounded()))g protein" }
    case .steps:
      return s?.steps.distanceM.map { String(format: "%.1f km", $0 / 1000) }
    case .sleep:
      // The score, when HealthKit gave one. Not a stage breakdown: four numbers
      // in a Small is a Small pretending to be a Medium.
      return s?.sleep.score.map { "score \($0)" }
    case .weight:
      // Weight is the one metric where DOWN can be the good direction, so the
      // delta is stated and never coloured green by the sign alone.
      guard let d = s?.weight.deltaKg, let text = HelixSnapshot.signed(d, decimals: 1) else { return nil }
      return "\(text) kg since last"
    }
  }

  private var progress: Double? {
    switch focus {
    case .calories: return HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal)
    case .steps:    return HelixSnapshot.progress(s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init))
    case .sleep:    return HelixSnapshot.progress(s?.sleep.minutes.map(Double.init), 480)
    case .weight:
      // Progress toward the target, measured from where the fortnight started.
      // Without a start there is nothing to be a fraction OF, so: no rail.
      guard let now = s?.weight.kg, let target = s?.weight.targetKg,
            let from = s?.weight.trend?.first?.v, abs(from - target) > 0.05 else { return nil }
      return min(1, max(0, (from - now) / (from - target)))
    }
  }
}

// MARK: - C1 · Ledger (Medium)
//
// Left third: one hero with a rail beneath it. Right two-thirds: four facts as
// hairline-separated rows. One focal point, four supporting facts, zero boxes —
// which is the whole reason the previous Medium faces looked like wide Smalls.

private struct LedgerFace: View {
  let entry: HelixEntry
  let focus: LifestyleFocus
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    HStack(spacing: 12) {
      // Two regions, two destinations. The hero column opens the page its number
      // came from; the ledger column opens Nutrition, because three of its four
      // rows live there. `Link` is the per-view mechanism — the root's
      // `widgetURL` still catches the gaps between them.
      Link(destination: focus.link ?? HelixLink.home!) {
        heroColumn
      }

      Hairline(vertical: true)

      Link(destination: HelixLink.nutrition ?? HelixLink.home!) {
        ledgerColumn
      }
    }
  }

  private var heroColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption(focus == .steps ? "MOVE" : "FUEL", color: tint(Helix.ember))
        if entry.isStale { StaleTag() }
      }
      Spacer(minLength: 0)
      BigValue(
        value: focus == .steps
          ? s?.steps.count.map { "\($0)" }
          : s?.caloriesRemaining.map { "\($0)" },
        size: 32, color: .white
      )
      Text(focus == .steps ? "steps" : "kcal left")
        .font(.system(size: 10)).foregroundStyle(Helix.muted)
      Rail(
        progress: focus == .steps
          ? HelixSnapshot.progress(s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init))
          : HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
        color: tint(Helix.ember)
      )
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var ledgerColumn: some View {
    VStack(spacing: 0) {
      LedgerRow(label: "PROTEIN", value: s?.macros.proteinG.map { "\(Int($0.rounded()))" },
                color: tint(Helix.emerald), trailing: "g")
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "WATER", value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) },
                color: tint(Helix.sapphire), trailing: "L")
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "SLEEP", value: sleepText, color: .white)
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "BATTERY", value: s?.battery.map { "\($0)" },
                color: mono ? .white : Helix.battery(s?.battery), trailing: "%")
    }
    .frame(maxWidth: .infinity)
  }

  private var sleepText: String? {
    guard let m = s?.sleep.minutes, m > 0 else { return nil }
    return HelixSnapshot.formatSleep(m)
  }
}

// MARK: - C2 · Depth Bars (Medium) · the Sleep Rainbow

private struct DepthFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  /// A stage with no reading is ABSENT, not zero — the difference between "you
  /// had no deep sleep" and "the watch did not report deep sleep".
  private var segments: [(Helix.SleepStage, Int)] {
    guard let sleep = s?.sleep else { return [] }
    return [
      (Helix.SleepStage.deep, sleep.deepMin),
      (Helix.SleepStage.core, sleep.coreMin),
      (Helix.SleepStage.rem, sleep.remMin),
      (Helix.SleepStage.awake, sleep.awakeMin),
    ].compactMap { stage, minutes in minutes.map { (stage, $0) } }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("SLEEP", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if let window { Text(window).font(.system(size: 9)).foregroundStyle(Helix.muted) }
        if entry.isStale { StaleTag() }
      }

      HStack(alignment: .firstTextBaseline, spacing: 8) {
        BigValue(value: durationText, size: 30, color: .white)
        if let score = s?.sleep.score {
          Text("score \(score)").font(.system(size: 11)).foregroundStyle(Helix.muted)
        }
      }

      DepthBar(segments: segments, height: 12, monochrome: mono)

      HStack(spacing: 0) {
        ForEach(Helix.SleepStage.allCases, id: \.self) { stage in
          let minutes = segments.first(where: { $0.0 == stage })?.1
          VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 3) {
              Circle().fill(mono ? Color.white : stage.color).frame(width: 5, height: 5)
              Text(stage.label).font(.system(size: 8, weight: .bold)).foregroundStyle(Helix.muted)
            }
            BigValue(value: minutes.map { "\($0)m" }, size: 12, color: .white)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      Spacer(minLength: 0)
    }
  }

  private var durationText: String? {
    guard let m = s?.sleep.minutes, m > 0 else { return nil }
    return HelixSnapshot.formatSleep(m)
  }

  /// "21:48 → 07:03". Both ends or neither — half a window is a riddle.
  private var window: String? {
    guard let from = HelixSnapshot.clockTime(s?.sleep.startTime),
          let to = HelixSnapshot.clockTime(s?.sleep.endTime) else { return nil }
    return "\(from) → \(to)"
  }
}

// MARK: - C3 · Trendline (Medium) · Weight

private struct TrendFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var points: [Double] { (s?.weight.trend ?? []).map(\.v) }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Caption("WEIGHT", color: mono ? .white : Helix.amethyst)
        Spacer(minLength: 0)
        if let measured = HelixSnapshot.relativeDay(s?.weight.measuredOn) {
          Text(measured).font(.system(size: 9)).foregroundStyle(Helix.muted)
        }
        if entry.isStale { StaleTag() }
      }

      HStack(alignment: .firstTextBaseline, spacing: 8) {
        BigValue(value: s?.weight.kg.map { String(format: "%.1f", $0) }, size: 30, color: .white)
        Text("kg").font(.system(size: 11)).foregroundStyle(Helix.muted)
        // Down is the good direction here, and only here. `deltaVerdict.ts`
        // makes the same point on the web: the sign does not decide the verdict,
        // the phase does.
        DeltaChip(delta: s?.weight.deltaKg, decimals: 1, upIsGood: false, monochrome: mono)
      }

      Sparkline(points: points, baseline: s?.weight.prevWeekMeanKg,
                color: mono ? .white : Helix.amethyst)
        .frame(height: 34)

      HStack(spacing: 10) {
        if let baseline = s?.weight.prevWeekMeanKg {
          Label {
            Text(String(format: "last week %.1f", baseline))
              .font(.system(size: 9)).foregroundStyle(Helix.muted)
          } icon: {
            Rectangle().fill(Helix.muted).frame(width: 8, height: 1)
          }
        }
        Spacer(minLength: 0)
        if let togo {
          Text(togo).font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
        }
      }
    }
  }

  /// "1.8 kg to target", or nothing. Never "0.0 kg to target" from a missing goal.
  private var togo: String? {
    guard let now = s?.weight.kg, let target = s?.weight.targetKg else { return nil }
    let gap = abs(now - target)
    return gap < 0.05 ? "at target" : String(format: "%.1f kg to target", gap)
  }
}

// MARK: - C5 · Split Column (Large)
//
// Left: today as four rails. Right: the week as seven stacked columns, today's
// brightened. Today read in the context of the week — the most informative Large
// layout the data we already hold can support.

private struct SplitFace: View {
  let entry: HelixEntry
  let focus: LifestyleFocus
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("TODAY", color: tint(Helix.ember))
        Text(s?.workout.label ?? "—")
          .font(.system(size: 10, weight: .semibold)).foregroundStyle(Helix.muted).lineLimit(1)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
        BatteryRing(pct: s?.battery, size: 40, lineWidth: 5, monochrome: mono)
      }

      Hairline()

      HStack(alignment: .top, spacing: 14) {
        VStack(spacing: 9) {
          Gauge(label: "FUEL", value: s?.caloriesRemaining.map { "\($0)" }, unit: "left",
                progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal), color: tint(Helix.ember))
          Gauge(label: "PROTEIN", value: s?.macros.proteinG.map { "\(Int($0.rounded()))" }, unit: "g",
                progress: HelixSnapshot.progress(s?.macros.proteinG, s?.macros.proteinGoalG), color: tint(Helix.emerald))
          Gauge(label: "STEPS", value: s?.steps.count.map { "\($0)" }, unit: "",
                progress: HelixSnapshot.progress(s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init)), color: .white)
          Gauge(label: "WATER", value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) }, unit: "L",
                progress: HelixSnapshot.progress(s?.water.ml, s?.water.goalMl), color: tint(Helix.sapphire))
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Hairline(vertical: true)

        WeekColumns(entry: entry, mono: mono)
          .frame(maxWidth: .infinity)
      }

      Hairline()

      HStack(spacing: 0) {
        Foot(label: "SLEEP", value: sleepText, color: tint(Helix.sapphire))
        Foot(label: "WEIGHT", value: s?.weight.kg.map { String(format: "%.1f kg", $0) }, color: tint(Helix.amethyst))
        Foot(label: "SCORE", value: s?.score.map { "\($0)" }, color: .white)
      }
    }
  }

  private var sleepText: String? {
    guard let m = s?.sleep.minutes, m > 0 else { return nil }
    return HelixSnapshot.formatSleep(m)
  }
}

private struct Gauge: View {
  let label: String
  let value: String?
  let unit: String
  let progress: Double?
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(label).font(.system(size: 9, weight: .heavy)).tracking(0.8).foregroundStyle(Helix.muted)
        Spacer(minLength: 4)
        BigValue(value: value, size: 15, color: color)
        if !unit.isEmpty {
          Text(unit).font(.system(size: 9)).foregroundStyle(Helix.muted)
        }
      }
      Rail(progress: progress, color: color, height: 3)
    }
  }
}

private struct Foot: View {
  let label: String
  let value: String?
  let color: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.8).foregroundStyle(Helix.muted)
      BigValue(value: value, size: 14, color: color)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Seven days of steps as columns, today brightened.
///
/// Steps rather than a four-metric stack: it is the only lifestyle series the
/// payload carries a full week of. A column built from one real number and three
/// repeats of today's would LOOK like a week of four metrics and be a week of
/// one — which is the exact class of thing the em-dash rule exists to prevent.
private struct WeekColumns: View {
  let entry: HelixEntry
  let mono: Bool

  private var trend: [HelixSnapshot.Point] { entry.snapshot?.steps.trend ?? [] }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("7 DAYS", color: Helix.muted)
        Spacer(minLength: 0)
        if let goal = entry.snapshot?.steps.goal {
          Text("goal \(goal / 1000)k").font(.system(size: 8)).foregroundStyle(Helix.muted)
        }
      }
      if trend.count >= 2 {
        let peak = max(trend.map(\.v).max() ?? 1, Double(entry.snapshot?.steps.goal ?? 0))
        HStack(alignment: .bottom, spacing: 4) {
          ForEach(trend) { point in
            VStack(spacing: 3) {
              DayColumn(
                segments: [(peak > 0 ? point.v / peak : 0, mono ? .white : Helix.emerald)],
                highlighted: point.d == entry.snapshot?.date
              )
              Text(weekdayInitial(point.d))
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(Helix.muted)
            }
          }
        }
      } else {
        Text("a week of steps appears here\nonce there are two days of them")
          .font(.system(size: 9)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
  }

  private func weekdayInitial(_ iso: String) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    guard let date = f.date(from: iso) else { return "" }
    let index = Calendar.current.component(.weekday, from: date) - 1
    return ["S", "M", "T", "W", "T", "F", "S"][max(0, min(6, index))]
  }
}

// MARK: - Widget declaration

struct HelixLifestyleWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "HelixLifestyle",
      intent: LifestyleConfiguration.self,
      provider: HelixIntentProvider<LifestyleConfiguration>()
    ) { entry in
      LifestyleView(entry: entry, focus: entry.lifestyleFocus)
    }
    .configurationDisplayName("Lifestyle")
    .description("Fuel, movement, sleep and weight. Tap through to the page it came from.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
