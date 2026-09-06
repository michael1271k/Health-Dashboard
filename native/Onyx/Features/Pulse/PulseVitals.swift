import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// Eight readings, each once: five overnight and three from the ring.
///
/// ── WHY THIS STOPPED BEING EIGHT ROWS ───────────────────────────────────────
/// Wave 2.9 made these eight 44 pt `MetricRow`s, which was right about the
/// SHAPE — they are eight readings of one kind and a bordered box each was the
/// web app's answer — and wrong about the cost. Eight rows is 352 pt of a
/// screen that also carries a night, a body and four controls, and the vitals
/// are the part of it a reader SCANS rather than reads: the question is "is
/// anything off tonight", and the answer is the shape of eight deltas at once,
/// not eight sentences one under the other.
///
/// Three columns of 64 pt says the same eight facts in 192 pt. Each cell keeps
/// everything the row carried — the value, its unit, the delta against your own
/// fortnight, and the week behind it — because the compaction is of WHITESPACE,
/// not of content (§W11: Pulse fits in a screen and a half).
///
/// ── AND WHY IT BECOMES ROWS AGAIN AT AX5 ────────────────────────────────────
/// A third of a phone is 120 pt wide. "Respiratory" is one word that does not
/// fit in it at the largest accessibility size, and "14.2 br/min" beside it is
/// two more. The grid is a compaction that only exists while the type is small
/// enough for it to be one; past that the eight go back to being rows, which is
/// the escape `WeekVitalsRow` and `MetricRow` already take.
///
/// ── THE DELTA IS AGAINST A FORTNIGHT, NOT AGAINST YESTERDAY ─────────────────
/// `WidgetDerive.vitalBlock` reads the trailing fortnight EXCLUDING the date
/// itself. One night against one other night is noise; one night against your
/// own fortnight is the only version of "your HRV is down" worth printing.
struct VitalsGrid: View {
    let model: DayModel

    @Environment(\.dynamicTypeSize) private var typeSize

    private var window: DayModel.Window { model.window }

    /// One reading, in the form both layouts need. Built once so the grid and
    /// the row list cannot disagree about what a cell says.
    fileprivate struct Reading: Identifiable {
        let id: String
        let value: String?
        let unit: String
        let delta: Double?
        let decimals: Int
        let upIsGood: Bool
        let trend: [Double]
        let color: Color
    }

    private var readings: [Reading] {
        var out: [Reading] = VitalSpec.all.map { spec in
            let vital = spec.read(window.vitals)
            return Reading(
                id: spec.name,
                value: OnyxSnapshot.fixed(vital?.value, decimals: spec.decimals),
                unit: spec.unit,
                delta: vital?.delta,
                decimals: spec.decimals,
                upIsGood: spec.upIsGood,
                trend: vital?.trend?.map(\.v) ?? [],
                color: spec.color
            )
        }
        out.append(activity("Steps", window.steps, unit: "steps", grouped: true, color: OnyxDomain.body.accent))
        out.append(activity("Stand", window.standHours, unit: "h", grouped: false, color: OnyxDomain.body.at(0.5)))
        out.append(activity("Active", window.activeKcal, unit: "kcal", grouped: true, color: OnyxDomain.fuel.accent))
        return out
    }

    /// The three the ring reports. Same fortnight rule as the five above.
    ///
    /// Named "Stand" and "Active" rather than "Stand hours" and "Active
    /// energy": the unit sits in the cell beside the figure, and a two-word
    /// name in a 120 pt column wraps to a second line the cell has no room for.
    private func activity(
        _ name: String, _ block: VitalBlock?, unit: String, grouped: Bool, color: Color
    ) -> Reading {
        Reading(
            id: name,
            // Grouped where the figure runs to four digits: "8430 steps" is a
            // number you have to count the digits of, and this cell exists to
            // be read at a glance.
            value: block?.value.map { grouped ? NutritionFormat.whole($0) : OnyxSnapshot.fixed($0, decimals: 0) ?? "—" },
            unit: unit,
            delta: block.flatMap { b in zip2(b.value, b.baseline).map { $0 - $1 } },
            decimals: 0,
            upIsGood: true,
            trend: block?.trend.map(\.v) ?? [],
            color: color
        )
    }

    var body: some View {
        if typeSize.isAccessibilitySize {
            ForEach(readings) { r in
                MetricRow(
                    name: r.id, value: r.value, unit: r.unit, delta: r.delta,
                    decimals: r.decimals, upIsGood: r.upIsGood, trend: r.trend, color: r.color
                )
            }
        } else {
            grid
                .listRowInsets(EdgeInsets(top: 0, leading: OnyxSpace.l, bottom: 0, trailing: OnyxSpace.l))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
    }

    private var grid: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: OnyxSpace.s), count: 3),
            spacing: OnyxSpace.s
        ) {
            ForEach(readings) { VitalCell(reading: $0) }
        }
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Vitals")
    }
}

/// One cell of the grid: a name, the reading, its deviation and the week
/// behind it, in 64 pt.
///
/// Not shared with anything: the shape is only correct at a third of a screen
/// width, and the same view in a full-width context is a 64 pt box holding one
/// number.
private struct VitalCell: View {
    let reading: VitalsGrid.Reading

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(reading.id)
                .onyxMicro()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                // A number never wraps and never shrinks past 70 %: an "8,430"
                // scaled to nothing is a figure shown as a smudge.
                Text(reading.value ?? "—")
                    .onyxType(.secondary).fontWeight(.semibold).onyxNumeral()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(Color.onyx.textPrimary)
                if !reading.unit.isEmpty {
                    Text(reading.unit)
                        .onyxType(.micro)
                        .lineLimit(1)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
                Spacer(minLength: 0)
            }
            delta
            // 24 pt of trace, and the reason a cell is 64 pt rather than 40:
            // the delta says which way tonight went and the line says whether
            // that is a move or a wobble.
            Sparkline(points: reading.trend, color: reading.color)
                .frame(height: 24)
                .opacity(reading.trend.count > 1 ? 1 : 0)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reading.id), \(reading.value ?? "no reading") \(reading.unit)\(deltaSpoken)")
    }

    /// A reading with no baseline behind it has no delta — "0.0" would be a
    /// claim that it did not move, which is not the same as never having moved.
    /// The line is still occupied, so the cells beside it stay aligned.
    @ViewBuilder
    private var delta: some View {
        if let d = reading.delta, let text = OnyxSnapshot.signed(d, decimals: reading.decimals) {
            let moved = abs(d) > 0.0001
            let good = reading.upIsGood ? d > 0 : d < 0
            Text(text)
                .onyxType(.micro).fontWeight(.semibold).onyxNumeral()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(!moved ? Color.onyx.textSecondary : good ? Color.onyx.good : Color.onyx.danger)
        } else {
            Text(" ").onyxType(.micro).accessibilityHidden(true)
        }
    }

    private var deltaSpoken: String {
        guard let d = reading.delta, let text = OnyxSnapshot.signed(d, decimals: reading.decimals) else { return "" }
        return ", \(text) from baseline"
    }
}

/// Both or neither — the delta of a reading with no baseline behind it is not
/// zero, it is unknown, and a "0" chip claims the night did not move.
private func zip2<A, B>(_ a: A?, _ b: B?) -> (A, B)? {
    guard let a, let b else { return nil }
    return (a, b)
}
