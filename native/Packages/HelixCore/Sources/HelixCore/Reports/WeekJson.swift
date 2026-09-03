import Foundation

/// THE MACHINE-READABLE HALF OF THE EXPORT — a port of `src/lib/reports/weekJson.ts`.
///
/// The week emitted for machines: the same `WeeklyExportInput` the markdown was
/// rendered from, serialised with its own field names, nothing rounded or
/// unit-converted, and the derived block riding along under its own key. The
/// golden vector compares this STRUCTURALLY against the TypeScript payload;
/// JSON key order and whitespace are the serialiser's business.
public enum WeekJson {
    public static let schema = "helix.week/1"

    /// The payload as a JSON object (Foundation values), ready for `JSONSerialization`.
    public static func payload(_ input: WeeklyExportInput) throws -> [String: Any] {
        func json<T: Encodable>(_ v: T) throws -> Any {
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(v), options: [.fragmentsAllowed])
        }
        return [
            "schema": schema,
            "week": [
                "start": input.weekStart, "end": input.weekEnd,
                "label": input.weekLabel as Any? ?? NSNull(), "program": input.programLabel,
                "phase": input.phaseLabel as Any? ?? NSNull(),
            ] as [String: Any],
            "targets": [
                "calorieGoal": input.calorieGoal as Any? ?? NSNull(), "proteinGoalG": input.proteinGoalG as Any? ?? NSNull(),
                "stepsGoal": input.stepsGoal as Any? ?? NSNull(), "sleepGoalHours": input.sleepGoalHours as Any? ?? NSNull(),
                "waterGoalMl": input.waterGoalMl as Any? ?? NSNull(), "periods": try json(input.targetPeriods ?? []),
            ] as [String: Any],
            "days": try json(input.days),
            "sessions": try json(input.sessions),
            "cardio": try json(input.cardio ?? []),
            "bodyComp": try json(input.bodyComp ?? []),
            "doms": try json(input.doms),
            "fatigue": try json(input.fatigue ?? []),
            "volumeByMuscle": try json(input.volumeByMuscle),
            "tonnageByMuscle": try json(input.tonnageByMuscle ?? []),
            "supplementProtocol": try json(input.supplementProtocol ?? []),
            "ledger": try json(input.ledger ?? []),
            "derived": try json(Derived.week(input)),
        ]
    }

    /// The fenced block, as the web emits it — two-space indent, keys sorted
    /// (Foundation offers no insertion order; a consumer parses this).
    public static func block(_ input: WeeklyExportInput) throws -> [String] {
        let data = try JSONSerialization.data(withJSONObject: payload(input), options: [.prettyPrinted, .sortedKeys])
        return ["```json", String(decoding: data, as: UTF8.self), "```"]
    }
}
