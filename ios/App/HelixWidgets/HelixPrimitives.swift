import SwiftUI
import WidgetKit

// MARK: - Primitives
//
// ── THE ONE RULE THESE EXIST TO ENFORCE ──────────────────────────────────────
// Every one of these takes an OPTIONAL and renders an em dash for nil. The
// original versions wrote `entry.snapshot?.week.sessions ?? 0`, which is not a
// blank widget — it is a widget confidently reporting zero sessions, zero
// volume, zero PRs and a 0% battery on a week you trained five times. That is
// the "widgets show empty data" symptom, and it is a bug independent of whether
// the network works: `src/lib/widget/snapshot.ts` states the contract in its
// header — a widget showing "—" is correct, one showing an invented number is
// not — and the Swift side was the half that ignored it.
//
// They were all `private`, which is why the whole extension was one 482-line
// file: a second file could not use any of them. They are internal now.

/// The three Home Screen sizes, collapsed out of `WidgetFamily`.
///
/// ── WHY THIS EXISTS AND WHY IT IS NOT AN OPTIONAL ────────────────────────────
/// Face dispatchers switch on `(focus, size)` and are exhaustive with NO
/// `default:`. `WidgetFamily` carries a dozen cases including every accessory
/// one, so switching on it directly FORCES a `default:` — and a `default:` in a
/// dispatcher is exactly how six focuses came to draw another focus's face
/// without anything failing to compile. Three cases means a missing combination
/// is a build error.
enum HelixSize {
  case small, medium, large

  init(_ family: WidgetFamily) {
    switch family {
    case .systemSmall:                    self = .small
    case .systemLarge, .systemExtraLarge: self = .large
    default:                              self = .medium
    }
  }
}

struct Dash: View {
  var size: CGFloat = 20
  var body: some View {
    Text("—")
      .font(.system(size: size, weight: .bold))
      .foregroundStyle(Helix.muted)
  }
}

/// A big number, or an em dash. Never a zero standing in for "unknown".
struct BigValue: View {
  let value: String?
  var size: CGFloat = 30
  var color: Color = .white
  var body: some View {
    if let value {
      Text(value)
        .font(.system(size: size, weight: .bold, design: .rounded))
        .foregroundStyle(color)
        .minimumScaleFactor(0.6)
        .lineLimit(1)
    } else {
      Dash(size: size)
    }
  }
}

/// A progress rail. `nil` draws the empty track only — an unfilled bar reads as
/// "no reading", where a zero-width fill on a coloured track reads as "zero".
struct Rail: View {
  let progress: Double?
  let color: Color
  var height: CGFloat = 4
  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(.white.opacity(0.08))
        if let progress {
          Capsule().fill(color)
            .frame(width: max(0, CGFloat(progress) * geo.size.width))
        }
      }
    }
    .frame(height: height)
  }
}

/// The battery ring. A nil battery draws the track dimmed and an em dash in the
/// middle, rather than a full circle of "0%".
struct BatteryRing: View {
  let pct: Int?
  var size: CGFloat = 74
  var lineWidth: CGFloat = 8
  /// Tinted mode flattens everything to one accent; a coloured ring there reads
  /// as a rendering bug rather than a status.
  var monochrome = false

  private var color: Color { monochrome ? .white : Helix.battery(pct) }

  var body: some View {
    ZStack {
      Circle().stroke(.white.opacity(0.08), lineWidth: lineWidth)
      if let pct {
        Circle().trim(from: 0, to: Double(pct) / 100)
          .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .shadow(color: color.opacity(monochrome ? 0 : 0.5), radius: 4)
      }
      VStack(spacing: 0) {
        BigValue(value: pct.map { "\($0)" }, size: size * 0.27, color: .white)
        Text("BATT")
          .font(.system(size: size * 0.11, weight: .bold))
          .foregroundStyle(Helix.muted)
      }
    }
    .frame(width: size, height: size)
  }
}

struct Caption: View {
  let text: String
  var color: Color = Helix.ember
  init(_ text: String, color: Color = Helix.ember) {
    self.text = text
    self.color = color
  }
  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .heavy)).tracking(1.5)
      .foregroundStyle(color)
  }
}

