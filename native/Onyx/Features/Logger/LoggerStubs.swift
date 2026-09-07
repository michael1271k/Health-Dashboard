import Foundation
import Observation
import OnyxCore
import OnyxUI

/// A `LivePrProviding` for a PREVIEW — one axis, from the program's own seed.
///
/// ── THE DEVICE STOPPED USING IT IN E4 ───────────────────────────────────────
/// `LoggerModel` conforms now: `PrEngine.detectSessionPrs` against the
/// baselines `PrRecorder` writes the ledger from, four axes with the
/// supersession between them resolved. The screen reads that.
///
/// This survives for the Live Stats preview, which has no store and therefore
/// no baselines, so the real engine would correctly answer "no records" and
/// draw an empty card that photographs nothing. One axis off `wk1Kg` is a
/// plausible card for a shot and an honest lie in a `#Preview`. It must never
/// be handed to the screen again.
@MainActor
@Observable
final class SeedPrProvider: LivePrProviding {
    private let model: LoggerModel

    init(model: LoggerModel) { self.model = model }

    var livePrs: [LivePrRecord] {
        var out: [LivePrRecord] = []
        for exercise in model.exercises {
            guard let seed = exercise.plan.wk1Kg, seed > 0 else { continue }
            for (index, row) in exercise.rows.enumerated() {
                guard row.isDone, row.isRecord, let kg = row.weightKg, kg > seed else { continue }
                out.append(LivePrRecord(
                    id: "\(exercise.id)|\(index)|weight",
                    exercise: exercise.name,
                    setLabel: "Set \(index + 1)",
                    axis: .weight,
                    mark: AxisRecord(value: kg, previous: seed)
                ))
            }
        }
        // Newest first. The deck is in session order and a `SetRow` carries no
        // instant of its own, so document order reversed is the only ordering
        // available — and it is the right one until E4 puts a clock on a set.
        return out.reversed()
    }
}
