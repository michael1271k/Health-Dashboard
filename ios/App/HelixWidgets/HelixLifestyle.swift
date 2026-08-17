import WidgetKit
import SwiftUI

// MARK: - Fuel and Body
//
// Two of the four families. The layout LANGUAGE changes with the size, and the
// focus changes what leads — not merely which number is bold.
//
//   Small   C6 Focus       one idea, said once
//   Medium  C1 Ledger      a hero plus four supporting facts, no boxes
//           C7 Macros      the calorie bar with its three parts underneath
//           C2 Depth Bars  for sleep — a stacked bar is the shape of a night,
//                          and a row of numbers is not
//           C3 Trendline   for weight — a fortnight against last week's mean,
//                          so the comparison is seen rather than read
//   Large   C5 Split       today in the context of the week
//           C8 Wellbeing   the score, its five parts, and today's verdict
//
// ── WHAT WAS DELETED FROM THIS FILE, AND WHY ─────────────────────────────────
// There used to be a second enum here — `FaceFocus { calories, steps, sleep,
// weight }` — invented so Fuel and Body could share one set of faces without a
// face knowing which widget it was inside. It had FOUR cases against the pickers'
// SIX, and every dispatcher bridged the gap with a ternary:
//
//     FocusFace(focus: focus == .water ? .steps : .calories)   // Water → Steps
//     FocusFace(focus: focus == .sleep ? .sleep : .weight)     // Well-being → Weight
//
// So picking "Water" drew steps and picking "Well-being" drew the scale, and
// nothing failed to compile because the ternary always had an answer. The shared
// faces survive; the enum does not. They now take a `FocusSpec` — plain data —
// so there is no second list of cases that can fall behind the first, and every
// dispatcher below switches on `(focus, HelixSize)` with NO `default:`. A focus
// added to a picker without a face is now a build error.

// MARK: - Focus specification
//
// What a Small face draws, as data rather than as an enum case. One builder per
// metric: adding a metric means adding a function, and the exhaustive switch in
// the dispatcher is what forces you to.

struct FocusSpec {
  let caption: String
  let hero: String?
  var sub: String?
  var progress: Double?
  let accent: Color

  static func calories(_ s: HelixSnapshot?) -> FocusSpec {
    FocusSpec(
      caption: "KCAL LEFT",
      hero: s?.caloriesRemaining.map { "\($0)" },
      sub: s?.macros.proteinG.map { "\(Int($0.rounded()))g protein" },
      progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
      accent: Helix.ember)
  }

  static func water(_ s: HelixSnapshot?) -> FocusSpec {
    FocusSpec(
      caption: "WATER",
      hero: s?.water.ml.map { String(format: "%.1f", $0 / 1000) },
      // The goal is the sub-line because litres alone is not a verdict — 2.4 is
      // excellent against 2.5 and poor against 4.
      sub: s?.water.goalMl.map { String(format: "of %.1f L", $0 / 1000) } ?? "litres",
      progress: HelixSnapshot.progress(s?.water.ml, s?.water.goalMl),
      accent: Helix.sapphire)
  }

  static func steps(_ s: HelixSnapshot?) -> FocusSpec {
    FocusSpec(
      caption: "STEPS",
      hero: s?.steps.count.map { "\($0)" },
      sub: s?.steps.distanceM.map { String(format: "%.1f km", $0 / 1000) },
      progress: HelixSnapshot.progress(
        s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init)),
      accent: Helix.emerald)
  }

  static func sleep(_ s: HelixSnapshot?) -> FocusSpec {
    let duration = s.flatMap { snap -> String? in
      let text = HelixSnapshot.formatSleep(snap.sleep.minutes)
      return text == "—" ? nil : text
    }
    return FocusSpec(
      caption: "SLEEP",
      hero: duration,
      // The score, when HealthKit gave one. Not a stage breakdown: four numbers
      // in a Small is a Small pretending to be a Medium.
      sub: s?.sleep.score.map { "score \($0)" },
      // The USER's goal, not eight hours. A seven-hour target graded against a
      // hard-coded 480 draws a full night as 88% of one.
      progress: HelixSnapshot.progress(
        s?.sleep.minutes.map(Double.init),
        s?.sleep.goalMin.map(Double.init) ?? 480),
      accent: Helix.sapphire)
  }

  static func weight(_ s: HelixSnapshot?) -> FocusSpec {
    // Weight is the one metric where DOWN can be the good direction, so the
    // delta is stated and never coloured green by the sign alone.
    let delta = s?.weight.deltaKg.flatMap { HelixSnapshot.signed($0, decimals: 1) }
    return FocusSpec(
      caption: "WEIGHT",
      hero: s?.weight.kg.map { String(format: "%.1f", $0) },
      sub: delta.map { "\($0) kg since last" },
      // Progress toward the target, measured from where the fortnight started.
      // Without a start there is nothing to be a fraction OF, so: no rail.
      progress: {
        guard let now = s?.weight.kg, let target = s?.weight.targetKg,
              let from = s?.weight.trend?.first?.v, abs(from - target) > 0.05 else { return nil }
        return min(1, max(0, (from - now) / (from - target)))
      }(),
      accent: Helix.amethyst)
  }

  static func wellbeing(_ s: HelixSnapshot?) -> FocusSpec {
    FocusSpec(
      caption: "WELL-BEING",
      hero: s?.score.map { "\($0)" },
      // The weakest part, named. A 62 tells you nothing about what to change;
      // "recovery lowest" tells you where to look.
      sub: weakestPart(s).map { "\($0.0.lowercased()) lowest · \(Int($0.1.rounded()))" }
        ?? "daily score",
      progress: s?.score.map { min(1, max(0, Double($0) / 100)) },
      accent: Helix.emerald)
  }

  /// The lowest of the five sub-scores, with its name. Nil when none reported —
  /// "sleep lowest" invented from a single missing reading would be a verdict
  /// built on nothing.
  static func weakestPart(_ s: HelixSnapshot?) -> (String, Double)? {
    guard let sc = s?.scores else { return nil }
    let named: [(String, Double?)] = [
      ("Sleep", sc.sleep), ("Nutrition", sc.nutrition), ("Activity", sc.activity),
      ("Workout", sc.workout), ("Recovery", sc.recovery),
    ]
    return named.compactMap { name, value in value.map { (name, $0) } }
      .min(by: { $0.1 < $1.1 })
  }
}

// MARK: - Helix Fuel