struct Metric: View {
  let value: String?
  let label: String
  var color: Color = .white
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 5) {
      BigValue(value: value, size: 19, color: color)
      Text(label).font(.caption2).foregroundStyle(Helix.muted)
    }
  }
}

/// "last known", shown only when a CACHED snapshot is on screen. A number you
/// cannot date is worse than no number.
struct StaleTag: View {
  var body: some View {
    Text("last known")
      .font(.system(size: 8, weight: .semibold))
      .foregroundStyle(Helix.muted)
  }
}

/// What to do about it, not just that something is wrong.
struct Unavailable: View {
  let status: HelixSnapshotClient.Status
  var compact = false

  private var symbol: String {
    switch status {
    case .notConfigured: return "key.slash"
    case .unauthorized:  return "lock.trianglebadge.exclamationmark"
    default:             return "wifi.exclamationmark"
    }
  }
  private var title: String {
    switch status {
    case .notConfigured: return "Not configured"
    case .unauthorized:  return "Token rejected"
    default:             return "Can't reach HELIX"
    }
  }
  private var detail: String {
    switch status {
    case .notConfigured: return "Add HELIX_SNAPSHOT_URL / TOKEN to Secrets.xcconfig and rebuild."
    case .unauthorized:  return "Rotate the row in widget_tokens and rebuild."
    default:             return "Retrying shortly."
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: symbol).font(.system(size: 14)).foregroundStyle(Helix.oxide)
      Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
      if !compact {
        Text(detail)
          .font(.system(size: 9))
          .foregroundStyle(Helix.muted)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Composite primitives (new in the Lifestyle / Performance faces)

/// A hairline. Used instead of a box wherever two things need separating —
/// ten bordered tiles is ten frames around twelve characters of data.
struct Hairline: View {
  var vertical = false
  var body: some View {
    Rectangle()
      .fill(.white.opacity(0.08))
      .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
  }
}

/// One labelled row of the Ledger's right column: label left, value right,
/// separated by nothing but alignment.
struct LedgerRow: View {
  let label: String
  let value: String?
  var color: Color = .white
  var trailing: String?
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(label)
        .font(.system(size: 10, weight: .semibold)).tracking(0.6)
        .foregroundStyle(Helix.muted)
        .lineLimit(1)
      Spacer(minLength: 4)
      BigValue(value: value, size: 14, color: color)
      if let trailing {
        Text(trailing).font(.system(size: 9)).foregroundStyle(Helix.muted)
      }
    }
  }
}

/// The Sleep Rainbow: one stacked bar of stage TOTALS.
///
/// Honest by construction. `SleepStages.tsx` insists on the same point: these
/// are durations, not a timeline, and drawing them as a hypnogram would claim an
/// ordering within the night that HealthKit's aggregate simply does not carry.
/// Segments are sorted deep → awake because the RAMP orders, not the night.
struct DepthBar: View {
  /// `(stage, minutes)` — a stage with no reading is absent, not zero.
  let segments: [(Helix.SleepStage, Int)]
  var height: CGFloat = 12
  var monochrome = false

  private var total: Int { segments.reduce(0) { $0 + $1.1 } }

  var body: some View {
    GeometryReader { geo in
      if total > 0 {
        HStack(spacing: 1) {
          ForEach(Helix.SleepStage.allCases, id: \.self) { stage in
            if let minutes = segments.first(where: { $0.0 == stage })?.1, minutes > 0 {
              Rectangle()
                .fill(monochrome ? Color.white.opacity(stageOpacity(stage)) : stage.color)
                .frame(width: max(1, geo.size.width * CGFloat(minutes) / CGFloat(total)))
            }
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: height / 2, style: .continuous))
      } else {
        // No stage breakdown is a real state — a night synced as a duration with
        // no stages at all. An empty track says so; four zero-width bars do not.
        RoundedRectangle(cornerRadius: height / 2, style: .continuous)
          .fill(.white.opacity(0.08))
      }
    }
    .frame(height: height)
  }

