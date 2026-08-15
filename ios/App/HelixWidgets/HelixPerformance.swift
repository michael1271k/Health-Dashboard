import WidgetKit
import SwiftUI

// MARK: - Performance faces
//
// These are the Training family's `records` and `oneRepMax` focuses. They kept
// their own file and their own payload slice — records and estimated 1RM are the
// only faces that need the performance scope, and a calendar should not pay to
// decode a ledger it never draws (see `TrainingFocus.scope`).
//
// The dispatching `PerformanceView` and its widget declaration are gone; the
// faces below are now reached through `TrainingView`.

/// What a performance face leads with. Internal, not an `AppEnum`: the picker
/// shows `TrainingFocus`, and a face should not know which widget it is inside.
enum PerfFace {
  case records, heaviest, oneRepMax, volume

  var link: URL? {
    switch self {
    case .records, .heaviest, .oneRepMax: return HelixLink.exercises
    case .volume:                         return HelixLink.reports
    }
  }
}

// MARK: - C6 · Focus (Small)

struct PerfFocusFace: View {
  let entry: HelixEntry
  let focus: PerfFace
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var topRecord: HelixSnapshot.Record? { s?.records?.first }
  private var topLift: HelixSnapshot.E1rm? { s?.e1rm?.first }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 4) {
        Caption(caption, color: mono ? .white : accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }
      BigValue(value: hero, size: 28, color: .white)
      if let sub {
        Text(sub).font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(2)
      }
      Spacer(minLength: 0)
      footer
    }
  }

  private var accent: Color {
    // GOLD, and only for records. Everywhere else it would stop meaning one.
    switch focus {
    case .records:   return Helix.gold
    case .heaviest:  return Helix.ember
    case .oneRepMax: return Helix.sapphire
    case .volume:    return Helix.emerald
    }
  }

  private var caption: String {
    switch focus {
    case .records:   return "LATEST PR"
    case .heaviest:  return "HEAVIEST"
    case .oneRepMax: return "EST 1RM"
    case .volume:    return "WEEK VOLUME"
    }
  }

  private var hero: String? {
    switch focus {
    case .records:
      return topRecord.map { formatRecord($0) }
    case .heaviest:
      // The heaviest LOAD the ledger knows about, which is what "heaviest"
      // means to a lifter — not the biggest number on any axis.
      return (s?.records?.filter { $0.axis == "weight" }.map(\.value).max())
        .map { String(format: "%.1f kg", $0) }
    case .oneRepMax:
      return topLift.map { String(format: "%.1f kg", $0.kg) }
    case .volume:
      return HelixSnapshot.tonnes(s?.week.volumeKg)
    }
  }

  private var sub: String? {
    switch focus {
    case .records:   return topRecord?.exercise
    case .heaviest:  return s?.records?.filter { $0.axis == "weight" }
      .max(by: { $0.value < $1.value })?.exercise
    case .oneRepMax: return topLift?.exercise
    case .volume:    return s.map { "\($0.week.sessions) session\($0.week.sessions == 1 ? "" : "s")" }
    }
  }

  @ViewBuilder private var footer: some View {
    switch focus {
    case .records:
      if let when = HelixSnapshot.relativeDay(topRecord?.achievedOn) {
        Text(when).font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
      }
    case .oneRepMax:
      DeltaChip(delta: topLift?.deltaKg, decimals: 1, suffix: " kg", monochrome: mono)
    case .volume:
      DeltaChip(delta: volumeDeltaTonnes, decimals: 1, suffix: " t", monochrome: mono)
    case .heaviest:
      Rail(progress: nil, color: Helix.ember)
    }
  }

  private var volumeDeltaTonnes: Double? {
    guard let now = s?.week.volumeKg, let then = s?.weekPrev?.volumeKg else { return nil }
    return (now - then) / 1000
  }

  /// "105 kg" / "17 reps" / "1 240 kg" — the axis decides the unit, because
  /// printing a rep count with "kg" after it is the kind of wrong that looks
  /// authoritative.
  private func formatRecord(_ r: HelixSnapshot.Record) -> String {
    switch r.axis {
    case "reps":    return "\(Int(r.value.rounded())) reps"
    case "seconds": return "\(Int(r.value.rounded()))s"
    default:        return String(format: "%.1f kg", r.value)
    }
  }
}

