import WidgetKit
import SwiftUI

// MARK: - Vitals
//
// ── WHAT THIS FAMILY IS FOR ──────────────────────────────────────────────────
// Seven overnight readings — HRV, resting heart rate, wrist temperature, blood
// oxygen, respiratory rate, steps and sleep — none of which mean anything as a
// bare number. 42 ms of HRV is neither good nor bad; 42 against your own 51 is
// a sentence. So every face here draws the reading AGAINST ITS BASELINE and
// never on an absolute scale.
//
// ── AND WHY THE BASELINE IS NOT COMPUTED HERE ────────────────────────────────
// `WidgetVitals` ships `baseline` per reading, a fortnight wide and excluding
// today, computed server-side. The alternative — averaging the seven-point
// trend in this file — would be a SECOND definition of "normal", and it would
// disagree with the app's the first time the two windows differed by a day.
// That is the exact split the streak taught this project once already.
//
// ── ACTIVITY BARS, NOT RINGS ─────────────────────────────────────────────────
// The design brief said "Activity Rings / Bars". Rings encode progress toward a
// goal — a closed ring means done. Five of these seven readings HAVE no goal:
// there is no target HRV to close, and a full ring of respiratory rate would be
// meaningless. What they have is a normal and a deviation from it, which is a
// centred bar: the tick in the middle is you, and the fill runs left or right.
// Steps is the exception and keeps a real goal rail, because it genuinely has
// one. Using the same shape for both would have made a goal out of a baseline.

struct VitalsView: View {
  let entry: HelixEntry
  let focus: VitalsFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var mono: Bool { mode == .accented }

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
    case (.panel, .small):         VitalLeadFace(entry: entry, mono: mono, spec: .hrv)
    case (.panel, .medium):        VitalsPanelFace(entry: entry, mono: mono, large: false)
    case (.panel, .large):         VitalsPanelFace(entry: entry, mono: mono, large: true)

    case (.recovery, .small):      VitalLeadFace(entry: entry, mono: mono, spec: .hrv)
    case (.recovery, .medium):     VitalPairFace(entry: entry, mono: mono, specs: [.hrv, .restingBpm])
    case (.recovery, .large):      VitalsPanelFace(entry: entry, mono: mono, large: true)

    case (.respiration, .small):   VitalLeadFace(entry: entry, mono: mono, spec: .bloodOxygen)
    case (.respiration, .medium):  VitalPairFace(entry: entry, mono: mono, specs: [.bloodOxygen, .respiratoryRate])
    case (.respiration, .large):   VitalsPanelFace(entry: entry, mono: mono, large: true)

    case (.temperature, .small):   VitalLeadFace(entry: entry, mono: mono, spec: .wristTemp)
    case (.temperature, .medium):  VitalPairFace(entry: entry, mono: mono, specs: [.wristTemp, .restingBpm])
    case (.temperature, .large):   VitalsPanelFace(entry: entry, mono: mono, large: true)
    }
  }
}

// MARK: - One reading, described

/// Everything that differs between the five readings, in one value.
///
/// The alternative was a switch per face over `VitalsFocus`, repeated for the
/// label, the unit, the colour, the decimals and the direction — five parallel
/// switches that must agree, which is five chances for the SpO₂ face to render
/// a heart-rate colour. This is the shape `DeltaChip.upIsGood` already implies:
/// the verdict belongs to the metric.
struct VitalSpec {
  let label: String
  let unit: String
  let color: Color
  let decimals: Int
  /// False where DOWN is the good direction — a resting heart rate below your
  /// own normal is a good night, and a respiratory rate above it is not.
  let upIsGood: Bool
  /// The deviation, in the reading's own units, that fills the bar completely.
  /// Beyond it the bar simply saturates: a bar that keeps growing turns a bad
  /// night into a broken layout.
  let fullScale: Double
  let read: (HelixSnapshot.Vitals?) -> HelixSnapshot.Vital?

