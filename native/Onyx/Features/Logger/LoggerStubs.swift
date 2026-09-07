import Foundation
import OnyxCore
import OnyxUI

/// Records claimed so far, until `LivePrEngine` is lit.
///
/// ── WHAT IT CAN HONESTLY ANSWER TODAY ───────────────────────────────────────
/// `LoggerModel.SetRow.isRecord` already carries a record signal, and its own
/// header says what that signal IS: a set that beat the program's `wk1Kg` seed,
/// not the ledger. `LoggerModel.beatsTheSeed` returns false today (finding F5),
/// so in practice this list is empty on the device and the card draws its empty
/// state — which is the truth, and better than a card that invents a trophy.
///
/// One axis, `weight`, because the seed is one number. E4 item 3 replaces this
/// with `LivePrEngine.compute(draft:baselines:)`, which resolves four axes and
/// the supersession between them; at that point `LoggerModel` conforms to
/// `LivePrProviding` and this type is deleted.
@MainActor
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
