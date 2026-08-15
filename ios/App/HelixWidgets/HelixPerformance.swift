import WidgetKit
import SwiftUI

// MARK: - Performance faces
//
// The Training family's `records` and `oneRepMax` focuses. They kept their own
// file and their own payload slice — records and estimated 1RM are the only
// faces that need the performance scope, and a calendar should not pay to decode
// a ledger it never draws (see `TrainingFocus.scope`).
//
// ── WHY THESE TWO FOCUSES USED TO BE ONE ─────────────────────────────────────
// There was a `PerfFace` enum here too, and `PerfLedgerFace` took it — then read
// it only to choose a deep LINK, never to choose content. So the Records Medium
// and the 1RM Medium rendered the same four rows of week totals, and at Large
// both routed to `RecordGridFace`. Picking "Estimated 1RM" got you the record
// book at every size above Small.
//
// The enum is gone. Each focus has its own face at each size, and the numbers
// they draw are different numbers: records are a LEDGER of things that happened
// on a date, 1RM is a CURRENT ESTIMATE per lift with a direction of travel.

// MARK: - Axis vocabulary
//
// ── WHY A 440 kg ROMANIAN DEADLIFT APPEARED IN THE RECORD BOOK ───────────────
// `personal_records` carries four axes and the newest rows are usually `volume`
// and `e1rm`, not `weight`. The formatter had cases for `reps` and `seconds` and
// sent everything else to `String(format: "%.1f kg")` — so a 440 kg per-SET
// VOLUME record and a 54.7 kg ESTIMATED 1RM both printed as bare loads. One of
// those is a number nobody has ever lifted.
//
// The fix is not a longer value string; it is a second line. The value keeps its
// unit and the AXIS gets named underneath, so the reader is told which of the
// four kinds of record they are looking at.

extension HelixSnapshot.Record {
  /// The figure with the unit its axis implies — and nothing else, so it stays
  /// legible at 28pt.
  var display: String {
    switch axis {
    case "reps":    return "\(Int(value.rounded()))"
    case "seconds": return "\(Int(value.rounded()))s"
    case "volume":  return "\(Int(value.rounded())) kg"
    default:        return String(format: "%.1f kg", value)
    }
  }

  /// Which KIND of record this is, in two words. This is the half that was
  /// missing, and the half that stops a set volume reading as a load.
  var axisLabel: String {
    switch axis {
    case "weight":  return "heaviest load"
    case "e1rm":    return "est. 1RM"
    case "volume":  return "set volume"
    case "reps":    return "most reps"
    case "seconds": return "longest hold"
    default:        return axis
    }
  }

  /// The axis as a glyph. Four axes and four shapes, so a ROW says which kind of
  /// record it is without spending a word of its width on the label.
  var axisSymbol: String {
    switch axis {
    case "weight": return "scalemass.fill"
    case "reps":   return "repeat"
    case "volume": return "square.stack.3d.up.fill"
    case "e1rm":   return "chart.line.uptrend.xyaxis"
    default:       return "trophy.fill"
    }
  }
}

// MARK: - Records · Small

struct RecordFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var top: HelixSnapshot.Record? { s?.records?.first }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("LATEST PR", color: mono ? .white : Helix.gold)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }

      if let top {
        BigValue(value: top.display, size: 26, color: .white)
        Text(top.axisLabel)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(mono ? .white : Helix.gold)
        Text(top.exercise)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Spacer(minLength: 0)
        HStack(spacing: 4) {
          if let when = HelixSnapshot.relativeDay(top.achievedOn) {
            Text(when).font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
          }
          Spacer(minLength: 0)
          if let prs = s?.week.prs, prs > 0 {
            Text("\(prs) this week")
              .font(.system(size: 9)).foregroundStyle(Helix.muted)
          }
        }
      } else {
        // A week without a record is an ordinary week, not a failure.
        Text("no records in the book yet")
          .font(.system(size: 11)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
      }
    }
  }
}

// MARK: - Records · Medium
//
// The ask was "add a vs last week metric", and the payload already answers it:
// `week.prs` against `weekPrev.prs` ships in every scope. So the hero becomes
// the COUNT with its comparison, and the ledger beside it becomes the records
// themselves — which is what the face is called.