  static let hrv = VitalSpec(
    label: "HRV", unit: "ms", color: Helix.emerald, decimals: 0,
    upIsGood: true, fullScale: 20, read: { $0?.hrvMs })
  static let restingBpm = VitalSpec(
    label: "RESTING HR", unit: "bpm", color: Helix.oxide, decimals: 0,
    upIsGood: false, fullScale: 8, read: { $0?.restingBpm })
  static let wristTemp = VitalSpec(
    // The stored value is ALREADY a deviation from Apple's own baseline, so this
    // bar is a deviation of a deviation — which is the useful one: "you have run
    // warm all fortnight" and "you are warm tonight" are different facts.
    label: "WRIST TEMP", unit: "°C", color: Helix.copper, decimals: 2,
    upIsGood: false, fullScale: 0.5, read: { $0?.wristTempDeltaC })
  static let bloodOxygen = VitalSpec(
    label: "BLOOD O₂", unit: "%", color: Helix.sapphire, decimals: 1,
    upIsGood: true, fullScale: 2, read: { $0?.bloodOxygenPct })
  static let respiratoryRate = VitalSpec(
    label: "RESPIRATORY", unit: "br/min", color: Helix.amethyst, decimals: 1,
    upIsGood: false, fullScale: 2, read: { $0?.respiratoryRate })

  static let all: [VitalSpec] = [hrv, restingBpm, wristTemp, bloodOxygen, respiratoryRate]
}

/// A reading against its own normal: a centred tick, and a fill running out
/// from it in the direction the night actually went.
///
/// Green and oxide are assigned by the METRIC's direction, never by the sign —
/// a resting heart rate five beats under your normal is the good case and would
/// read as a loss on a naive up-is-good bar.
struct VitalBar: View {
  let spec: VitalSpec
  let vital: HelixSnapshot.Vital?
  let mono: Bool

  private var delta: Double? { vital?.delta }

  var body: some View {
    GeometryReader { geo in
      let mid = geo.size.width / 2
      let frac = delta.map { min(1, abs($0) / spec.fullScale) } ?? 0
      let width = mid * CGFloat(frac)
      ZStack(alignment: .leading) {
        Capsule().fill(.white.opacity(0.07))
        if let delta, abs(delta) > 0.0001 {
          let good = spec.upIsGood ? delta > 0 : delta < 0
          Capsule()
            .fill(mono ? Color.white : (good ? Helix.emerald : Helix.oxide))
            .frame(width: max(2, width))
            // Rightward for a raised reading, leftward for a lowered one —
            // the direction is the reading's, not the verdict's, or a good
            // night and a bad one would point the same way.
            .offset(x: delta > 0 ? mid : mid - max(2, width))
        }
        // The baseline tick. Always drawn, including when there is no reading:
        // it is the thing the bar is measured from, and a bar with no origin is
        // a bar with no meaning.
        Rectangle()
          .fill(.white.opacity(0.30))
          .frame(width: 1)
          .offset(x: mid)
      }
    }
    .frame(height: 5)
  }
}

/// Label · value · delta · bar. The row every Vitals face is built from.
struct VitalRow: View {
  let spec: VitalSpec
  let vitals: HelixSnapshot.Vitals?
  let mono: Bool

  private var vital: HelixSnapshot.Vital? { spec.read(vitals) }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Text(spec.label)
          .font(.system(size: 8, weight: .bold))
          .foregroundStyle(mono ? .white : spec.color)
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(HelixSnapshot.fixed(vital?.value, decimals: spec.decimals) ?? "—")
          .font(.system(size: 12, weight: .bold, design: .monospaced))
          .foregroundStyle(.white)
        Text(spec.unit)
          .font(.system(size: 8))
          .foregroundStyle(Helix.muted)
        DeltaChip(delta: vital?.delta, decimals: spec.decimals,
                  upIsGood: spec.upIsGood, monochrome: mono)
      }
      VitalBar(spec: spec, vital: vital, mono: mono)
    }
  }
}

// MARK: - Faces

/// Small · one reading, its deviation, and the week behind it.
struct VitalLeadFace: View {
  let entry: HelixEntry
  let mono: Bool
  let spec: VitalSpec

