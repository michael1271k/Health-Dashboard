import SwiftUI
import HelixCore
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

/// The size a tile is asked to draw at when it is NOT on the Home Screen.
///
/// `EnvironmentValues.widgetFamily` has no setter, so the app's Today grid
/// cannot pretend to be a Medium slot the honest way. Every tile reads this
/// first and falls back to `widgetFamily`, which is what WidgetKit sets.
private struct HelixTileFamilyKey: EnvironmentKey {
  static let defaultValue: WidgetFamily? = nil
}

public extension EnvironmentValues {
  var helixTileFamily: WidgetFamily? {
    get { self[HelixTileFamilyKey.self] }
    set { self[HelixTileFamilyKey.self] = newValue }
  }
}

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
      .font(HelixWidgetType.face(size, weight: .bold))
      .foregroundStyle(Color.helix.textSecondary)
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
        .font(HelixWidgetType.face(size, weight: .bold, design: .rounded))
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
        Capsule().fill(Color.helix.hairline)
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

  private var color: Color { monochrome ? .white : Color.helix.battery(pct) }

  var body: some View {
    ZStack {
      Circle().stroke(Color.helix.hairline, lineWidth: lineWidth)
      if let pct {
        Circle().trim(from: 0, to: Double(pct) / 100)
          .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .shadow(color: color.opacity(monochrome ? 0 : 0.5), radius: 4)
      }
      VStack(spacing: 0) {
        BigValue(value: pct.map { "\($0)" }, size: size * 0.27, color: .white)
        Text("BATT")
          .font(HelixWidgetType.face(size * 0.11, weight: .bold))
          .foregroundStyle(Color.helix.textSecondary)
      }
    }
    .frame(width: size, height: size)
  }
}

struct Caption: View {
  let text: String
  var color: Color = HelixDomain.train.accent
  init(_ text: String, color: Color = HelixDomain.train.accent) {
    self.text = text
    self.color = color
  }
  var body: some View {
    Text(text)
      .font(HelixWidgetType.face(10, weight: .heavy)).tracking(1.5)
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
      Text(label).font(.caption2).foregroundStyle(Color.helix.textSecondary)
    }
  }
}

/// How old the numbers on screen are. A number you cannot date is worse than no
/// number.
///
/// ── WHY THIS TOOK AN ARGUMENT ────────────────────────────────────────────────
/// It used to render the fixed string "last known" and appear only when a fetch
/// had FAILED. That covers the case where the phone has no signal and misses the
/// one that actually bites: a payload fetched perfectly at 06:00 and still on
/// screen at 14:00, wearing no tag, looking exactly as confident as a fresh one.
/// `generatedAt` had been in the payload the whole time and nothing read it.
struct StaleTag: View {
  /// Seconds since the payload was generated. Nil when it cannot be dated, which
  /// falls back to the honest, vaguer wording rather than inventing an age.
  var age: TimeInterval?

  var body: some View {
    Text(HelixSnapshot.shortAge(age).map { "\($0) ago" } ?? "last known")
      .font(HelixWidgetType.face(8, weight: .semibold))
      .foregroundStyle(Color.helix.textSecondary)
  }
}

/// The day's declared context — Illness, Travel, Refeed — or nothing at all.
///
/// ── WHY A WIDGET NEEDS THIS AT ALL ───────────────────────────────────────────
/// The widget is the surface you glance at without opening anything, which makes
/// it the one most likely to be believed and the one least able to explain
/// itself. On a declared day the app has already forgiven the grade; a face that
/// shows the low number with no mark on it reports a failure that the rest of
/// the system does not think happened.
///
/// Amethyst, not a warning colour, and for the reason the app uses it
/// everywhere else: a declared day is not a failure.
struct ContextChip: View {
  let context: HelixSnapshot.DayContext?
  var monochrome = false

  var body: some View {
    if let context {
      Text(context.label.uppercased())
        .font(HelixWidgetType.face(8, weight: .bold))
        .tracking(0.4)
        .padding(.horizontal, 4)
        .padding(.vertical, 1.5)
        .foregroundStyle(monochrome ? Color.white : HelixDomain.recover.accent)
        .background(
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill((monochrome ? Color.white : HelixDomain.recover.accent).opacity(0.16))
        )
    } else {
      EmptyView()
    }
  }
}