  /// In tinted mode the ramp survives as opacity, so depth is still legible.
  private func stageOpacity(_ stage: Helix.SleepStage) -> Double {
    switch stage {
    case .deep: return 1.0
    case .core: return 0.75
    case .rem: return 0.5
    case .awake: return 0.3
    }
  }
}

/// A sparkline with an optional dotted baseline.
///
/// The baseline is what makes "compared to last week" a thing you SEE rather
/// than a number you read and then have to hold in your head against a curve.
struct Sparkline: View {
  let points: [Double]
  var baseline: Double?
  var color: Color = Helix.ember
  /// Read against zero. True for quantities that HAVE a meaningful zero —
  /// tonnage, water, calories — and false for bodyweight, where zero-basing an
  /// 78-to-80 kg fortnight flattens the only signal in it.
  var zeroBased = false
  /// Nil draws nothing at all rather than a flat line at zero.
  private var usable: [Double]? { points.count >= 2 ? points : nil }

  /// ── WHY THE BAND IS NEVER EXACTLY min…max ──────────────────────────────────
  /// A band of exactly the series' own range pins the lowest reading to the
  /// floor and the highest to the ceiling on EVERY chart, whatever the real
  /// variation. Eight weeks between 12.1 t and 14.2 t then draws the same cliff
  /// as eight weeks between 2 t and 20 t: the line always starts at the bottom
  /// and ends at the top, and its SHAPE stops carrying information.
  ///
  /// A flat series is the other end of the same problem — a zero span divides by
  /// nothing — so it gets an arbitrary band and sits in the middle of it, which
  /// is the honest picture of "this did not move".
  static func band(lo: Double, hi: Double, zeroBased: Bool) -> (lo: Double, hi: Double) {
    let floor = zeroBased ? Swift.min(0, lo) : lo
    let span = hi - floor
    guard span > 0.0001 else { return (floor - 1, hi + 1) }
    let pad = span * 0.12
    // No pad BELOW a zero base: a bar dipping under its own axis is a bar
    // claiming a negative quantity.
    return (zeroBased ? floor : floor - pad, hi + pad)
  }

  var body: some View {
    GeometryReader { geo in
      if let values = usable {
        // The band includes the baseline so the dotted line can never fall
        // outside the drawn area — which is exactly when it matters most.
        let rawLo = min(values.min() ?? 0, baseline ?? .greatestFiniteMagnitude)
        let rawHi = max(values.max() ?? 1, baseline ?? -.greatestFiniteMagnitude)
        let (lo, hi) = Self.band(lo: rawLo, hi: rawHi, zeroBased: zeroBased)
        let span = max(hi - lo, 0.0001)
        let y = { (v: Double) in geo.size.height * (1 - CGFloat((v - lo) / span)) }
        let x = { (i: Int) in geo.size.width * CGFloat(i) / CGFloat(max(values.count - 1, 1)) }

        ZStack {
          if let baseline {
            Path { p in
              p.move(to: CGPoint(x: 0, y: y(baseline)))
              p.addLine(to: CGPoint(x: geo.size.width, y: y(baseline)))
            }
            .stroke(Helix.muted.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
          }
          Path { p in
            p.move(to: CGPoint(x: x(0), y: y(values[0])))
            for i in 1..<values.count { p.addLine(to: CGPoint(x: x(i), y: y(values[i]))) }
          }
          .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
          // The latest reading, marked. A trace without a "you are here" makes
          // the reader find the right-hand end for themselves every glance.
          Circle()
            .fill(color)
            .frame(width: 4, height: 4)
            .position(x: x(values.count - 1), y: y(values[values.count - 1]))
        }
      } else {
        Text("not enough readings")
          .font(.system(size: 9))
          .foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      }
    }
  }
}

/// The Sleep Rainbow as a semicircular gauge.
///
/// ── WHY AN ARC RATHER THAN A SECOND BAR ──────────────────────────────────────
/// `DepthBar` answers "what was the night made of" and answers it well, but it
/// cannot answer "was it enough" — a stacked bar is always full width, so a
/// five-hour night and a nine-hour one draw the identical rectangle. The Small
/// sleep face therefore had nothing to show but text.
///
/// The arc carries BOTH. Its sweep is duration against the goal, so a short night
/// is visibly a short arc; the fill is then sub-divided by stage, so the same
/// shape still says how much of it was deep. One gauge, two questions, and the
/// stage ramp survives intact.
///
/// Over-sleeping caps the sweep at full rather than wrapping. A gauge that laps
/// itself reads as a short night.
struct DepthArc: View {
  /// `(stage, minutes)` — a stage with no reading is absent, not zero.
  let segments: [(Helix.SleepStage, Int)]
  let minutes: Int?
  let goalMin: Int?
  var lineWidth: CGFloat = 10
  var monochrome = false

