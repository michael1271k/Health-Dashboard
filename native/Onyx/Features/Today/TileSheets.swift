import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

// ── THREE TILES THAT WERE OPENING THE WRONG THING ────────────────────────────
//
// `DomainSheet`'s rule is that the Large FACE is the sheet, plus what the face
// cannot hold, and for most domains that is right: the tile asks one question
// and its large body answers it in full.
//
// Three tiles were not like that, each for its own reason:
//
//   · **Steps** — the large face is a hero count over a sparkline. The sheet
//     drew it at 354 pt, which is a bar chart of seven numbers with an inch of
//     air around it. The question a step goal actually raises is "how far along
//     am I", and that is a JOURNEY, not a series.
//   · **Muscle focus** — the face ranks families against the week's own busiest
//     family, because that is what fits in 56 pt beside three bars. It cannot
//     say whether the week is DONE, because a bar with no target behind it has
//     no opinion about that. The sheet has the room to carry both.
//   · **Records** — the face shows the most recent handful. A tile called
//     Records opening onto a shortlist of records is the one case where the
//     large face is a strictly smaller answer than the sheet should give.
//
// All three read the payload the tile already reads; only Muscle Focus needed a
// new slice (`TodayFeed.muscleFocus`), and it needed one because targets are not
// in the widget payload at all.

// MARK: - Steps · the journey

/// Steps as GROUND COVERED, not a counter.
///
/// The native reading of the web app's `StepsJourney`: a rail from zero to the
/// day's goal with milestone pips at a quarter, a half and three quarters, a
/// marker sitting at today's position, and a flag at the end. What the old sheet
/// drew — a bar chart — answers "how do the last seven days compare", which is
/// a real question and is at the BOTTOM of this sheet where it belongs. It is
/// not the question a goal asks.
///
/// Distance is the real HealthKit walking+running figure or it is absent. It is
/// never estimated from a stride guess: a fabricated number sitting in a row of
/// measured ones is read as measured.
struct StepsSheetBody: View {
    let snapshot: OnyxSnapshot?

    private var steps: OnyxSnapshot.Steps? { snapshot?.steps }
    /// 10 000 is the fallback the web uses, and it is a real default rather than
    /// an invention — it is what the goal is set to when nobody has set one.
    private var target: Int { max(1, steps?.goal ?? 10_000) }
    private var pct: Double {
        guard let count = steps?.count else { return 0 }
        return min(1, Double(count) / Double(target))
    }
    private var done: Bool { pct >= 1 }
    private var color: Color {
        done ? Color.onyx.good : pct >= 0.5 ? Color.onyx.textPrimary : OnyxDomain.fuel.accent
    }
    private var km: Double? { steps?.distanceM.map { ($0 / 100).rounded() / 10 } }

    /// The trailing daily counts, oldest first, with the empty days dropped.
    private var days: [Double] { (steps?.trend ?? []).map(\.v).filter { $0 > 0 } }