struct FuelView: View {
  let entry: HelixEntry
  let focus: FuelFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var mono: Bool { mode == .accented }
  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    Group {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: family == .systemSmall)
      } else {
        face
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
    .widgetURL(focus.link(entry.snapshot?.date))
  }

  /// Nine combinations, nine cases, no `default:`. This is the ratchet.
  @ViewBuilder private var face: some View {
    switch (focus, HelixSize(family)) {
    case (.calories, .small):  FocusFace(spec: .calories(s), stale: entry.isStale, age: entry.age, mono: mono)
    case (.calories, .medium): CalorieLedgerFace(entry: entry, mono: mono)
    case (.calories, .large):  CalorieDayFace(entry: entry, mono: mono)

    case (.macros, .small):    MacroFocusFace(entry: entry, mono: mono)
    case (.macros, .medium):   MacroFace(entry: entry, mono: mono)
    case (.macros, .large):    MacroLargeFace(entry: entry, mono: mono)

    case (.water, .small):     FocusFace(spec: .water(s), stale: entry.isStale, age: entry.age, mono: mono)
    case (.water, .medium):    WaterLedgerFace(entry: entry, mono: mono)
    case (.water, .large):     WaterLargeFace(entry: entry, mono: mono)
    }
  }

}

/// Sleep, as a duration, or nil. Shared because five faces need the same two
/// lines of guarding and `formatSleep` returns an em dash rather than nil.
func sleepDuration(_ s: HelixSnapshot?) -> String? {
  guard let m = s?.sleep.minutes, m > 0 else { return nil }
  return HelixSnapshot.formatSleep(m)
}

/// What today's session is, in the fewest words that still identify it.
func nextSessionText(_ s: HelixSnapshot?) -> String? {
  guard let label = s?.workout.label, !label.isEmpty else { return nil }
  if s?.workout.isRestDay == true { return "Rest" }
  return s?.today != nil ? "\(label) ✓" : label
}

// MARK: - Helix Body

struct BodyView: View {
  let entry: HelixEntry
  let focus: BodyFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var mono: Bool { mode == .accented }
  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    Group {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: family == .systemSmall)
      } else {
        face
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(focus.link(entry.snapshot?.date))
  }

  @ViewBuilder private var face: some View {
    switch (focus, HelixSize(family)) {
    case (.weight, .small):     WeightFocusFace(entry: entry, mono: mono)
    case (.weight, .medium):    WeightTrendFace(entry: entry, mono: mono)
    case (.weight, .large):     WeightLargeFace(entry: entry, mono: mono)

    case (.sleep, .small):      SleepArcFace(entry: entry, mono: mono)
    case (.sleep, .medium):     SleepDepthFace(entry: entry, mono: mono)
    case (.sleep, .large):      SleepLargeFace(entry: entry, mono: mono)

    // Was `focus == .sleep ? .sleep : .weight` — which is why asking for the
    // daily score got you the bathroom scale.
    case (.wellbeing, .small):  FocusFace(spec: .wellbeing(s), stale: entry.isStale, age: entry.age, mono: mono)
    case (.wellbeing, .medium): WellbeingLedgerFace(entry: entry, mono: mono)
    case (.wellbeing, .large):  WellbeingFace(entry: entry, mono: mono)

    case (.composition, .small):  CompositionFocusFace(entry: entry, mono: mono)
    case (.composition, .medium): CompositionFace(entry: entry, mono: mono, large: false)
    case (.composition, .large):  CompositionFace(entry: entry, mono: mono, large: true)
    }
  }
}

// MARK: - C6 · Focus (Small)
//
// A Small holds exactly one idea: caption, one big number, one supporting line,
// one rail. This is the shape the original static Fuel and Battery tiles had —
// the only thing they got right, and the reason it survived them.

struct FocusFace: View {
  let spec: FocusSpec
  var stale = false
  /// The payload's age, so the tag can say it. Passed alongside `stale` rather
  /// than replacing it: this face is handed a boolean by callers that have
  /// already decided, and an age of nil is "undatable", not "fresh".
  var age: TimeInterval?
  let mono: Bool

  private var accent: Color { mono ? .white : spec.accent }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption(spec.caption, color: accent)
        Spacer(minLength: 0)
        if stale { StaleTag(age: age) }
      }
      BigValue(value: spec.hero, size: 30, color: .white)
      if let sub = spec.sub {
        Text(sub).font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(1)
      }
      Spacer(minLength: 0)
      Rail(progress: spec.progress, color: accent)
    }
  }
}

// MARK: - C1 · Ledger (Medium)
//
// Left: one hero with a rail beneath it. Right, hairline-separated: the four
// facts it is read alongside. One focal point, four supporting facts, zero boxes
// — which is the whole reason the previous Medium faces looked like wide Smalls.
//
// Two concrete faces rather than one parameterised one. The generic version took
// a hero spec and a list of rows, which made it possible — and it happened — for
// the Water face to be handed a STEPS hero and a nutrition ledger. What each
// half contains is a design decision about that focus, not a parameter.

/// Calories Medium · exactly the ask: calories with their macros directly
/// underneath on the left, and the rest of the day on the right.
struct CalorieLedgerFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    HStack(spacing: 12) {
      Link(destination: HelixLink.nutrition ?? HelixLink.home!) { heroColumn }
      Hairline(vertical: true)
      Link(destination: HelixLink.home ?? HelixLink.nutrition!) { ledgerColumn }
    }
  }

  private var heroColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("KCAL LEFT", color: tint(Helix.ember))
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
      }
      BigValue(value: s?.caloriesRemaining.map { "\($0)" }, size: 30, color: .white)
      Rail(progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
           color: tint(Helix.ember), height: 5)

      Spacer(minLength: 2)

      // The macros sit UNDER the calories they add up to, which is the mapping
      // principle: they are a decomposition of the bar above them, not four
      // unrelated meters that happen to share a column.
      MacroRail(label: "P", value: s?.macros.proteinG, goal: s?.macros.proteinGoalG,
                color: tint(Helix.emerald))
      MacroRail(label: "C", value: s?.macros.carbsG, goal: s?.macros.carbsGoalG,
                color: tint(Helix.sapphire))
      MacroRail(label: "F", value: s?.macros.fatG, goal: s?.macros.fatGoalG,
                color: tint(Helix.gold))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var ledgerColumn: some View {
    VStack(spacing: 0) {
      LedgerRow(label: "SLEEP", value: sleepDuration(s), color: tint(Helix.sapphire))
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "WATER", value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) },
                color: tint(Helix.sapphire), trailing: "L")
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "BATTERY", value: s?.battery.map { "\($0)" },
                color: mono ? .white : Helix.battery(s?.battery), trailing: "%")
      Hairline().padding(.vertical, 4)
      // The day's session, in the day's own colour. Four rows of numbers and
      // then the one thing that is not a number.
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("TODAY")
          .font(.system(size: 10, weight: .semibold)).tracking(0.6)
          .foregroundStyle(Helix.muted)
        Spacer(minLength: 4)
        Text(nextSessionText(s) ?? "—")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(mono ? .white : Helix.day(s?.workout.dayKey))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

