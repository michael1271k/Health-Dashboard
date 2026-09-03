import Foundation

/// The supplement SEED protocol — a port of `src/lib/supplements.ts`. The stack
/// lives in `custom_supplements`; this is what an empty table falls back to.
/// Slot accent colours are NOT ported (HelixUI tokens).
public struct Supplement: Codable, Sendable, Equatable {
    public var key: String
    public var name: String
    public var dose: String
    public var trainingOnly: Bool?
    public var notes: String?
    public var customId: String?

    public init(key: String, name: String, dose: String, trainingOnly: Bool? = nil, notes: String? = nil, customId: String? = nil) {
        self.key = key; self.name = name; self.dose = dose; self.trainingOnly = trainingOnly; self.notes = notes; self.customId = customId
    }
}

public struct SupplementSlot: Codable, Sendable, Equatable {
    public var key: String
    public var time: String
    public var label: String
    public var items: [Supplement]
    public init(key: String, time: String, label: String, items: [Supplement]) { self.key = key; self.time = time; self.label = label; self.items = items }
}

public enum Supplements {
    public static let seed: [SupplementSlot] = [
        SupplementSlot(key: "morning", time: "10:30", label: "Morning", items: [
            Supplement(key: "multivitamin", name: "Two Per Day Multivitamin", dose: "1 tab", notes: "2 tabs on Monday & Friday (Leg Days)"),
            Supplement(key: "d3k2", name: "Vitamin D3 + K2", dose: "125 mcg"),
        ]),
        SupplementSlot(key: "pre", time: "11:45", label: "Pre-Workout", items: [
            Supplement(key: "citrulline", name: "L-Citrulline", dose: "3 g", trainingOnly: true),
            Supplement(key: "caffeine", name: "Nutricost Caffeine", dose: "200 mg", trainingOnly: true),
        ]),
        SupplementSlot(key: "post", time: "15:00", label: "Lunch / Post-Workout", items: [
            Supplement(key: "creatine", name: "Creatine Monohydrate", dose: "5 g"),
            Supplement(key: "omega3", name: "Omega-3 Fish Oil", dose: "2 caps"),
        ]),
        SupplementSlot(key: "night", time: "22:00", label: "Before Bed", items: [
            Supplement(key: "magnesium", name: "Magnesium Glycinate", dose: "300 mg"),
            Supplement(key: "glycine", name: "Glycine", dose: "5 g"),
            Supplement(key: "theanine", name: "L-Theanine", dose: "200 mg"),
        ]),
    ]

    public static var allKeys: [String] { seed.flatMap { $0.items.map(\.key) } }

    /// Rest days drop the training-only stimulants and any emptied slot; the
    /// multivitamin is 2 tabs on Monday (1) and Friday (5).
    public static func protocolForDate(isTraining: Bool, weekday: Int) -> [SupplementSlot] {
        let multiDose = weekday == 1 || weekday == 5 ? "2 tabs" : "1 tab"
        return seed.compactMap { slot in
            var items = isTraining ? slot.items : slot.items.filter { !($0.trainingOnly ?? false) }
            items = items.map { i in
                guard i.key == "multivitamin" else { return i }
                var m = i; m.dose = multiDose; return m
            }
            guard !items.isEmpty else { return nil }
            var s = slot; s.items = items; return s
        }
    }

    /// The user's own rows when there are any, the seed otherwise.
    public static func stackForDate(_ dbSlots: [SupplementSlot], isTraining: Bool, weekday: Int) -> [SupplementSlot] {
        dbSlots.isEmpty ? protocolForDate(isTraining: isTraining, weekday: weekday) : dbSlots
    }

    public static func count(isTraining: Bool, weekday: Int, dbSlots: [SupplementSlot] = []) -> Int {
        stackForDate(dbSlots, isTraining: isTraining, weekday: weekday).reduce(0) { $0 + $1.items.count }
    }
}