  private var s: HelixSnapshot? { entry.snapshot }
  private var vital: HelixSnapshot.Vital? { spec.read(s?.vitals) }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption(spec.label, color: mono ? .white : spec.color)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono, size: 12)
      }

      BigValue(value: HelixSnapshot.fixed(vital?.value, decimals: spec.decimals), size: 28, color: .white)

      HStack(spacing: 4) {
        DeltaChip(delta: vital?.delta, decimals: spec.decimals,
                  upIsGood: spec.upIsGood, monochrome: mono)
        Text(baselineLine)
          .font(.system(size: 9)).foregroundStyle(Helix.muted).lineLimit(1)
      }

      Spacer(minLength: 0)

      if let trend = vital?.trend, trend.count > 1 {
        Sparkline(points: trend.map(\.v), color: mono ? .white : spec.color)
          .frame(height: 18)
      } else {
        VitalBar(spec: spec, vital: vital, mono: mono)
      }
    }
  }

  /// "vs 51 ms usual", or the honest absence. A reading with no normal behind it
  /// is not a deviation of zero.
  private var baselineLine: String {
    guard let b = HelixSnapshot.fixed(vital?.baseline, decimals: spec.decimals) else {
      return "no baseline yet"
    }
    return "vs \(b) \(spec.unit) usual"
  }
}

/// Medium · two readings, each with its bar, plus the day's steps and sleep.
struct VitalPairFace: View {
  let entry: HelixEntry
  let mono: Bool
  let specs: [VitalSpec]

  private var s: HelixSnapshot? { entry.snapshot }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 5) {
        Caption("VITALS", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono, size: 15)
      }

      ForEach(Array(specs.enumerated()), id: \.offset) { _, spec in
        VitalRow(spec: spec, vitals: s?.vitals, mono: mono)
      }

      Spacer(minLength: 0)
      Hairline()
      DayFloorRow(snapshot: s, mono: mono)
    }
  }
}

/// Medium/Large · the whole panel — every reading Helix records overnight.
struct VitalsPanelFace: View {
  let entry: HelixEntry
  let mono: Bool
  let large: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  /// On Medium only the three readings that move most night to night fit with
  /// their bars legible. Cramming five in would be five 3px bars, which is a
  /// texture rather than a chart.
  private var specs: [VitalSpec] {
    large ? VitalSpec.all : [.hrv, .restingBpm, .wristTemp]
  }

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 9 : 7) {
      HStack(spacing: 5) {
        Caption("VITALS", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono, size: large ? 16 : 15)
      }

      if s?.vitals == nil {
        // A build talking to a deployment without the vitals block, or a night
        // with nothing on the wrist. Both are absence, and absence gets a
        // sentence rather than five rows of em dashes.
        Text("no overnight readings yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        ForEach(Array(specs.enumerated()), id: \.offset) { _, spec in
          VitalRow(spec: spec, vitals: s?.vitals, mono: mono)
        }
      }

      Spacer(minLength: 0)
      Hairline()
      DayFloorRow(snapshot: s, mono: mono)
    }
  }
}

/// Steps and sleep — the two readings on this panel that DO have goals.
///
/// They keep a goal rail rather than a deviation bar, because "8,412 of 10,000"
/// is a genuinely different claim from "312 above your usual", and drawing them
/// with the same shape as HRV would quietly turn a baseline into a target.
struct DayFloorRow: View {
  let snapshot: HelixSnapshot?
  let mono: Bool

  var body: some View {
    HStack(spacing: 10) {
      GoalStat(
        label: "STEPS",
        value: snapshot?.steps.count.map { "\($0)" },
        progress: progress(snapshot?.steps.count.map(Double.init),
                           snapshot?.steps.goal.map(Double.init)),
        color: mono ? .white : Helix.gold)
      GoalStat(
        label: "SLEEP",
        value: snapshot?.sleep.minutes.map { HelixSnapshot.formatSleep($0) },
        progress: progress(snapshot?.sleep.minutes.map(Double.init),
                           snapshot?.sleep.goalMin.map(Double.init)),
        color: mono ? .white : Helix.amethyst)
    }
  }

  /// Nil rather than 0 when there is no goal: an empty rail says "none of it
  /// done", and "we do not know what you were aiming for" is a different state.
  private func progress(_ value: Double?, _ goal: Double?) -> Double? {
    guard let value, let goal, goal > 0 else { return nil }
    return min(1, value / goal)
  }
}

/// One goal-bearing figure with its rail.
struct GoalStat: View {
  let label: String
  let value: String?
  let progress: Double?
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Text(label).font(.system(size: 7, weight: .bold)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
        Text(value ?? "—")
          .font(.system(size: 11, weight: .bold, design: .monospaced))
          .foregroundStyle(.white)
          .lineLimit(1)
      }
      Rail(progress: progress, color: color, height: 3)
    }
  }
}