/// Water Medium · hydration led by hydration.
///
/// The old one put a STEPS hero beside protein, water, sleep and battery — three
/// subjects, none of them the one on the label. This is water, its week, and the
/// two figures that belong to the same question of how much the day moved.
struct WaterLedgerFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    HStack(spacing: 12) {
      Link(destination: HelixLink.nutrition ?? HelixLink.home!) { heroColumn }
      Hairline(vertical: true)
      Link(destination: HelixLink.progress ?? HelixLink.home!) { weekColumn }
    }
  }

  private var heroColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("WATER", color: tint(Helix.sapphire))
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
      }
      Spacer(minLength: 0)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        BigValue(value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) }, size: 32, color: .white)
        Text("L").font(.system(size: 11)).foregroundStyle(Helix.muted)
      }
      if let goal = s?.water.goalMl {
        Text(String(format: "of %.1f L", goal / 1000))
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
      }
      Rail(progress: HelixSnapshot.progress(s?.water.ml, s?.water.goalMl),
           color: tint(Helix.sapphire), height: 5)
      if let left = litresLeft {
        Text(left).font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var weekColumn: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 4) {
        Caption("7 DAYS", color: Helix.muted)
        Spacer(minLength: 0)
        if let mean = weeklyMean {
          Text(String(format: "avg %.1f L", mean / 1000))
            .font(.system(size: 8)).foregroundStyle(Helix.muted)
        }
      }
      BarChart(points: s?.water.trend ?? [], goal: s?.water.goalMl,
               color: tint(Helix.sapphire),
               label: { HelixSnapshot.weekdayInitial($0.d) })
        .frame(maxHeight: .infinity)
      Hairline()
      HStack(spacing: 0) {
        Stat(value: s?.steps.count.map { "\($0)" }, label: "STEPS", color: .white)
        Stat(value: s?.steps.activeKcal.map { "\(Int($0.rounded()))" }, label: "MOVE KCAL",
             color: tint(Helix.emerald))
      }
    }
    .frame(maxWidth: .infinity)
  }

  private var weeklyMean: Double? {
    let points = s?.water.trend ?? []
    guard !points.isEmpty else { return nil }
    return points.reduce(0) { $0 + $1.v } / Double(points.count)
  }

  /// "0.6 L to go", or "goal met". Never a negative litre count.
  private var litresLeft: String? {
    guard let ml = s?.water.ml, let goal = s?.water.goalMl, goal > 0 else { return nil }
    let gap = goal - ml
    return gap <= 0 ? "goal met" : String(format: "%.1f L to go", gap / 1000)
  }
}

// MARK: - Sleep · the Rainbow at three sizes
//
// The stage ramp is the same at every size; what changes is the SHAPE it is
// drawn in, because the three sizes are being asked different questions.
//
//   Small   an arc      was it enough, and what was it made of
//   Medium  arc + rows  how much of each stage, in minutes and in share
//   Large   + seven     is this a normal night for you

/// The stages, as `DepthBar` and `DepthArc` both want them. A stage with no
/// reading is ABSENT, not zero — the difference between "you had no deep sleep"
/// and "the watch did not report deep sleep".
func sleepSegments(_ s: HelixSnapshot?) -> [(Helix.SleepStage, Int)] {
  guard let sleep = s?.sleep else { return [] }
  return [
    (Helix.SleepStage.deep, sleep.deepMin),
    (Helix.SleepStage.core, sleep.coreMin),
    (Helix.SleepStage.rem, sleep.remMin),
    (Helix.SleepStage.awake, sleep.awakeMin),
  ].compactMap { stage, minutes in minutes.map { (stage, $0) } }
}

/// "21:48 → 07:03". Both ends or neither — half a window is a riddle.
func sleepWindowText(_ s: HelixSnapshot?) -> String? {
  guard let from = HelixSnapshot.clockTime(s?.sleep.startTime),
        let to = HelixSnapshot.clockTime(s?.sleep.endTime) else { return nil }
  return "\(from) → \(to)"
}

/// Small · the ask, exactly. The old Small was a caption, a duration and a flat
/// rail — text where the one metric with a genuinely beautiful shape was
/// concerned. The arc is a gauge AND the rainbow: its sweep is the night against
/// the goal, its fill is the stages.
struct SleepArcFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("SLEEP", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
      }

      DepthArc(segments: sleepSegments(s), minutes: s?.sleep.minutes,
               goalMin: s?.sleep.goalMin, lineWidth: 11, monochrome: mono)
        .frame(maxWidth: .infinity, maxHeight: .infinity)

      HStack(spacing: 4) {
        if let score = s?.sleep.score {
          Text("score \(score)").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
        }
        Spacer(minLength: 0)
        if let window = sleepWindowText(s) {
          Text(window).font(.system(size: 9)).foregroundStyle(Helix.muted).lineLimit(1)
        }
      }
    }
  }
}

/// Medium · a bigger arc, and the stages as rows beside it.
///
/// The bars were fine and are kept as the row accents; what they could not say
/// is whether the night was long enough, which is what the arc adds. Minutes AND
/// share of night, because "68m deep" and "14% deep" answer different questions
/// and the second one is the one that travels between nights of different length.
struct SleepDepthFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var segments: [(Helix.SleepStage, Int)] { sleepSegments(s) }
  private var total: Int { segments.reduce(0) { $0 + $1.1 } }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("SLEEP", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if let window = sleepWindowText(s) {
          Text(window).font(.system(size: 9)).foregroundStyle(Helix.muted)
        }
        if let score = s?.sleep.score {
          Text("score \(score)").font(.system(size: 9, weight: .semibold)).foregroundStyle(.white)
        }
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
      }

      HStack(spacing: 12) {
        DepthArc(segments: segments, minutes: s?.sleep.minutes,
                 goalMin: s?.sleep.goalMin, lineWidth: 10, monochrome: mono)
          .frame(width: 108)

        VStack(spacing: 5) {
          ForEach(Helix.SleepStage.allCases, id: \.self) { stage in
            StageRow(stage: stage,
                     minutes: segments.first(where: { $0.0 == stage })?.1,
                     total: total, mono: mono)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .frame(maxHeight: .infinity)
    }
  }
}

/// One stage: its colour, its name, its minutes, and its share of the night.
private struct StageRow: View {
  let stage: Helix.SleepStage
  let minutes: Int?
  let total: Int
  let mono: Bool

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(mono ? Color.white : stage.color)
        .frame(width: 6, height: 6)
      Text(stage.label)
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(Helix.muted)
        .frame(width: 40, alignment: .leading)
      Rail(progress: share, color: mono ? .white : stage.color, height: 4)
      Text(minutes.map { "\($0)m" } ?? "—")
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(.white)
        .frame(width: 34, alignment: .trailing)
      Text(share.map { "\(Int(($0 * 100).rounded()))%" } ?? "")
        .font(.system(size: 9))
        .foregroundStyle(Helix.muted)
        .frame(width: 26, alignment: .trailing)
    }
  }

  /// Share of the STAGED total, not of the goal — this is a composition, and a
  /// composition that does not add to 100% is not one.
  private var share: Double? {
    guard let minutes, total > 0 else { return nil }
    return Double(minutes) / Double(total)
  }
}

