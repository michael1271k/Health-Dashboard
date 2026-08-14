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
  /// Nil draws nothing at all rather than a flat line at zero.
  private var usable: [Double]? { points.count >= 2 ? points : nil }

  var body: some View {
    GeometryReader { geo in
      if let values = usable {
        // The band includes the baseline so the dotted line can never fall
        // outside the drawn area — which is exactly when it matters most.
        let lo = min(values.min() ?? 0, baseline ?? .greatestFiniteMagnitude)
        let hi = max(values.max() ?? 1, baseline ?? -.greatestFiniteMagnitude)
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