    /// Today against the trailing mean of the days BEFORE it.
    ///
    /// The mean excludes today: comparing a value against an average it is part
    /// of drags the baseline toward the number being judged, so a huge day
    /// under-reports and a dead day over-reports. Three prior days minimum —
    /// two is a coin toss with a decimal point.
    private var vsAverage: Int? {
        guard let count = steps?.count else { return nil }
        let prior = days.dropLast()
        guard prior.count >= 3 else { return nil }
        let mean = prior.reduce(0, +) / Double(prior.count)
        guard mean > 0 else { return nil }
        return Int(((Double(count) - mean) / mean * 100).rounded())
    }

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.l) {
                hero
                journey
                supporting
                if days.count >= 3 { trailing }
            }
            .padding(OnyxSpace.l)
        }
    }

    private var hero: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
            Text(steps?.count.map { $0.formatted(.number) } ?? "—")
                .onyxHero().onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("steps").onyxMicro()
            Spacer(minLength: OnyxSpace.s)
            if let km {
                Text("\(km, specifier: "%.1f") km")
                    .onyxType(.body).fontWeight(.bold).onyxNumeral()
                    .foregroundStyle(color)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement(children: .combine)
    }

    /// The rail, its pips and the marker.
    ///
    /// ── WHY THE MARKER IS INSET AND THE TRACK IS NOT ────────────────────────
    /// The marker is a 22 pt disc centred on its position, so at 0 % and at
    /// 100 % half of it hangs outside the track. Insetting the geometry by the
    /// marker's radius and drawing the track across the inset width keeps the
    /// disc, the flag and the last pip inside the card at every value — the
    /// alternative is a marker clipped by the glass at exactly the two moments
    /// the reader most wants to see it.
    private var journey: some View {
        let radius: CGFloat = 11
        return VStack(alignment: .leading, spacing: OnyxSpace.s) {
            GeometryReader { geo in
                let width = max(0, geo.size.width - radius * 2)
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.onyx.hairline).frame(height: 4)
                    Capsule()
                        .fill(LinearGradient(colors: [OnyxDomain.fuel.accent, color],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: width * pct, height: 4)
                    ForEach([0.25, 0.5, 0.75], id: \.self) { pip in
                        Rectangle()
                            .fill(pct >= pip ? color : Color.onyx.textTertiary.opacity(0.5))
                            .frame(width: 7, height: 7)
                            .rotationEffect(.degrees(45))
                            .offset(x: width * pip - 3.5)
                    }
                    Image(systemName: "flag.fill")
                        .onyxType(.caption)
                        .foregroundStyle(done ? Color.onyx.good : Color.onyx.textTertiary)
                        .offset(x: width - 4)
                    Circle()
                        .fill(color)
                        .frame(width: radius * 2, height: radius * 2)
                        .overlay {
                            Image(systemName: "figure.walk")
                                .onyxType(.caption).fontWeight(.bold)
                                .foregroundStyle(Color.onyx.base)
                        }
                        .offset(x: width * pct)
                }
                .frame(height: geo.size.height, alignment: .center)
                .padding(.leading, radius)
            }
            .frame(height: 28)
            .accessibilityElement()
            .accessibilityLabel("\(Int(pct * 100)) percent of the step goal")

            HStack(spacing: 0) {
                ForEach(Array([0.0, 0.25, 0.5, 0.75, 1.0].enumerated()), id: \.offset) { index, mark in
                    Text(mark == 0 ? "0" : "\(Int((Double(target) * mark / 1000).rounded()))k")
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(mark == 1 && done ? Color.onyx.good : Color.onyx.textTertiary)
                        .frame(maxWidth: .infinity,
                               alignment: index == 0 ? .leading : index == 4 ? .trailing : .center)
                }
            }
        }
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
    }

    /// The readings this sheet is actually about, each against its own target
    /// where one exists. Water is deliberately absent: it is not activity, and
    /// Fuel owns it — two surfaces reporting hydration is two that can disagree.
    private var supporting: some View {
        HStack(alignment: .top, spacing: OnyxSpace.grid) {
            cell("Distance", km.map { String(format: "%.1f", $0) }, "km", Color.onyx.textPrimary)
            cell("Active", steps?.activeKcal.map { "\(Int($0.rounded()))" }, "kcal", OnyxDomain.fuel.accent)
            cell("Training", snapshot?.today?.durationMin.map { "\($0)" }, "min", OnyxDomain.train.accent)
            // The only target here that is MEASURED rather than invented. A
            // fixed "active kcal goal" would be a number nobody set, graded
            // green or red as though they had.
            cell("vs avg", vsAverage.map { "\($0 > 0 ? "+" : "")\($0)" }, "%",
                 vsAverage == nil ? Color.onyx.textTertiary
                     : (vsAverage ?? 0) >= 0 ? Color.onyx.good : Color.onyx.danger)
        }
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
    }

    private func cell(_ label: String, _ value: String?, _ unit: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).onyxMicro()
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value ?? "—")
                    .onyxType(.body).fontWeight(.bold).onyxNumeral()
                    .foregroundStyle(value == nil ? Color.onyx.textTertiary : tint)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if value != nil {
                    Text(unit).onyxType(.caption).foregroundStyle(Color.onyx.textTertiary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var trailing: some View {
        let peak = max(days.max() ?? 1, 1)
        return VStack(alignment: .leading, spacing: OnyxSpace.s) {
            Text("LAST \(days.count) DAYS").onyxMicro()
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(days.enumerated()), id: \.offset) { index, value in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(index == days.count - 1 ? color
                              : value >= Double(target) ? Color.onyx.good.opacity(0.55)
                              : OnyxDomain.fuel.accent.opacity(0.30))
                        .frame(height: max(4, 56 * value / peak))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 56)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement()
        .accessibilityLabel("Last \(days.count) days of steps")
    }
}

// MARK: - Muscle focus · the week on the body

/// What the week asked for, what landed, and what is left — on the figure.
///
/// ── WHY THE FIGURE IS THE WHOLE TOP OF THE SHEET ─────────────────────────────
/// The tile draws it at 56 pt as a KEY to the bars beside it (§W12), which is
/// right for a tile: at that size the body says "roughly here" and the numbers
/// say the rest. A sheet has 300 pt, and at 300 pt the body IS the reading —
/// sixteen landmarks lit against their own targets is a picture of the week that
/// no ranked list can give, because a list cannot show you that everything you
/// trained was on the front.
struct MuscleFocusSheetBody: View {
    let focus: MuscleFocusSummary

    /// Ranked by what is LEFT, not by what was done.
    ///
    /// The sheet's question is "what is still owed this week", so the muscle
    /// with six sets outstanding belongs at the top even though the one with
    /// twelve done is the bigger number. Ties break on the landmark's own order
    /// so the list cannot reshuffle between two redraws.
    private var ranked: [MuscleFocusRow] {
        focus.rows.enumerated().sorted { a, b in
            if a.element.remaining != b.element.remaining { return a.element.remaining > b.element.remaining }
            if a.element.sets != b.element.sets { return a.element.sets > b.element.sets }
            return a.offset < b.offset
        }.map(\.element)
    }

    /// Muscles the plan does not ask for AND the week did not touch. Drawn last
    /// and quietly: Adductors sits at a target of 0 on a cut, and ranking it
    /// beside a muscle that is genuinely behind would be a false alarm.
    private var untargeted: [MuscleFocusRow] { ranked.filter { $0.target == 0 && $0.sets == 0 } }
    private var active: [MuscleFocusRow] { ranked.filter { $0.target > 0 || $0.sets > 0 } }

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.l) {
                counts
                AtlasFigure(side: .both, worked: focus.worked)
                    .frame(maxHeight: 300)
                if active.isEmpty {
                    ContentUnavailableView(
                        "Nothing logged this week",
                        systemImage: "figure.strengthtraining.traditional",
                        description: Text("Log a set and the body fills in.")
                    )
                } else {
                    legend
                }
                Text("Direct work counts 1.0, assistance 0.5. Targets are this phase's, or your own override where you set one.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(OnyxSpace.l)
        }
    }

    /// Done, planned, left. Three figures and not two, because "12 of 40" makes
    /// the reader do the subtraction that the week is actually about.
    private var counts: some View {
        HStack(spacing: OnyxSpace.grid) {
            countTile(OnyxFormat.sets(focus.doneSets), "Sets done", Color.onyx.accent(.train))
            countTile("\(focus.targetSets)", "Planned", Color.onyx.textPrimary)
            countTile(OnyxFormat.sets(focus.remainingSets), "Left",
                      focus.remainingSets > 0 ? Color.onyx.textPrimary : Color.onyx.good)
        }
    }

    private func countTile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Text(value).onyxHero().onyxNumeral().foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label).onyxMicro()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement(children: .combine)
    }

    private var legend: some View {
        VStack(spacing: 0) {
            ForEach(active) { row in
                muscleRow(row)
                if row.id != active.last?.id || !untargeted.isEmpty {
                    Divider().overlay(Color.onyx.hairline)
                }
            }
            ForEach(untargeted) { row in
                muscleRow(row)
                if row.id != untargeted.last?.id { Divider().overlay(Color.onyx.hairline) }
            }
        }
        .padding(.horizontal, OnyxSpace.m)
        .onyxGlass(.tile)
    }

    private func muscleRow(_ row: MuscleFocusRow) -> some View {
        let tint = Color.onyx.muscle(row.muscle)
        let met = row.target > 0 && row.sets >= Double(row.target)
        return VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            HStack(spacing: OnyxSpace.grid) {
                Circle().fill(tint).frame(width: 8, height: 8)
                Text(row.muscle.displayName)
                    .onyxType(.body)
                    .foregroundStyle(row.target == 0 && row.sets == 0 ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: OnyxSpace.s)
                // "8 / 10", or just the count when the plan asks for nothing —
                // "8 / 0" reads as a failure and is the opposite of one.
                Text(row.target > 0 ? "\(OnyxFormat.sets(row.sets)) / \(row.target)" : OnyxFormat.sets(row.sets))
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(met ? Color.onyx.good : Color.onyx.textPrimary)
                if met {
                    Image(systemName: "checkmark")
                        .onyxType(.caption).foregroundStyle(Color.onyx.good)
                        .frame(width: 14)
                } else if row.remaining > 0 {
                    Text("\(OnyxFormat.sets(row.remaining)) left")
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(Color.onyx.textSecondary)
                        .frame(width: 52, alignment: .trailing)
                } else {
                    Color.clear.frame(width: 14, height: 1)
                }
            }
            // Decorative — every number in it is already spoken by the row above.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.onyx.hairline)
                    Capsule().fill(met ? Color.onyx.good : tint)
                        .frame(width: geo.size.width * progress(row))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
        .padding(.vertical, OnyxSpace.s)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label(row))
    }

    /// A muscle with no target grades against the plan's biggest target, so the
    /// bar still says something rather than sitting empty or full at random.
    private func progress(_ row: MuscleFocusRow) -> Double {
        let against = row.target > 0
            ? Double(row.target)
            : Double(focus.rows.map(\.target).max() ?? 0)
        guard against > 0 else { return 0 }
        return min(1, row.sets / against)
    }

    private func label(_ row: MuscleFocusRow) -> String {
        guard row.target > 0 else {
            return "\(row.muscle.displayName), \(OnyxFormat.sets(row.sets)) sets, no target this phase"
        }
        if row.sets >= Double(row.target) {
            return "\(row.muscle.displayName), \(OnyxFormat.sets(row.sets)) of \(row.target) sets, met"
        }
        return "\(row.muscle.displayName), \(OnyxFormat.sets(row.sets)) of \(row.target) sets, \(OnyxFormat.sets(row.remaining)) left"
    }
}