/// Large · three registers, where it used to be the Medium and a hand's width of
/// obsidian. The seven-night register is what fills it, and it is the register
/// that makes last night mean anything: 6h14m is a bad night or an ordinary one
/// depending entirely on the six before it.
struct SleepLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }
  private var segments: [(Helix.SleepStage, Int)] { sleepSegments(s) }
  private var total: Int { segments.reduce(0) { $0 + $1.1 } }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Register(title: "LAST NIGHT", accent: tint(Helix.sapphire)) {
        HStack(spacing: 12) {
          DepthArc(segments: segments, minutes: s?.sleep.minutes,
                   goalMin: s?.sleep.goalMin, lineWidth: 11, monochrome: mono)
            .frame(width: 124, height: 74)
          VStack(alignment: .leading, spacing: 4) {
            if let score = s?.sleep.score {
              HStack(alignment: .firstTextBaseline, spacing: 5) {
                BigValue(value: "\(score)", size: 24, color: .white)
                Text("sleep score").font(.system(size: 9)).foregroundStyle(Helix.muted)
              }
            }
            if let window = sleepWindowText(s) {
              Text(window).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
            }
            if let debt = debtText {
              Text(debt).font(.system(size: 10)).foregroundStyle(Helix.muted)
            }
            Spacer(minLength: 0)
            if entry.isStale { StaleTag(age: entry.age) }
            HelixBrand(monochrome: mono)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      Hairline()

      Register(title: "STAGES", accent: tint(Helix.amethyst)) {
        DepthBar(segments: segments, height: 12, monochrome: mono)
        VStack(spacing: 5) {
          ForEach(Helix.SleepStage.allCases, id: \.self) { stage in
            StageRow(stage: stage,
                     minutes: segments.first(where: { $0.0 == stage })?.1,
                     total: total, mono: mono)
          }
        }
      }
      .frame(maxHeight: .infinity)

      Hairline()

      Register(title: "SEVEN NIGHTS", accent: tint(Helix.emerald)) {
        BarChart(points: s?.sleep.trend ?? [],
                 goal: s?.sleep.goalMin.map(Double.init) ?? 480,
                 color: tint(Helix.sapphire),
                 label: { HelixSnapshot.weekdayInitial($0.d) })
          .frame(maxHeight: .infinity)
      }
      .frame(maxHeight: .infinity)
    }
  }

  /// How far under the goal the night fell. Silent when it met it — "0m short"
  /// is a sentence about nothing.
  private var debtText: String? {
    guard let minutes = s?.sleep.minutes, minutes > 0 else { return nil }
    let goal = s?.sleep.goalMin ?? 480
    let gap = goal - minutes
    return gap > 5 ? "\(HelixSnapshot.formatSleep(gap)) short of goal" : "goal met"
  }
}

// MARK: - Weight · the scale, and what the scale is made of
//
// ── THREE MEASUREMENTS, NEVER INTERCHANGEABLE ────────────────────────────────
// `smmKg` is SKELETAL MUSCLE (~27 kg, entered by hand off the InBody — never
// derived from anything). `muscleKg` is LEAN SOFT TISSUE (~50 kg) and is labelled
// as such, because calling it "muscle" next to a 27 puts two numbers for the same
// word on one face, twenty kilos apart. `ffmKg` is FAT-FREE MASS (~53 kg).
// Whichever of the three a face shows, it shows under its own name.

/// A composition figure and its movement since the last DIFFERENT reading.
///
/// Internal rather than private since the Composition focus exists: the rows it
/// draws are these rows, and a second copy would be a second place for the
/// "down is good for fat, bad for lean tissue" rule to be got wrong.
struct CompositionRow: View {
  let label: String
  let value: Double?
  let delta: Double?
  let unit: String
  let color: Color
  let mono: Bool
  /// Down is good for body fat and bad for lean tissue — the metric decides,
  /// never the sign.
  var upIsGood = true
  var compact = false

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(label)
        .font(.system(size: compact ? 8 : 9, weight: .bold))
        .foregroundStyle(Helix.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Spacer(minLength: 4)
      BigValue(value: value.map { String(format: "%.1f", $0) }, size: compact ? 12 : 14, color: color)
      Text(unit).font(.system(size: 8)).foregroundStyle(Helix.muted)
      DeltaChip(delta: delta, decimals: 1, upIsGood: upIsGood, monochrome: mono)
    }
  }
}

/// Small · the ask: a trendline and the composition packed under it, where there
/// used to be a number, a delta and a flat progress rail.
struct WeightFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.amethyst }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Caption("WEIGHT", color: accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
      }

      HStack(alignment: .firstTextBaseline, spacing: 4) {
        BigValue(value: s?.weight.kg.map { String(format: "%.1f", $0) }, size: 27, color: .white)
        Text("kg").font(.system(size: 10)).foregroundStyle(Helix.muted)
        DeltaChip(delta: s?.weight.deltaKg, decimals: 1, upIsGood: false, monochrome: mono)
      }

      Sparkline(points: (s?.weight.trend ?? []).map(\.v),
                baseline: s?.weight.prevWeekMeanKg, color: accent)
        .frame(maxHeight: .infinity)

      Hairline()

      CompositionRow(label: "FAT", value: s?.body?.fatPct, delta: s?.body?.fatPctDelta,
                     unit: "%", color: mono ? .white : Helix.ember, mono: mono,
                     upIsGood: false, compact: true)
      CompositionRow(label: "LEAN", value: s?.body?.muscleKg, delta: s?.body?.muscleKgDelta,
                     unit: "kg", color: mono ? .white : Helix.emerald, mono: mono, compact: true)
    }
  }
}