// MARK: - C1 · Ledger (Medium)

struct PerfLedgerFace: View {
  let entry: HelixEntry
  let focus: PerfFace
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    HStack(spacing: 12) {
      Link(destination: HelixLink.reports ?? HelixLink.home!) { heroColumn }
      Hairline(vertical: true)
      Link(destination: focus.link ?? HelixLink.home!) { ledgerColumn }
    }
  }

  private var heroColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("THIS WEEK", color: tint(Helix.emerald))
        if entry.isStale { StaleTag() }
      }
      Spacer(minLength: 0)
      BigValue(value: HelixSnapshot.tonnes(s?.week.volumeKg), size: 30, color: .white)
      HStack(spacing: 5) {
        Text("volume").font(.system(size: 10)).foregroundStyle(Helix.muted)
        DeltaChip(delta: volumeDeltaTonnes, decimals: 1, suffix: " t", monochrome: mono)
      }
      // Sessions carry a denominator when the plan states one. "3" alone is not
      // a fact you can act on at a glance; "3/5" is.
      Rail(progress: sessionProgress, color: tint(Helix.emerald))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var ledgerColumn: some View {
    VStack(spacing: 0) {
      LedgerRow(label: "SESSIONS", value: sessions, color: tint(Helix.sapphire))
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "SETS", value: s.map { "\($0.week.sets)" }, color: Helix.steel)
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "RECORDS", value: s.map { "\($0.week.prs)" },
                color: (s?.week.prs ?? 0) > 0 ? tint(Helix.gold) : Helix.muted)
      Hairline().padding(.vertical, 4)
      LedgerRow(label: "TODAY", value: s?.workout.label, color: .white)
    }
    .frame(maxWidth: .infinity)
  }

  private var sessions: String? {
    guard let week = s?.week else { return nil }
    if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target)" }
    return "\(week.sessions)"
  }

  private var sessionProgress: Double? {
    guard let week = s?.week, let target = week.sessionTarget, target > 0 else { return nil }
    return min(1, Double(week.sessions) / Double(target))
  }

  private var volumeDeltaTonnes: Double? {
    guard let now = s?.week.volumeKg, let then = s?.weekPrev?.volumeKg else { return nil }
    return (now - then) / 1000
  }
}

// MARK: - C4 · Record Grid (Large)