struct RecordLedgerFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.gold }
  private var records: [HelixSnapshot.Record] { s?.records ?? [] }

  private var prDelta: Double? {
    guard let now = s?.week.prs, let then = s?.weekPrev?.prs else { return nil }
    return Double(now - then)
  }

  var body: some View {
    HStack(spacing: 12) {
      Link(destination: HelixLink.exercises ?? HelixLink.home!) { heroColumn }
      Hairline(vertical: true)
      Link(destination: HelixLink.exercises ?? HelixLink.home!) { ledgerColumn }
    }
  }

  private var heroColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Caption("RECORDS", color: accent)
        if entry.isStale { StaleTag() }
      }
      Spacer(minLength: 0)
      BigValue(value: s.map { "\($0.week.prs)" }, size: 32,
               color: (s?.week.prs ?? 0) > 0 ? accent : .white)
      Text("this week").font(.system(size: 10)).foregroundStyle(Helix.muted)
      HStack(spacing: 4) {
        DeltaChip(delta: prDelta, decimals: 0, monochrome: mono)
        Text("vs last").font(.system(size: 9)).foregroundStyle(Helix.muted)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var ledgerColumn: some View {
    VStack(alignment: .leading, spacing: 5) {
      if records.isEmpty {
        Text("no records in the book yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      } else {
        ForEach(records.prefix(3)) { record in
          RecordRow(record: record, mono: mono, showDate: false)
        }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: - Records · Large
//
// Three registers of different kinds, which is what a Large owes over a Medium:
// the week in figures, the records themselves, and where the tonnage went.

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
        // Only a leaf that is itself optional can take `.map` mid-chain.
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
        // certainly not an empty gold row implying one was missed. Given real
        // height so the register keeps its share of the face instead of
        // collapsing and dumping its space on whatever sits below.
        Text("no new records in the book yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        VStack(spacing: 5) {
          ForEach(records) { record in
            Link(destination: HelixLink.exercises ?? HelixLink.home!) {
              RecordRow(record: record, mono: mono)
            }
          }
        }
        .frame(maxHeight: .infinity)
      }
    }
    .frame(maxHeight: .infinity)
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

// MARK: - Estimated 1RM
//
// A different question from records, and now a different face. `e1rmTrends`
// reports where each main lift's estimate stands TODAY and how far it has moved
// over the trailing window — a current position with a direction, where a record
// is a dated event. Drawing the ledger for both is what made the two focuses
// indistinguishable.

struct OneRepMaxFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var top: HelixSnapshot.E1rm? { s?.e1rm?.first }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 4) {
        Caption("EST 1RM", color: mono ? .white : Helix.sapphire)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }

      if let top {
        BigValue(value: String(format: "%.1f", top.kg), size: 28, color: .white)
        Text("kg").font(.system(size: 10)).foregroundStyle(Helix.muted)
        Text(top.exercise)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Spacer(minLength: 0)
        DeltaChip(delta: top.deltaKg, decimals: 1, suffix: " kg", monochrome: mono)
      } else {
        Text("log a few working sets and an\nestimate appears here")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
      }
    }
  }
}

/// Medium and Large · every tracked lift as a row, with its movement.
///
/// The bar is RELATIVE — each lift against the heaviest of them — because there
/// is no target 1RM in the payload to grade against, and a bar drawn against an
/// invented ceiling would be a verdict rather than a comparison.
struct OneRepMaxLedgerFace: View {
  let entry: HelixEntry
  let mono: Bool
  let large: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.sapphire }
  private var lifts: [HelixSnapshot.E1rm] { s?.e1rm ?? [] }

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 10 : 7) {
      HStack(spacing: 5) {
        Caption("ESTIMATED 1RM", color: accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
        Text("since 28 days").font(.system(size: 8)).foregroundStyle(Helix.muted)
      }

      if lifts.isEmpty {
        Text("log a few working sets and the main lifts appear here")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        let peak = lifts.map(\.kg).max() ?? 1
        VStack(spacing: large ? 9 : 6) {
          ForEach(lifts) { lift in
            LiftRow(lift: lift, peak: peak, color: accent, mono: mono, large: large)
          }
        }
        .frame(maxHeight: .infinity)
      }

      if large {
        Hairline()
        HStack(spacing: 0) {
          Stat(value: HelixSnapshot.tonnes(s?.week.volumeKg), label: "WEEK VOLUME", color: .white)
          Stat(value: s.map { "\($0.week.sets)" }, label: "SETS", color: .white)
          Stat(value: s.map { "\($0.week.prs)" }, label: "RECORDS",
               color: (s?.week.prs ?? 0) > 0 ? (mono ? .white : Helix.gold) : Helix.muted)
        }
      }
    }
  }
}

private struct LiftRow: View {
  let lift: HelixSnapshot.E1rm
  let peak: Double
  let color: Color
  let mono: Bool
  let large: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(lift.exercise)
          .font(.system(size: large ? 12 : 11, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(String(format: "%.1f", lift.kg))
          .font(.system(size: large ? 14 : 12, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(color)
        Text("kg").font(.system(size: 9)).foregroundStyle(Helix.muted)
        DeltaChip(delta: lift.deltaKg, decimals: 1, suffix: " kg", monochrome: mono)
      }
      Rail(progress: peak > 0 ? min(1, lift.kg / peak) : nil, color: color, height: 3)
    }
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
  var showDate = true

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: record.axisSymbol)
        .font(.system(size: 9))
        .foregroundStyle(mono ? .white : Helix.gold)
        .frame(width: 12)
      VStack(alignment: .leading, spacing: 0) {
        Text(record.exercise)
          .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
          .lineLimit(1)
        // The axis, named. Without it a 440 kg per-set VOLUME record and a 105 kg
        // heaviest LOAD are the same sentence.
        Text(record.axisLabel)
          .font(.system(size: 8)).foregroundStyle(Helix.muted)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      Text(record.display)
        .font(.system(size: 12, weight: .bold, design: .rounded)).monospacedDigit()
        .foregroundStyle(mono ? .white : Helix.gold)
      if showDate, let when = HelixSnapshot.relativeDay(record.achievedOn) {
        Text(when).font(.system(size: 9)).foregroundStyle(Helix.muted)
          .frame(width: 52, alignment: .trailing)
      }
    }
  }
}