/// Medium · the fortnight, and the composition beside it.
struct WeightTrendFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var points: [Double] { (s?.weight.trend ?? []).map(\.v) }

  var body: some View {
    HStack(spacing: 12) {
      trendColumn
      Hairline(vertical: true)
      compositionColumn
    }
  }

  private var trendColumn: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("WEIGHT", color: mono ? .white : Helix.amethyst)
        Spacer(minLength: 0)
        if let measured = HelixSnapshot.relativeDay(s?.weight.measuredOn) {
          Text(measured).font(.system(size: 9)).foregroundStyle(Helix.muted)
        }
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
      }

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        BigValue(value: s?.weight.kg.map { String(format: "%.1f", $0) }, size: 28, color: .white)
        Text("kg").font(.system(size: 11)).foregroundStyle(Helix.muted)
        // Down is the good direction here, and only here. `deltaVerdict.ts`
        // makes the same point on the web: the sign does not decide the verdict,
        // the phase does.
        DeltaChip(delta: s?.weight.deltaKg, decimals: 1, upIsGood: false, monochrome: mono)
      }

      // Never zero-based: a fortnight between 78.2 and 79.6 read against zero is
      // a flat line, and the whole point of the face is the 1.4 kg.
      Sparkline(points: points, baseline: s?.weight.prevWeekMeanKg,
                color: mono ? .white : Helix.amethyst)
        .frame(maxHeight: .infinity)

      HStack(spacing: 6) {
        if let baseline = s?.weight.prevWeekMeanKg {
          Label {
            Text(String(format: "last wk %.1f", baseline))
              .font(.system(size: 9)).foregroundStyle(Helix.muted)
          } icon: {
            Rectangle().fill(Helix.muted).frame(width: 8, height: 1)
          }
        }
        Spacer(minLength: 0)
        if let togo {
          Text(togo).font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
            .lineLimit(1)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var compositionColumn: some View {
    VStack(spacing: 0) {
      CompositionRow(label: "BODY FAT", value: s?.body?.fatPct, delta: s?.body?.fatPctDelta,
                     unit: "%", color: mono ? .white : Helix.ember, mono: mono, upIsGood: false)
      Hairline().padding(.vertical, 4)
      CompositionRow(label: "LEAN SOFT TISSUE", value: s?.body?.muscleKg, delta: s?.body?.muscleKgDelta,
                     unit: "kg", color: mono ? .white : Helix.emerald, mono: mono)
      Hairline().padding(.vertical, 4)
      CompositionRow(label: "SKELETAL MUSCLE", value: s?.body?.smmKg, delta: s?.body?.smmKgDelta,
                     unit: "kg", color: mono ? .white : Helix.sapphire, mono: mono)
      Hairline().padding(.vertical, 4)
      CompositionRow(label: "FAT-FREE MASS", value: s?.body?.ffmKg, delta: s?.body?.ffmKgDelta,
                     unit: "kg", color: .white, mono: mono)
    }
    .frame(maxWidth: .infinity)
  }

  /// "1.8 kg to target", or nothing. Never "0.0 kg to target" from a missing goal.
  private var togo: String? {
    guard let now = s?.weight.kg, let target = s?.weight.targetKg else { return nil }
    let gap = abs(now - target)
    return gap < 0.05 ? "at target" : String(format: "%.1f kg to go", gap)
  }
}

/// Large · the scale, what it is made of, and where both have been.
struct WeightLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Register(title: "THE SCALE", accent: tint(Helix.amethyst)) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          BigValue(value: s?.weight.kg.map { String(format: "%.1f", $0) }, size: 36, color: .white)
          Text("kg").font(.system(size: 12)).foregroundStyle(Helix.muted)
          DeltaChip(delta: s?.weight.deltaKg, decimals: 1, upIsGood: false, monochrome: mono)
          Spacer(minLength: 0)
          if entry.isStale { StaleTag(age: entry.age) }
          HelixBrand(monochrome: mono)
          if let measured = HelixSnapshot.relativeDay(s?.weight.measuredOn) {
            Text(measured).font(.system(size: 9)).foregroundStyle(Helix.muted)
          }
        }
        if let target = s?.weight.targetKg, let now = s?.weight.kg {
          let gap = abs(now - target)
          Text(gap < 0.05
               ? String(format: "at target %.1f kg", target)
               : String(format: "%.1f kg to target %.1f", gap, target))
            .font(.system(size: 10)).foregroundStyle(Helix.muted)
        }
      }

      Hairline()

      Register(title: "COMPOSITION", accent: tint(Helix.emerald)) {
        VStack(spacing: 0) {
          CompositionRow(label: "BODY FAT", value: s?.body?.fatPct, delta: s?.body?.fatPctDelta,
                         unit: "%", color: tint(Helix.ember), mono: mono, upIsGood: false)
          Hairline().padding(.vertical, 4)
          CompositionRow(label: "LEAN SOFT TISSUE", value: s?.body?.muscleKg,
                         delta: s?.body?.muscleKgDelta, unit: "kg",
                         color: tint(Helix.emerald), mono: mono)
          Hairline().padding(.vertical, 4)
          CompositionRow(label: "SKELETAL MUSCLE", value: s?.body?.smmKg, delta: s?.body?.smmKgDelta,
                         unit: "kg", color: tint(Helix.sapphire), mono: mono)
          Hairline().padding(.vertical, 4)
          CompositionRow(label: "FAT-FREE MASS", value: s?.body?.ffmKg, delta: s?.body?.ffmKgDelta,
                         unit: "kg", color: .white, mono: mono)
        }
      }
      .frame(maxHeight: .infinity)

      Hairline()

      // Two traces, two subjects, two scales — so they are stacked rather than
      // overlaid. A body-fat percentage and a bodyweight share no axis, and
      // drawing them on one would make the crossing point look like an event.
      Register(title: "THE FORTNIGHT", accent: tint(Helix.steel)) {
        VStack(alignment: .leading, spacing: 4) {
          TraceRow(title: "WEIGHT", unit: "kg",
                   points: (s?.weight.trend ?? []).map(\.v),
                   color: tint(Helix.amethyst))
          TraceRow(title: "BODY FAT", unit: "%",
                   points: (s?.body?.fatTrend ?? []).map(\.v),
                   color: tint(Helix.ember))
        }
      }
      .frame(maxHeight: .infinity)
    }
  }
}

/// A labelled sparkline with its own first and last readings called out.
private struct TraceRow: View {
  let title: String
  let unit: String
  let points: [Double]
  let color: Color

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(title).font(.system(size: 8, weight: .bold)).foregroundStyle(Helix.muted)
        Text(points.last.map { String(format: "%.1f \(unit)", $0) } ?? "—")
          .font(.system(size: 12, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(color)
      }
      .frame(width: 62, alignment: .leading)
      Sparkline(points: points, color: color)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .frame(maxHeight: .infinity)
  }
}

// MARK: - Calories (Large)
//
// ── WHAT THE MISSING HIERARCHY ACTUALLY WAS ──────────────────────────────────
// The data on this face was right; it was a flat wall of it. Four rails, seven
// columns and three footers, all the same weight, with nothing saying which
// question any group answered — so reading it meant recognising each number
// rather than being told what you were looking at.
//
// Three named registers fix that, and they are named for the QUESTION rather
// than the table: what is left to eat, how the rest of the day is going, and
// whether this is a normal day for you. That last one is what the seven-day
// register earns its height with — a 612 kcal deficit is unremarkable or alarming
// depending entirely on the six days behind it, and nothing on the old face said.