  private var staged: Int { segments.reduce(0) { $0 + $1.1 } }
  /// How much of the semicircle is filled. Nil draws the empty track only —
  /// which is the honest picture of a night with no reading at all.
  private var fill: Double? {
    guard let minutes, minutes > 0 else { return nil }
    let goal = Double(goalMin ?? 480)
    guard goal > 0 else { return nil }
    return min(1, Double(minutes) / goal)
  }

  var body: some View {
    GeometryReader { geo in
      // The drawn circle is a square whose TOP HALF is the arc; the label sits in
      // the bowl beneath it. Height is 0.72 of that square because nothing is
      // ever drawn in the bottom quarter, and reserving it is how a gauge ends up
      // with an inch of nothing under it.
      let d = min(geo.size.width, geo.size.height / 0.72)
      ZStack {
        Circle()
          .trim(from: 0, to: 0.5)
          .stroke(.white.opacity(0.08), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
          .rotationEffect(.degrees(180))

        if let fill {
          // Each stage takes its SHARE OF THE FILL, so the segments always add up
          // to exactly the arc that was drawn — never to more of it than the night
          // actually earned.
          ForEach(Array(arcSpans(fill: fill).enumerated()), id: \.offset) { _, span in
            Circle()
              .trim(from: 0.5 * span.from, to: 0.5 * span.to)
              .stroke(span.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
              .rotationEffect(.degrees(180))
          }
        }

        VStack(spacing: 1) {
          BigValue(value: HelixSnapshot.formatSleep(minutes) == "—" ? nil
                   : HelixSnapshot.formatSleep(minutes), size: d * 0.17, color: .white)
          if let goalMin {
            Text("goal \(HelixSnapshot.formatSleep(goalMin))")
              .font(.system(size: max(7, d * 0.075)))
              .foregroundStyle(Helix.muted)
          }
        }
        .offset(y: d * 0.12)
      }
      .frame(width: d, height: d)
      .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
    }
  }

  /// Fractions of the semicircle, one span per reported stage.
  ///
  /// With no stage breakdown at all — a night synced as a duration and nothing
  /// else — the whole fill is drawn in one colour rather than vanishing. The
  /// duration is real even when the composition is not.
  private func arcSpans(fill: Double) -> [(from: Double, to: Double, color: Color)] {
    guard staged > 0 else {
      return [(0, fill, monochrome ? .white : Helix.sapphire)]
    }
    var cursor = 0.0
    var out: [(Double, Double, Color)] = []
    for stage in Helix.SleepStage.allCases {
      guard let m = segments.first(where: { $0.0 == stage })?.1, m > 0 else { continue }
      let width = fill * Double(m) / Double(staged)
      out.append((cursor, cursor + width, monochrome ? Color.white.opacity(stageOpacity(stage)) : stage.color))
      cursor += width
    }
    return out
  }

  private func stageOpacity(_ stage: Helix.SleepStage) -> Double {
    switch stage {
    case .deep:  return 1.0
    case .core:  return 0.75
    case .rem:   return 0.5
    case .awake: return 0.3
    }
  }
}

/// Zero-based bars over a short window, with an optional dotted rule.
///
/// ── WHY BARS AND NOT THE SPARKLINE ───────────────────────────────────────────
/// A line implies that the value existed between its points. For a WEEK of
/// tonnage or a DAY of water that is false — each reading is a bucket, and the
/// space between two of them is not a slower Tuesday, it is nothing at all. Bars
/// say "these are the eight quantities" where a line says "this is how it
/// moved", and only one of those is true here.
///
/// Zero-based for the same reason `Sparkline.band` exists: eight weeks between
/// 12.1 t and 14.2 t auto-scaled to their own range draw a cliff. Against zero
/// they draw eight bars of nearly equal height, which is what happened.
struct BarChart: View {
  let points: [HelixSnapshot.Point]
  /// Drawn as a dotted rule AND included in the scale, so a goal you are miles
  /// short of still appears on the chart.
  var goal: Double?
  var color: Color
  /// The most recent bar is the one you are still able to change.
  var highlightLast = true
  /// A caption under each bar — a weekday initial, a week number. Nil draws none.
  var label: ((HelixSnapshot.Point) -> String)?

  private var peak: Double {
    max(points.map(\.v).max() ?? 0, goal ?? 0, 0.0001)
  }

  var body: some View {
    if points.isEmpty {
      Text("no readings in this window")
        .font(.system(size: 9)).foregroundStyle(Helix.muted)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      VStack(spacing: 3) {
        GeometryReader { geo in
          ZStack(alignment: .bottom) {
            HStack(alignment: .bottom, spacing: max(2, geo.size.width / CGFloat(points.count) * 0.22)) {
              ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                let isLast = index == points.count - 1
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                  .fill(color.opacity(highlightLast && !isLast ? 0.45 : 1))
                  // A floor of 1pt, so a genuinely tiny day is a hairline rather
                  // than an absence — absence is what an omitted point means.
                  .frame(height: max(1, geo.size.height * CGFloat(point.v / peak)))
                  .frame(maxWidth: .infinity)
              }
            }
            if let goal, goal > 0 {
              Path { p in
                let y = geo.size.height * (1 - CGFloat(goal / peak))
                p.move(to: CGPoint(x: 0, y: y))
                p.addLine(to: CGPoint(x: geo.size.width, y: y))
              }
              .stroke(Helix.muted.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
          }
        }
        if let label {
          HStack(spacing: max(2, 4)) {
            ForEach(points) { point in
              Text(label(point))
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(Helix.muted)
                .frame(maxWidth: .infinity)
            }
          }
        }
      }
    }
  }
}

/// A ▲/▼ chip against a comparison. Neutral — not green — when nothing moved.
struct DeltaChip: View {
  let delta: Double?
  var decimals: Int = 1
  var suffix: String = ""
  /// Set false where DOWN is the good direction (bodyweight on a cut). The
  /// verdict belongs to the metric, never to the sign.
  var upIsGood = true
  var monochrome = false

  var body: some View {
    if let delta, let text = HelixSnapshot.signed(delta, decimals: decimals) {
      let moved = abs(delta) > 0.0001
      let good = upIsGood ? delta > 0 : delta < 0
      let color: Color = monochrome ? .white : (!moved ? Helix.muted : good ? Helix.emerald : Helix.oxide)
      HStack(spacing: 2) {
        if moved {
          Image(systemName: delta > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
            .font(.system(size: 7))
        }
        Text(text + suffix).font(.system(size: 10, weight: .bold)).monospacedDigit()
      }
      .foregroundStyle(color)
    } else {
      // No comparison is not "no change". Saying so costs four characters.
      Text("new").font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
    }
  }
}

/// A titled band with a leading accent rule — the Large faces' register
/// separator. A rule instead of a card: three bordered boxes on a Large widget
/// is three frames competing with the numbers inside them.
struct Register<Content: View>: View {
  let title: String
  var accent: Color = Helix.ember
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Caption(title, color: accent)
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A vertical, four-segment day column for the week strip. Segments are stacked
/// bottom-up so the column reads as a filling glass.
struct DayColumn: View {
  /// `(fraction 0…1, colour)`, bottom first. An absent reading is simply absent.
  let segments: [(Double, Color)]
  var highlighted = false

  var body: some View {
    GeometryReader { geo in
      VStack(spacing: 1) {
        Spacer(minLength: 0)
        ForEach(Array(segments.enumerated().reversed()), id: \.offset) { _, seg in
          RoundedRectangle(cornerRadius: 1.5)
            .fill(seg.1.opacity(highlighted ? 1 : 0.45))
            .frame(height: max(2, geo.size.height * CGFloat(min(1, max(0, seg.0))) / CGFloat(max(segments.count, 1))))
        }
      }
    }
  }
}
