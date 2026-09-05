import Foundation
import OnyxCore

/// Constructors for three `OnyxCore` report types that have no public
/// initialiser (`DetailSet`, `DetailExercise`, `CueProgression`).
///
/// ── WHY THIS GOES THROUGH JSON ──────────────────────────────────────────────
/// The Session Report structs were ported for the golden tests, which live in
/// the same module and use the memberwise initialiser; nothing outside the
/// package had built one until now. They are `Codable` because the vectors
/// are JSON, so a dictionary of the same field names round-trips into a value
/// without touching the domain. The right fix is a `public init` on each in
/// `Sessions/Detail.swift`; this file is what exists until Track D adds it,
/// and it is the only place in the app that should ever do this.
enum CoreBridge {
    private static func make<T: Decodable>(_ fields: [String: Any?]) -> T {
        let data = try! JSONSerialization.data(withJSONObject: fields.compactMapValues { $0 })
        return try! JSONDecoder().decode(T.self, from: data)
    }

    static func detailSet(
        setNumber: Double, weightKg: Double, reps: Double, rpe: Double?,
        est1rmKg: Double?, setType: String, side: String?, pairId: String?
    ) -> DetailSet {
        make([
            "setNumber": setNumber, "weightKg": weightKg, "reps": reps, "rpe": rpe, "isPr": false,
            "est1rmKg": est1rmKg, "setType": setType, "side": side, "pairId": pairId,
        ])
    }

    static func detailExercise(
        exerciseId: String, name: String, order: Double, sets: [DetailSet],
        workingSets: Double, topKg: Double, volumeKg: Double, bestEst1rm: Double?, prAxes: [String]?
    ) -> DetailExercise {
        let encoded = try! JSONSerialization.jsonObject(with: try! JSONEncoder().encode(sets))
        return make([
            "exerciseId": exerciseId, "name": name, "order": order, "muscleGroups": [String](),
            "isCompound": false, "sets": encoded, "workingSets": workingSets, "topKg": topKg,
            "volumeKg": volumeKg, "bestEst1rm": bestEst1rm, "prAxes": prAxes,
        ])
    }

    static func cueProgression(state: String, ceiling: Double?, suggestKg: Double?) -> CueProgression {
        make(["state": state, "ceiling": ceiling, "suggestKg": suggestKg])
    }
}