struct CalorieDayFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Register(title: "LEFT TO EAT", accent: tint(Helix.ember)) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          BigValue(value: s?.caloriesRemaining.map { "\($0)" }, size: 34, color: .white)
          Text("kcal").font(.system(size: 11)).foregroundStyle(Helix.muted)
          if let goal = s?.macros.kcalGoal {
            Text("of \(Int(goal.rounded()))")
              .font(.system(size: 10)).foregroundStyle(Helix.muted)
          }
          Spacer(minLength: 0)
          if entry.isStale { StaleTag(age: entry.age) }
          HelixBrand(monochrome: mono)
          BatteryRing(pct: s?.battery, size: 38, lineWidth: 5, monochrome: mono)
        }
        Rail(progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
             color: tint(Helix.ember), height: 5)
        HStack(spacing: 5) {
          MacroChip(label: "P", value: s?.macros.proteinG, goal: s?.macros.proteinGoalG,
                    color: tint(Helix.emerald))
          MacroChip(label: "C", value: s?.macros.carbsG, goal: s?.macros.carbsGoalG,
                    color: tint(Helix.sapphire))
          MacroChip(label: "F", value: s?.macros.fatG, goal: s?.macros.fatGoalG,
                    color: tint(Helix.gold))
        }
      }

      Hairline()

      Register(title: "THE REST OF THE DAY", accent: tint(Helix.emerald)) {
        VStack(spacing: 7) {
          Gauge(label: "WATER", value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) }, unit: "L",
                progress: HelixSnapshot.progress(s?.water.ml, s?.water.goalMl), color: tint(Helix.sapphire))
          Gauge(label: "STEPS", value: s?.steps.count.map { "\($0)" }, unit: "",
                progress: HelixSnapshot.progress(
                  s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init)), color: tint(Helix.emerald))
          Gauge(label: "SLEEP", value: sleepDuration(s), unit: "",
                progress: HelixSnapshot.progress(
                  s?.sleep.minutes.map(Double.init),
                  s?.sleep.goalMin.map(Double.init) ?? 480), color: tint(Helix.sapphire))
        }
      }
      .frame(maxHeight: .infinity)

      Hairline()

      Register(title: "SEVEN DAYS", accent: tint(Helix.gold)) {
        BarChart(points: s?.macros.kcalTrend ?? [], goal: s?.macros.kcalGoal,
                 color: tint(Helix.ember),
                 label: { HelixSnapshot.weekdayInitial($0.d) })
          .frame(maxHeight: .infinity)
      }
      .frame(maxHeight: .infinity)

      Hairline()

      HStack(spacing: 0) {
        Foot(label: "TODAY", value: nextSessionText(s),
             color: mono ? .white : Helix.day(s?.workout.dayKey))
        Foot(label: "WEIGHT", value: s?.weight.kg.map { String(format: "%.1f kg", $0) },
             color: tint(Helix.amethyst))
        Foot(label: "SCORE", value: s?.score.map { "\($0)" }, color: .white)
      }
    }
  }
}

/// A macro as one inline chip — letter, figure, target. For a register that has
/// already spent its vertical budget on the headline rail above it.
private struct MacroChip: View {
  let label: String
  let value: Double?
  let goal: Double?
  let color: Color

  var body: some View {
    HStack(spacing: 3) {
      Text(label)
        .font(.system(size: 8, weight: .bold, design: .rounded))
        .foregroundStyle(color)
      Text(figures)
        .font(.system(size: 9, weight: .medium, design: .monospaced))
        .foregroundStyle(Helix.muted)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var figures: String {
    let now = value.map { "\(Int($0.rounded()))" } ?? "—"
    let target = goal.map { "\(Int($0.rounded()))" } ?? "—"
    return "\(now)/\(target)g"
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
              Text(HelixSnapshot.weekdayInitial(point.d))
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
}

// MARK: - C7 · Macros
//
// ── THE FACE THIS FAMILY WAS REBUILT FOR ─────────────────────────────────────
// `carbsG`, `carbsGoalG`, `fatG` and `fatGoalG` have shipped in the payload
// since the first version and were drawn nowhere. On a cut those are two of the
// three numbers that decide the day, and the only widget that could show them
// showed protein alone.

/// Small · the three macros, and nothing else. Calories are the caption, not the
/// hero: you picked "Macros".
struct MacroFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption("MACROS", color: tint(Helix.ember))
        // A declared day changes what the number MEANS — the app has already
        // forgiven the grade, and a face showing the overshoot with no mark on
        // it reports a failure the rest of the system does not think happened.
        ContextChip(context: s?.context, monochrome: mono)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
      }
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        BigValue(value: s?.caloriesRemaining.map { "\($0)" }, size: 22, color: .white)
        Text("kcal left").font(.system(size: 9)).foregroundStyle(Helix.muted)
      }
      Spacer(minLength: 0)
      MacroRail(label: "P", value: s?.macros.proteinG, goal: s?.macros.proteinGoalG,
                color: tint(Helix.emerald))
      MacroRail(label: "C", value: s?.macros.carbsG, goal: s?.macros.carbsGoalG,
                color: tint(Helix.sapphire))
      MacroRail(label: "F", value: s?.macros.fatG, goal: s?.macros.fatGoalG,
                color: tint(Helix.gold))
    }
  }
}

/// Medium · left 60% the calorie headline over a full-width rail, then the three
/// macros as 3pt rails with their own figures — one bar per thing being filled,
/// which is the same grammar as the app's Fuel card. Right 40%, hairline-
/// separated: the four facts that are NOT macros, so the two halves never argue
/// about what they are for.
struct MacroFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    // Full width, not two columns. The two-column version spent 40% of a Medium
    // on battery, sleep, water and steps — a ledger of four things that are not
    // macros, on the face you chose BECAUSE you wanted macros. The width goes to
    // the bars instead.
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("MACROS", color: tint(Helix.ember))
        Spacer(minLength: 0)
        BigValue(value: s?.caloriesRemaining.map { "\($0)" }, size: 20, color: .white)
        Text("kcal left").font(.system(size: 9)).foregroundStyle(Helix.muted)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
      }

      Rail(progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
           color: tint(Helix.ember), height: 4)

      VStack(spacing: 6) {
        MacroLine(name: "PROTEIN", value: s?.macros.proteinG, goal: s?.macros.proteinGoalG,
                  color: tint(Helix.emerald))
        MacroLine(name: "CARBS", value: s?.macros.carbsG, goal: s?.macros.carbsGoalG,
                  color: tint(Helix.sapphire))
        MacroLine(name: "FAT", value: s?.macros.fatG, goal: s?.macros.fatGoalG,
                  color: tint(Helix.gold))
      }
      .frame(maxHeight: .infinity)
    }
  }
}

/// One macro, inline: name, figures, a short bar, and what is LEFT of it.
///
/// ── WHY THE REMAINDER IS A SEPARATE NUMBER ───────────────────────────────────
/// "128 / 165 g" requires the reader to do the subtraction, and the subtraction
/// is the only part they were going to act on — nobody eats a ratio. So the
/// remainder is stated, signed, and coloured by whether it is a shortfall or an
/// overshoot. Protein over target is a good day and fat over target is not, but
/// that judgement belongs to the app's own grading, so the chip stays neutral in
/// wording ("+12 g over") and lets the colour carry only the DIRECTION.
private struct MacroLine: View {
  let name: String
  let value: Double?
  let goal: Double?
  let color: Color

  var body: some View {
    HStack(spacing: 8) {
      Text(name)
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(color)
        .frame(width: 52, alignment: .leading)

      Rail(progress: HelixSnapshot.progress(value, goal), color: color, height: 5)

      Text(figures)
        .font(.system(size: 9, weight: .medium, design: .monospaced))
        .foregroundStyle(Helix.muted)
        .frame(width: 62, alignment: .trailing)
        .lineLimit(1)

      Text(remainder)
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(remainderColor)
        .frame(width: 46, alignment: .trailing)
        .lineLimit(1)
    }
  }

  private var figures: String {
    let now = value.map { "\(Int($0.rounded()))" } ?? "—"
    let target = goal.map { "\(Int($0.rounded()))" } ?? "—"
    return "\(now)/\(target)g"
  }