/// What to do about it, not just that something is wrong.
///
/// One state now. The old version diagnosed three network failures (no token,
/// token rejected, unreachable); there is no network — the provider reads the
/// App Group database — so the only way to have nothing is that the app has
/// never written it.
struct Unavailable: View {
  var compact = false

  private let symbol = "tray"
  private let title = "Nothing to show yet"
  private let detail = "Open HELIX once and the tiles fill from its database."

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: symbol).font(HelixWidgetType.face(14)).foregroundStyle(Color.helix.textSecondary)
      Text(title).font(HelixWidgetType.face(12, weight: .bold)).foregroundStyle(.white)
      if !compact {
        Text(detail)
          .font(HelixWidgetType.face(9))
          .foregroundStyle(Color.helix.textSecondary)
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
      .fill(Color.helix.hairline)
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
        .font(HelixWidgetType.face(10, weight: .semibold)).tracking(0.6)
        .foregroundStyle(Color.helix.textSecondary)
        .lineLimit(1)
      Spacer(minLength: 4)
      BigValue(value: value, size: 14, color: color)
      if let trailing {
        Text(trailing).font(HelixWidgetType.face(9)).foregroundStyle(Color.helix.textSecondary)
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
  let segments: [(HelixSleepStage, Int)]
  var height: CGFloat = 12
  var monochrome = false

  private var total: Int { segments.reduce(0) { $0 + $1.1 } }

  var body: some View {
    GeometryReader { geo in
      if total > 0 {
        HStack(spacing: 1) {
          ForEach(HelixSleepStage.allCases, id: \.self) { stage in
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
          .fill(Color.helix.hairline)
      }
    }
    .frame(height: height)
  }

  /// In tinted mode the ramp survives as opacity, so depth is still legible.
  private func stageOpacity(_ stage: HelixSleepStage) -> Double {
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
  var color: Color = HelixDomain.train.accent
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
            .stroke(Color.helix.textSecondary.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
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
          .font(HelixWidgetType.face(9))
          .foregroundStyle(Color.helix.textSecondary)
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
  let segments: [(HelixSleepStage, Int)]
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
          .stroke(Color.helix.hairline, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
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
              .font(HelixWidgetType.face(max(7, d * 0.075)))
              .foregroundStyle(Color.helix.textSecondary)
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
      return [(0, fill, monochrome ? .white : HelixDomain.recover.accent)]
    }
    var cursor = 0.0
    var out: [(Double, Double, Color)] = []
    for stage in HelixSleepStage.allCases {
      guard let m = segments.first(where: { $0.0 == stage })?.1, m > 0 else { continue }
      let width = fill * Double(m) / Double(staged)
      out.append((cursor, cursor + width, monochrome ? Color.white.opacity(stageOpacity(stage)) : stage.color))
      cursor += width
    }
    return out
  }

  private func stageOpacity(_ stage: HelixSleepStage) -> Double {
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
        .font(HelixWidgetType.face(9)).foregroundStyle(Color.helix.textSecondary)
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
              .stroke(Color.helix.textSecondary.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
          }
        }
        if let label {
          HStack(spacing: max(2, 4)) {
            ForEach(points) { point in
              Text(label(point))
                .font(HelixWidgetType.face(7, weight: .bold))
                .foregroundStyle(Color.helix.textSecondary)
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
      let color: Color = monochrome ? .white : (!moved ? Color.helix.textSecondary : good ? Color.helix.good : Color.helix.danger)
      HStack(spacing: 2) {
        if moved {
          Image(systemName: delta > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
            .font(HelixWidgetType.face(7))
        }
        Text(text + suffix).font(HelixWidgetType.face(10, weight: .bold)).monospacedDigit()
      }
      .foregroundStyle(color)
    } else {
      // No comparison is not "no change". Saying so costs four characters.
      Text("new").font(HelixWidgetType.face(9, weight: .semibold)).foregroundStyle(Color.helix.textSecondary)
    }
  }
}

/// A titled band with a leading accent rule — the Large faces' register
/// separator. A rule instead of a card: three bordered boxes on a Large widget
/// is three frames competing with the numbers inside them.
struct Register<Content: View>: View {
  let title: String
  var accent: Color = HelixDomain.train.accent
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

// MARK: - Brand

// ── WHY THE MARK IS DRAWN AND NOT SHIPPED AS AN IMAGE ────────────────────────
// This sits at 12–16pt in a widget corner. A 1024px render with a glow
// downsamples to about four grey pixels and a smudge — every feature that makes
// it recognisable is smaller than a pixel at the size it would actually appear.
// And iOS 18's accented rendering mode flattens an image to a single colour, so
// an asset comes out as one flat blob that reads as a rendering fault.
//
// A stroked ring survives both: it reads small because it is a line rather than
// a surface, and it takes the accented mode's ink for free. The shape itself is
// `OnyxMark`, in `Brand/` — the faces only decide WHERE it goes.

/// The mark, placed. Top-trailing, out of the way, never in the tap path.
///
/// Which faces carry it is each call site's decision, not this view's; it only
/// knows how to draw it once that decision is made. Small faces pass a smaller
/// `size` rather than opting out, since 150pt is short of surface but not short
/// enough to be worth being the one widget family with no mark on it.
struct HelixBrand: View {
  var monochrome = false
  var size: CGFloat = 16

  var body: some View {
    OnyxMark(size: size, monochrome: monochrome)
      .allowsHitTesting(false)
  }
}

// MARK: - Type
//
// ── THE WIDGET SCALE IS NOT THE APP SCALE ────────────────────────────────────
// `HelixType` (in `DesignSystem/`) is six named roles on Apple's own text
// styles, and its floor is 11pt because nothing in an app should be smaller
// than that under any text setting. None of that applies here.
//
// A widget face is not an app screen. WidgetKit does not deliver Dynamic Type
// to it, a Lock Screen accessory family is 40pt tall in total, and a systemSmall
// has to fit a label, a figure and a unit inside 150pt. So these faces are typed
// in POINTS, deliberately, and they go down to 7 — which is exactly why they get
// their own scale with its own name instead of quietly widening the app's.
//
// ── ONE SCALE, THREE JOBS ────────────────────────────────────────────────────
// The rule was already half-observed and never written down: a headline value is
// `.rounded` and a changing figure is `.monospaced`, because a figure that
// changes between refreshes must not reflow its row when a 1 becomes a 7.
// Everywhere else the faces reached for `.system(size:weight:)` directly and got
// whichever they happened to type.
//
// Naming it means the next face gets it right by default rather than by memory,
// and it gives the token-discipline test one thing to grep for: a bare
// `.font(.system(size:` under `Tiles/` is now a failure.

enum HelixWidgetType {
  /// A headline value. Rounded, because it is the one thing being read.
  static func hero(_ size: CGFloat) -> Font {
    .system(size: size, weight: .bold, design: .rounded)
  }

  /// Anything that CHANGES between refreshes — counts, tonnages, times. Monospaced
  /// digits keep the column still while the number moves.
  static func figure(_ size: CGFloat) -> Font {
    .system(size: size, weight: .bold, design: .monospaced)
  }

  /// A name, a label, a session title. Prose, not data.
  static func label(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight)
  }

  /// The small-caps register caption. Paired with `.tracking(1.5)` in `Caption`.
  static let caption = Font.system(size: 10, weight: .heavy)

  /// A face's own size, weight and design, spelled out.
  ///
  /// The escape hatch, and the one the faces mostly use: thirty-odd distinct
  /// size/weight pairs across sixty faces are not a scale, they are a layout
  /// each. What this buys is not fewer numbers — it is that the numbers are all
  /// spelled the same way, so `Tiles/` can be swept for a font decision in one
  /// grep and the app's own scale can ban `.system(size:` outright.
  static func face(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
    .system(size: size, weight: weight, design: design)
  }
}