// MARK: - Records · the whole book

/// Every record the app holds, grouped by the KIND of record it is.
///
/// ── WHY GROUPED BY AXIS AND NOT SORTED BY DATE ───────────────────────────────
/// A flat list newest-first is the widget's answer and it is the right one for a
/// face showing five rows: what is interesting there is what just happened. A
/// page holding the whole book is read differently — you arrive at it wanting
/// "what is my heaviest bench", and an axis is the question you are asking.
/// Sorting inside each group is still newest-first, so the recent ones surface.
struct RecordsSheetBody: View {
    let snapshot: OnyxSnapshot?

    private var records: [OnyxSnapshot.Record] { snapshot?.records ?? [] }

    /// The four axes in a fixed order, so the page does not reorder itself as
    /// records land. An axis with no records is omitted — an empty "Longest
    /// hold" section is a heading about nothing.
    private static let axes = ["weight", "e1rm", "volume", "reps", "seconds"]

    private func group(_ axis: String) -> [OnyxSnapshot.Record] {
        records.filter { $0.axis == axis }.sorted { $0.achievedOn > $1.achievedOn }
    }

    /// Anything whose axis is not one of the five known ones, so a new axis
    /// added server-side appears rather than silently vanishing off this page.
    private var others: [OnyxSnapshot.Record] {
        records.filter { !Self.axes.contains($0.axis) }.sorted { $0.achievedOn > $1.achievedOn }
    }