  /// Nothing to be left OF without a goal — an em dash, never a bare intake
  /// figure dressed up as a remainder.
  private var remainder: String {
    guard let value, let goal else { return "—" }
    let gap = goal - value
    if abs(gap) < 0.5 { return "met" }
    return gap > 0 ? "\(Int(gap.rounded()))g" : "+\(Int((-gap).rounded()))g"
  }

  private var remainderColor: Color {
    guard let value, let goal else { return Helix.muted }
    return abs(goal - value) < 0.5 ? Helix.emerald : .white
  }
}

/// Large · three registers, not the Medium stretched.
///
/// The old Macros Large was `CalorieDayFace` — byte for byte the Calories Large,
/// because the Large branch never read the focus at all. This one answers the
/// macro question at three resolutions: how much is left, what the day was MADE
/// of, and what else is going on.
struct MacroLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Register(title: "TODAY'S FUEL", accent: tint(Helix.ember)) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          BigValue(value: s?.caloriesRemaining.map { "\($0)" }, size: 32, color: .white)
          Text("kcal left").font(.system(size: 10)).foregroundStyle(Helix.muted)
          Spacer(minLength: 0)
          if entry.isStale { StaleTag(age: entry.age) }
          HelixBrand(monochrome: mono)
          BatteryRing(pct: s?.battery, size: 38, lineWidth: 5, monochrome: mono)
        }
        Rail(progress: HelixSnapshot.progress(s?.macros.kcal, s?.macros.kcalGoal),
             color: tint(Helix.ember))
      }

      Hairline()

      Register(title: "MACRONUTRIENTS", accent: tint(Helix.emerald)) {
        VStack(spacing: 6) {
          MacroRail(label: "P", value: s?.macros.proteinG, goal: s?.macros.proteinGoalG,
                    color: tint(Helix.emerald))
          MacroRail(label: "C", value: s?.macros.carbsG, goal: s?.macros.carbsGoalG,
                    color: tint(Helix.sapphire))
          MacroRail(label: "F", value: s?.macros.fatG, goal: s?.macros.fatGoalG,
                    color: tint(Helix.gold))
        }
      }

      Hairline()

      // ── WHY AN ENERGY SPLIT AND NOT A SECOND SET OF BARS ────────────────────
      // The rails above answer "how close to each target". This answers a
      // different question — what the day was actually BUILT from — using the
      // Atwater factors the app already assumes: 4 kcal a gram for protein and
      // carbohydrate, 9 for fat. Same numbers, genuinely different reading, which
      // is what a third register has to earn its height with.
      Register(title: "WHERE THE ENERGY CAME FROM", accent: tint(Helix.gold)) {
        EnergySplit(entry: entry, mono: mono)
      }

      Spacer(minLength: 0)

      Hairline()

      HStack(spacing: 0) {
        Foot(label: "WATER", value: s?.water.ml.map { String(format: "%.1f L", $0 / 1000) },
             color: tint(Helix.sapphire))
        Foot(label: "STEPS", value: s?.steps.count.map { "\($0)" }, color: tint(Helix.emerald))
        Foot(label: "SLEEP", value: sleepText, color: .white)
      }
    }
  }

  private var sleepText: String? {
    guard let m = s?.sleep.minutes, m > 0 else { return nil }
    return HelixSnapshot.formatSleep(m)
  }
}

/// The day's calories, split by which macro supplied them.
///
/// Absent when any of the three is missing: a "split" computed from two of three
/// macros would show carbohydrate at 100% of a day that also had fat in it, and
/// a share that adds to less than the whole is the most confidently wrong shape
/// a chart can take.
private struct EnergySplit: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  private var parts: [(String, Double, Color)]? {
    guard let p = s?.macros.proteinG, let c = s?.macros.carbsG, let f = s?.macros.fatG else { return nil }
    let kcal = [p * 4, c * 4, f * 9]
    guard kcal.reduce(0, +) > 0 else { return nil }
    return [
      ("PROTEIN", kcal[0], mono ? .white : Helix.emerald),
      ("CARBS", kcal[1], mono ? .white : Helix.sapphire),
      ("FAT", kcal[2], mono ? .white : Helix.gold),
    ]
  }

  var body: some View {
    if let parts {
      let total = parts.reduce(0) { $0 + $1.1 }
      VStack(alignment: .leading, spacing: 5) {
        GeometryReader { geo in
          HStack(spacing: 1) {
            ForEach(parts, id: \.0) { _, kcal, color in
              Rectangle().fill(color)
                .frame(width: max(1, geo.size.width * CGFloat(kcal / total)))
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
        .frame(height: 10)

        HStack(spacing: 0) {
          ForEach(parts, id: \.0) { name, kcal, color in
            HStack(spacing: 3) {
              Circle().fill(color).frame(width: 5, height: 5)
              Text("\(name) \(Int((kcal / total * 100).rounded()))%")
                .font(.system(size: 8, weight: .bold)).foregroundStyle(Helix.muted)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    } else {
      Text("logged protein, carbs and fat all three\nand the split appears here")
        .font(.system(size: 9)).foregroundStyle(Helix.muted)
    }
  }
}

/// One macro: an initial, a 3pt rail, and `128 / 165 g` in a tabular face.
///
/// The figures are the point — a rail alone says "most of the way" for anything
/// between 70 and 95 percent, and the difference between those two is a meal.
private struct MacroRail: View {
  let label: String
  let value: Double?
  let goal: Double?
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 4) {
        Text(label)
          .font(.system(size: 8, weight: .bold, design: .rounded))
          .foregroundStyle(color)
        Spacer(minLength: 0)
        Text(figures)
          .font(.system(size: 9, weight: .medium, design: .monospaced))
          .foregroundStyle(Helix.muted)
          .lineLimit(1)
      }
      Rail(progress: HelixSnapshot.progress(value, goal), color: color, height: 3)
    }
  }

  /// "128 / 165 g", or an em dash for the half that is missing. A goal with no
  /// intake is still worth printing: it says what the day is asking for.
  private var figures: String {
    let now = value.map { "\(Int($0.rounded()))" } ?? "—"
    let target = goal.map { "\(Int($0.rounded()))" } ?? "—"
    return "\(now) / \(target) g"
  }
}

// MARK: - Water (Large)
//
// Was `CalorieDayFace` — the Calories Large again, under a "Water" label. Hydration
// leads here, and the registers under it are the rest of the MOVEMENT day, not
// the nutrition one: picking Water and being shown protein was the complaint.

struct WaterLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Register(title: "HYDRATION", accent: tint(Helix.sapphire)) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          BigValue(value: s?.water.ml.map { String(format: "%.1f", $0 / 1000) }, size: 34, color: .white)
          Text("L").font(.system(size: 12)).foregroundStyle(Helix.muted)
          if let goal = s?.water.goalMl {
            Text(String(format: "of %.1f L", goal / 1000))
              .font(.system(size: 10)).foregroundStyle(Helix.muted)
          }
          Spacer(minLength: 0)
          if entry.isStale { StaleTag(age: entry.age) }
          HelixBrand(monochrome: mono)
          BatteryRing(pct: s?.battery, size: 38, lineWidth: 5, monochrome: mono)
        }
        Rail(progress: HelixSnapshot.progress(s?.water.ml, s?.water.goalMl),
             color: tint(Helix.sapphire), height: 6)
        if let left = litresLeft {
          Text(left).font(.system(size: 10)).foregroundStyle(Helix.muted)
        }
      }

      Hairline()

      Register(title: "THE DAY", accent: tint(Helix.emerald)) {
        VStack(spacing: 8) {
          Gauge(label: "STEPS", value: s?.steps.count.map { "\($0)" }, unit: "",
                progress: HelixSnapshot.progress(
                  s?.steps.count.map(Double.init), s?.steps.goal.map(Double.init)),
                color: tint(Helix.emerald))
          Gauge(label: "MOVE", value: s?.steps.activeKcal.map { "\(Int($0.rounded()))" }, unit: "kcal",
                progress: nil, color: .white)
          Gauge(label: "SLEEP", value: sleepText, unit: "",
                progress: HelixSnapshot.progress(
                  s?.sleep.minutes.map(Double.init),
                  s?.sleep.goalMin.map(Double.init) ?? 480),
                color: tint(Helix.sapphire))
        }
      }

      Hairline()

      WeekColumns(entry: entry, mono: mono)
        .frame(maxHeight: .infinity)
    }
  }

  /// "0.6 L to go", or "goal met". Never a negative litre count.
  private var litresLeft: String? {
    guard let ml = s?.water.ml, let goal = s?.water.goalMl, goal > 0 else { return nil }
    let gap = goal - ml
    return gap <= 0 ? "goal met" : String(format: "%.1f L to go", gap / 1000)
  }

  private var sleepText: String? {
    guard let m = s?.sleep.minutes, m > 0 else { return nil }
    return HelixSnapshot.formatSleep(m)
  }
}