struct RecordGridFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      weekStrip
      Hairline()
      recordRegister
      Hairline()
      familyRegister
      Spacer(minLength: 0)
    }
  }

  // ── Register 1: the week, each figure against last week ───────────────────
  private var weekStrip: some View {
    Register(title: "THIS WEEK", accent: tint(Helix.emerald)) {
      HStack(spacing: 0) {
        WeekCell(label: "SESSIONS", value: sessions,
                 delta: delta(s?.week.sessions, s?.weekPrev?.sessions), decimals: 0, mono: mono)
        // `.map` binds to the UNWRAPPED `Double` here — `week` is the optional,
        // `volumeKg` is not — so `s?.week.volumeKg.map { … }` does not compile.
        // Only a leaf that is itself optional can take `.map` mid-chain. Same
        // trap as `WeekView.week`; unwrapped through a property instead.
        WeekCell(label: "VOLUME", value: HelixSnapshot.tonnes(s?.week.volumeKg),
                 delta: delta(tonnesThisWeek, tonnesLastWeek), decimals: 1, mono: mono)
        WeekCell(label: "SETS", value: s.map { "\($0.week.sets)" },
                 delta: delta(s?.week.sets, s?.weekPrev?.sets), decimals: 0, mono: mono)
        WeekCell(label: "RECORDS", value: s.map { "\($0.week.prs)" },
                 delta: delta(s?.week.prs, s?.weekPrev?.prs), decimals: 0, mono: mono,
                 color: (s?.week.prs ?? 0) > 0 ? tint(Helix.gold) : nil)
      }
    }
  }

  // ── Register 2: the records themselves. The only gold on the widget ───────
  @ViewBuilder private var recordRegister: some View {
    Register(title: "RECENT RECORDS", accent: mono ? .white : Helix.gold) {
      let records = s?.records ?? []
      if records.isEmpty {
        // A week without a record is an ordinary week, not a failure — and
        // certainly not an empty gold row implying one was missed.
        Text("no new records in the book yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
      } else {
        VStack(spacing: 4) {
          ForEach(records) { record in
            Link(destination: HelixLink.exercises ?? HelixLink.home!) {
              RecordRow(record: record, mono: mono)
            }
          }
        }
      }
    }
  }

  // ── Register 3: where the tonnage actually went ───────────────────────────
  @ViewBuilder private var familyRegister: some View {
    Register(title: "MUSCLE SPLIT", accent: tint(Helix.sapphire)) {
      let families = s?.volumeByFamily ?? []
      if families.isEmpty {
        Text("no sets logged this week")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
      } else {
        // Scaled against the week's OWN maximum. There is no per-family volume
        // landmark to grade against — `volumeZone` measures direct SETS against
        // per-muscle RP targets — so a bar coloured by "zone" here would look
        // like a verdict and be an invention. Relative emphasis is a comparison
        // the data actually supports.
        let peak = families.map(\.kg).max() ?? 1
        HStack(alignment: .bottom, spacing: 6) {
          ForEach(families) { family in
            VStack(spacing: 3) {
              GeometryReader { geo in
                VStack(spacing: 0) {
                  Spacer(minLength: 0)
                  RoundedRectangle(cornerRadius: 2)
                    .fill(mono ? .white : Helix.family(family.family))
                    .frame(height: max(2, geo.size.height * CGFloat(peak > 0 ? family.kg / peak : 0)))
                }
              }
              .frame(height: 26)
              Text(family.family.prefix(4).uppercased())
                .font(.system(size: 7, weight: .bold)).foregroundStyle(Helix.muted)
              Text(String(format: "%.0f", family.sets))
                .font(.system(size: 8, weight: .semibold)).monospacedDigit()
                .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
          }
        }
      }
    }
  }

  private var sessions: String? {
    guard let week = s?.week else { return nil }
    if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target)" }
    return "\(week.sessions)"
  }

  private var tonnesThisWeek: Double? { s.map { $0.week.volumeKg / 1000 } }
  private var tonnesLastWeek: Double? { s?.weekPrev.map { $0.volumeKg / 1000 } }

  /// A delta only exists when BOTH weeks do. A first week compared against
  /// nothing is "new", not "+everything".
  private func delta(_ now: Int?, _ then: Int?) -> Double? {
    guard let now, let then else { return nil }
    return Double(now - then)
  }
  private func delta(_ now: Double?, _ then: Double?) -> Double? {
    guard let now, let then else { return nil }
    return now - then
  }
}

private struct WeekCell: View {
  let label: String
  let value: String?
  let delta: Double?
  let decimals: Int
  let mono: Bool
  var color: Color?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.7).foregroundStyle(Helix.muted)
      BigValue(value: value, size: 17, color: color ?? .white)
      DeltaChip(delta: delta, decimals: decimals, monochrome: mono)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct RecordRow: View {
  let record: HelixSnapshot.Record
  let mono: Bool

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: axisSymbol)
        .font(.system(size: 9))
        .foregroundStyle(mono ? .white : Helix.gold)
        .frame(width: 12)
      Text(record.exercise)
        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
        .lineLimit(1)
      Spacer(minLength: 4)
      Text(valueText)
        .font(.system(size: 12, weight: .bold, design: .rounded)).monospacedDigit()
        .foregroundStyle(mono ? .white : Helix.gold)
      if let when = HelixSnapshot.relativeDay(record.achievedOn) {
        Text(when).font(.system(size: 9)).foregroundStyle(Helix.muted)
          .frame(width: 52, alignment: .trailing)
      }
    }
  }

  /// The axis, as a glyph. Four axes and four shapes, so the ROW says which kind
  /// of record it is without spending a word of the width on the label.
  private var axisSymbol: String {
    switch record.axis {
    case "weight": return "scalemass.fill"
    case "reps":   return "repeat"
    case "volume": return "square.stack.3d.up.fill"
    case "e1rm":   return "chart.line.uptrend.xyaxis"
    default:       return "trophy.fill"
    }
  }

  private var valueText: String {
    switch record.axis {
    case "reps":    return "\(Int(record.value.rounded())) reps"
    case "seconds": return "\(Int(record.value.rounded()))s"
    default:        return String(format: "%.1f kg", record.value)
    }
  }
}
