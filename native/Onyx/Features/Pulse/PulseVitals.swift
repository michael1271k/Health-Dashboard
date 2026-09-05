import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// Eight readings, each once: five overnight and three from the ring.
///
/// ── WHY THIS IS A `List` SECTION AND NOT EIGHT TILES ────────────────────────
/// These are eight readings OF THE SAME KIND — a value, a unit, how far it sits
/// from your own normal, and the week behind it. Eight bordered boxes is the
/// web app's way of saying "rows", and §3.6 forbids it. `MetricRow` is the row
/// the Today sheets already use for exactly this, so the vitals on Pulse and
/// the vitals on the Home Screen cannot render as two different things.
///
/// ── AND WHY THE DELTA IS AGAINST A FORTNIGHT, NOT AGAINST YESTERDAY ─────────
/// `WidgetDerive.vitalBlock` reads the trailing fortnight EXCLUDING the date
/// itself. One night against one other night is noise; one night against your
/// own fortnight is the only version of "your HRV is down" worth printing.
struct VitalRows: View {
    let model: DayModel

    private var window: DayModel.Window { model.window }

    var body: some View {
        ForEach(VitalSpec.all, id: \.name) { spec in
            let vital = spec.read(window.vitals)
            MetricRow(
                name: spec.name,
                value: OnyxSnapshot.fixed(vital?.value, decimals: spec.decimals),
                unit: spec.unit,
                delta: vital?.delta,
                decimals: spec.decimals,
                upIsGood: spec.upIsGood,
                trend: vital?.trend?.map(\.v) ?? [],
                color: spec.color
            )
        }
        activity("Steps", window.steps, unit: "steps", grouped: true, upIsGood: true, color: OnyxDomain.body.accent)
        activity("Stand hours", window.standHours, unit: "h", upIsGood: true, color: OnyxDomain.body.at(0.5))
        activity("Active energy", window.activeKcal, unit: "kcal", grouped: true, upIsGood: true, color: OnyxDomain.fuel.accent)
    }

    /// The three the ring reports. Same row, same fortnight rule — a step count
    /// on its own says nothing, and "2,000 under your normal" says the thing
    /// you would have had to work out yourself.
    private func activity(
        _ name: String, _ block: VitalBlock?, unit: String,
        grouped: Bool = false, upIsGood: Bool, color: Color
    ) -> some View {
        // Grouped where the figure runs to four digits: "8430 steps" is a
        // number you have to count the digits of, and this row exists to be
        // read at a glance.
        MetricRow(
            name: name,
            value: block?.value.map { grouped ? NutritionFormat.whole($0) : OnyxSnapshot.fixed($0, decimals: 0) ?? "—" },
            unit: unit,
            delta: block.flatMap { b in zip2(b.value, b.baseline).map { $0 - $1 } },
            decimals: 0,
            upIsGood: upIsGood,
            trend: block?.trend.map(\.v) ?? [],
            color: color
        )
    }
}

/// Both or neither — the delta of a reading with no baseline behind it is not
/// zero, it is unknown, and a "0" chip claims the night did not move.
private func zip2<A, B>(_ a: A?, _ b: B?) -> (A, B)? {
    guard let a, let b else { return nil }
    return (a, b)
}