// MARK: - C8 · Wellbeing
//
// The composite score is one number standing on five, and the five are what you
// can actually act on — a 62 tells you nothing about whether to sleep earlier or
// eat more. The readiness verdict underneath is `computeReadiness`'s own words,
// carried through the payload rather than re-derived here: two implementations
// of one grade is how they come to disagree.

/// The five sub-scores, in the order the app lists them.
private func wellbeingParts(_ s: HelixSnapshot?, mono: Bool) -> [(String, Double?, Color)] {
  func tint(_ c: Color) -> Color { mono ? .white : c }
  let sc = s?.scores
  return [
    ("SLEEP", sc?.sleep, tint(Helix.sapphire)),
    ("NUTRITION", sc?.nutrition, tint(Helix.ember)),
    ("ACTIVITY", sc?.activity, tint(Helix.emerald)),
    ("WORKOUT", sc?.workout, tint(Helix.amethyst)),
    ("RECOVERY", sc?.recovery, tint(Helix.steel)),
  ]
}

/// Medium · its own layout, not the Large shrunk.
///
/// ── WHY THE BARS RAN OFF THE EDGE ────────────────────────────────────────────
/// The Large's rows are a 62pt label frame, then a rail, then a 22pt value —
/// about 100pt of fixed width before the bar gets any. In a Large that leaves
/// plenty; in a Medium it leaves the rail almost nothing and pushed the battery
/// ring past the trailing edge. So the Medium puts the score and the ring in a
/// fixed left column and gives the rails the whole of what remains, with the
/// labels shortened to fit rather than the bars shortened to make room.
struct WellbeingLedgerFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Caption("SCORE", color: mono ? .white : Helix.emerald)
          if entry.isStale { StaleTag(age: entry.age) }
          HelixBrand(monochrome: mono)
        }
        Spacer(minLength: 0)
        BigValue(value: s?.score.map { "\($0)" }, size: 34, color: .white)
        BatteryRing(pct: s?.battery, size: 42, lineWidth: 5, monochrome: mono)
        Spacer(minLength: 0)
      }
      .frame(width: 88, alignment: .leading)

      Hairline(vertical: true)

      VStack(spacing: 6) {
        ForEach(wellbeingParts(s, mono: mono), id: \.0) { name, value, color in
          HStack(spacing: 6) {
            Text(name.prefix(4))
              .font(.system(size: 8, weight: .bold))
              .foregroundStyle(Helix.muted)
              .frame(width: 30, alignment: .leading)
            Rail(progress: value.map { min(1, max(0, $0 / 100)) }, color: color, height: 4)
            Text(value.map { "\(Int($0.rounded()))" } ?? "—")
              .font(.system(size: 9, weight: .semibold, design: .monospaced))
              .foregroundStyle(.white)
              .frame(width: 20, alignment: .trailing)
          }
        }
        if let readiness = s?.readiness {
          Text(readiness.label)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(mono ? .white : Color(hexString: readiness.color) ?? .white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity)
    }
  }
}

struct WellbeingFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Caption("WELL-BEING", color: tint(Helix.emerald))
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono)
        BatteryRing(pct: s?.battery, size: 40, lineWidth: 5, monochrome: mono)
      }

      HStack(alignment: .bottom, spacing: 8) {
        BigValue(value: s?.score.map { "\($0)" }, size: 40, color: .white)
        Text("daily score").font(.system(size: 10)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
      }

      Hairline()

      // The rails take the slack instead of a trailing Spacer collecting it all
      // at the bottom, which is what left this face with an inch of air under a
      // three-line verdict.
      VStack(spacing: 7) {
        ForEach(wellbeingParts(s, mono: mono), id: \.0) { name, value, color in
          HStack(spacing: 8) {
            Text(name)
              .font(.system(size: 8, weight: .bold))
              .foregroundStyle(Helix.muted)
              .frame(width: 62, alignment: .leading)
            Rail(progress: value.map { min(1, max(0, $0 / 100)) }, color: color, height: 4)
            Text(value.map { "\(Int($0.rounded()))" } ?? "—")
              .font(.system(size: 10, weight: .semibold, design: .monospaced))
              .foregroundStyle(.white)
              .frame(width: 22, alignment: .trailing)
          }
          .frame(maxHeight: .infinity)
        }
      }
      .frame(maxHeight: .infinity)

      Hairline()

      if let readiness = s?.readiness {
        VStack(alignment: .leading, spacing: 2) {
          Text(readiness.label)
            .font(.system(size: 11, weight: .bold))
            // The verdict's own colour, parsed from the payload — the same hex
            // the app paints it with, so the two surfaces cannot disagree about
            // what "compromised" looks like.
            .foregroundStyle(mono ? .white : Color(hexString: readiness.color) ?? .white)
          Text(readiness.reason)
            .font(.system(size: 9))
            .foregroundStyle(Helix.muted)
            .lineLimit(2)
        }
      } else {
        // The verdict needs a battery to weigh against, so its absence is a real
        // state rather than an error — and saying so is better than a gap where
        // a sentence was yesterday.
        Text("today's verdict appears once the battery has a reading")
          .font(.system(size: 9)).foregroundStyle(Helix.muted)
      }
    }
  }
}