    var body: some View {
        Group {
            if records.isEmpty {
                ContentUnavailableView(
                    "No records yet",
                    systemImage: "trophy",
                    description: Text("Finish a session and the first ones land here.")
                )
            } else {
                List {
                    Section {
                        HStack(spacing: OnyxSpace.grid) {
                            countTile("\(records.count)", "In the book")
                            countTile("\(snapshot?.week.prs ?? 0)", "This week")
                        }
                        .listRowInsets(EdgeInsets(top: OnyxSpace.s, leading: OnyxSpace.l,
                                                  bottom: OnyxSpace.s, trailing: OnyxSpace.l))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    ForEach(Self.axes, id: \.self) { axis in
                        let rows = group(axis)
                        if !rows.isEmpty {
                            Section(rows[0].axisLabel.capitalized) {
                                ForEach(rows) { RecordDetailRow(record: $0) }
                            }
                        }
                    }
                    if !others.isEmpty {
                        Section("Other") { ForEach(others) { RecordDetailRow(record: $0) } }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                // The default section gap is written for a settings screen with
                // headers; here it put an inch of glass between the two counts
                // and the first record. Compact keeps the sections readable as
                // sections without spending the top third of the page on air.
                .listSectionSpacing(.compact)
            }
        }
    }

    private func countTile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Text(value).onyxHero().onyxNumeral().foregroundStyle(Color.onyx.record)
            Text(label).onyxMicro()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement(children: .combine)
    }
}

/// One record: the lift, the value with the unit its axis implies, and when.
///
/// The 44 pt row of §3.1. `display` and `axisSymbol` are the widget face's own —
/// a record must read identically on the Home Screen and on this page, and two
/// formatters is how "440 kg" becomes "440.0 kg" on one of them.
private struct RecordDetailRow: View {
    let record: OnyxSnapshot.Record

    var body: some View {
        HStack(spacing: OnyxSpace.m) {
            Image(systemName: record.axisSymbol)
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.record)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(record.exercise)
                    .onyxType(.body).foregroundStyle(Color.onyx.textPrimary)
                    .lineLimit(1)
                Text(OnyxSnapshot.relativeDay(record.achievedOn) ?? record.achievedOn)
                    .onyxType(.caption).foregroundStyle(Color.onyx.textTertiary)
            }
            Spacer(minLength: OnyxSpace.s)
            // Reps are part of the reading on a load record: 100 kg for five is
            // a different record from 100 kg for one, and the value alone
            // cannot say which.
            if let reps = record.reps, record.axis == "weight" || record.axis == "e1rm" {
                Text("×\(reps)")
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
            }
            Text(record.display)
                .onyxType(.body).fontWeight(.bold).onyxNumeral()
                .foregroundStyle(Color.onyx.record)
                .lineLimit(1)
        }
        .frame(minHeight: 44)
        .listRowInsets(EdgeInsets(top: OnyxSpace.s, leading: OnyxSpace.l,
                                  bottom: OnyxSpace.s, trailing: OnyxSpace.l))
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(Color.onyx.hairline)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(record.exercise), \(record.axisLabel), \(record.display)")
    }
}
