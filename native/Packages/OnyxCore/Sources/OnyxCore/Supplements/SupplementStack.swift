import Foundation

/// The supplement protocol — `src/lib/supplements.ts` and the pure half of
/// `src/lib/hooks/useCustomSupplements.ts`.
///
/// ── THE STACK LIVES IN THE DATABASE ──────────────────────────────────────────
/// `custom_supplements` is the whole protocol, one row per item, editable in
/// the app. `Supplements.protocolSeed` is only the SEED — what a fresh table is
/// initialised with, and the fallback rendered when the table is empty or
/// unreachable. Editing the seed no longer changes a seeded app.
///
/// `key` is the identity that must survive everything: `supplement_log.item_key`
/// and the nutrient table are both keyed by it, so seeded rows carry these
/// exact strings in `schedule.key` and months of ticked history keeps resolving.
///
/// No clock: the weekday and the minute-of-day are parameters.
public struct Supplement: Codable, Equatable, Sendable {
    public var key: String
    public var name: String
    public var dose: String
    /// Renders/counts only on training days (the pre-workout stimulants).
    /// Optional, not `false`: the seed leaves it unset and a DB row may say
    /// either, and the two are different facts on the wire.
    public var trainingOnly: Bool?
    /// A rule the dose alone can't state — "2 on Monday & Friday".
    public var notes: String?
    /// `custom_supplements.id`, present for anything read from the DB.
    public var customId: String?

    public init(key: String, name: String, dose: String, trainingOnly: Bool? = nil, notes: String? = nil, customId: String? = nil) {
        self.key = key; self.name = name; self.dose = dose
        self.trainingOnly = trainingOnly; self.notes = notes; self.customId = customId
    }
}

public struct SupplementSlot: Codable, Equatable, Sendable {
    public var key: String
    /// "HH:MM", or "—" for rows with no time. Orders the day.
    public var time: String
    public var label: String
    /// A CSS colour string, carried opaquely — OnyxUI decides what to do with it.
    public var accent: String
    public var items: [Supplement]

    public init(key: String, time: String, label: String, accent: String, items: [Supplement]) {
        self.key = key; self.time = time; self.label = label; self.accent = accent; self.items = items
    }
}

/// Everything about a supplement that isn't one of the table's own columns —
/// the `custom_supplements.schedule` jsonb.
public struct CustomSchedule: Codable, Equatable, Sendable {
    /// 0 = Sun … 6 = Sat; absent or empty ⇒ every day.
    public var days: [Int]?
    public var trainingDose: String?
    public var restDose: String?
    /// The stable log key. NEVER change one on an existing row.
    public var key: String?
    /// Display grouping only — "Morning", "Pre-Workout"; the TIME orders the day.
    public var slot: String?
    public var notes: String?
    public var trainingOnly: Bool?

    public init(days: [Int]? = nil, trainingDose: String? = nil, restDose: String? = nil, key: String? = nil,
                slot: String? = nil, notes: String? = nil, trainingOnly: Bool? = nil) {
        self.days = days; self.trainingDose = trainingDose; self.restDose = restDose
        self.key = key; self.slot = slot; self.notes = notes; self.trainingOnly = trainingOnly
    }
}

/// One `custom_supplements` row.
public struct CustomSupplement: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var dose: String
    public var color: String?
    /// pill | powder | capsule | …
    public var form: String?
    /// "HH:MM"
    public var time: String?
    public var schedule: CustomSchedule?
    /// Micronutrient payload per UNIT of the dose; nil = contributes none.
    public var micros: [String: Double]?

    public init(id: String, name: String, dose: String, color: String? = nil, form: String? = nil,
                time: String? = nil, schedule: CustomSchedule? = nil, micros: [String: Double]? = nil) {
        self.id = id; self.name = name; self.dose = dose; self.color = color
        self.form = form; self.time = time; self.schedule = schedule; self.micros = micros
    }
}

public enum Supplements {

    /// `SUPPLEMENT_PROTOCOL` — the seed, with the doses this athlete started from.
    public static let protocolSeed: [SupplementSlot] = [
        SupplementSlot(key: "morning", time: "10:30", label: "Morning", accent: "#3E9E7A", items: [
            Supplement(key: "multivitamin", name: "Two Per Day Multivitamin", dose: "1 tab", notes: "2 tabs on Monday & Friday (Leg Days)"),
            Supplement(key: "d3k2", name: "Vitamin D3 + K2", dose: "125 mcg"),
        ]),
        SupplementSlot(key: "pre", time: "11:45", label: "Pre-Workout", accent: "#8E9AAC", items: [
            Supplement(key: "citrulline", name: "L-Citrulline", dose: "3 g", trainingOnly: true),
            Supplement(key: "caffeine", name: "Nutricost Caffeine", dose: "200 mg", trainingOnly: true),
        ]),
        SupplementSlot(key: "post", time: "15:00", label: "Lunch / Post-Workout", accent: "#3D7AB8", items: [
            Supplement(key: "creatine", name: "Creatine Monohydrate", dose: "5 g"),
            // Two caps — the nutrient payload is PER cap, so this is EPA 1000 / DHA 500.
            Supplement(key: "omega3", name: "Omega-3 Fish Oil", dose: "2 caps"),
        ]),
        SupplementSlot(key: "night", time: "22:00", label: "Before Bed", accent: "#8A6FA8", items: [
            // 300 mg elemental across three tablets — one checkbox, the full dose.
            Supplement(key: "magnesium", name: "Magnesium Glycinate", dose: "300 mg"),
            Supplement(key: "glycine", name: "Glycine", dose: "5 g"),
            Supplement(key: "theanine", name: "L-Theanine", dose: "200 mg"),
        ]),
    ]

    /// `ALL_SUPPLEMENT_KEYS`.
    public static let allKeys: [String] = protocolSeed.flatMap { $0.items.map(\.key) }

    /// The SEED protocol for a day — the fallback, not the source. On rest days
    /// the training-only stimulants are dropped and any slot left empty is
    /// removed. The multivitamin is 1 tab daily EXCEPT Monday & Friday (2 tabs).
    public static func protocolForDate(isTraining: Bool, weekday: Int) -> [SupplementSlot] {
        let multiDose = weekday == 1 || weekday == 5 ? "2 tabs" : "1 tab"
        return protocolSeed.compactMap { slot in
            var s = slot
            // `!i.trainingOnly` — unset and false both survive a rest day.
            if !isTraining { s.items = s.items.filter { $0.trainingOnly != true } }
            s.items = s.items.map { i in
                var i = i
                if i.key == "multivitamin" { i.dose = multiDose }
                return i
            }
            return s.items.isEmpty ? nil : s
        }
    }

    /// The day's stack: the user's own rows when there are any, the seed
    /// otherwise. ONE resolver, so the checklist, the micro totals, the Stack
    /// tile's denominator and the export cannot disagree. An empty `dbSlots`
    /// means the table is unseeded or unreadable, and the seed beats an empty list.
    public static func stackForDate(_ dbSlots: [SupplementSlot], isTraining: Bool, weekday: Int) -> [SupplementSlot] {
        dbSlots.isEmpty ? protocolForDate(isTraining: isTraining, weekday: weekday) : dbSlots
    }

    /// `supplementCountForDate` — the denominator for the Stack tile. The web
    /// reads the clock for the weekday here; it is not a parameter because the
    /// weekday only changes a DOSE STRING, never how many items there are.
    public static func count(isTraining: Bool, dbSlots: [SupplementSlot] = []) -> Int {
        stackForDate(dbSlots, isTraining: isTraining, weekday: 0).reduce(0) { $0 + $1.items.count }
    }

    /// `slotTimePassed` — has a slot's "HH:MM" passed, given the device's
    /// minute of the day? Parsed the way `split(':').map(Number)` parses:
    /// whitespace is trimmed, an empty part is 0, a missing or non-numeric
    /// part is NaN and the comparison is false.
    public static func slotTimePassed(_ hhmm: String, nowMinutes: Int) -> Bool {
        let parts = hhmm.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count >= 2, let h = jsNumber(parts[0]), let m = jsNumber(parts[1]) else { return false }
        return Double(nowMinutes) >= h * 60 + m
    }

    private static func jsNumber(_ s: Substring) -> Double? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? 0 : Double(t)
    }

    // MARK: The custom rows

    /// `customDoseFor` — the dose on a training vs rest day. `||`, so an empty
    /// per-day dose falls back to the row's own.
    public static func customDose(_ c: CustomSupplement, isTraining: Bool) -> String {
        let d = isTraining ? c.schedule?.trainingDose : c.schedule?.restDose
        return (d?.isEmpty == false) ? d! : c.dose
    }

    /// `supplementKeyOf` — the stable seeded key where present, else `custom:<id>`.
    public static func key(of c: CustomSupplement) -> String {
        (c.schedule?.key?.isEmpty == false) ? c.schedule!.key! : "custom:\(c.id)"
    }

    /// `customSlotsForDate` — the DB rows due on a day → the slots the checklist
    /// renders and the export prints. Grouped by TIME and ordered by it.
    ///
    /// The web sorts the time keys with `localeCompare`. The keys are "HH:MM"
    /// strings and the "—" bucket for rows with no time, and under ICU's root
    /// collation punctuation sorts before every digit — so "—" leads and the
    /// rest is bytewise. That is spelled out here rather than delegated to a
    /// locale-sensitive compare whose answer depends on the device.
    public static func customSlotsForDate(_ customs: [CustomSupplement], weekday: Int, isTraining: Bool = true) -> [SupplementSlot] {
        let due = customs.filter { c in
            let days = c.schedule?.days ?? []
            return (days.isEmpty || days.contains(weekday))
                // A training-only item simply is not part of a rest day.
                && (isTraining || c.schedule?.trainingOnly != true)
        }
        if due.isEmpty { return [] }

        var order: [String] = []
        var byTime: [String: [CustomSupplement]] = [:]
        for c in due {
            let t = (c.time?.isEmpty == false) ? c.time! : "—"
            if byTime[t] == nil { order.append(t) }
            byTime[t, default: []].append(c)
        }
        return order.sorted(by: timeOrder).map { time in
            let items = byTime[time]!
            return SupplementSlot(
                key: "stack-\(time)",
                time: time,
                // The slot's name comes from its members; 'Custom' was a label for
                // a second-class list that no longer exists.
                label: items.first { $0.schedule?.slot?.isEmpty == false }?.schedule?.slot ?? "Stack",
                accent: (items[0].color?.isEmpty == false) ? items[0].color! : "#8E9AAC",
                items: items.map { c in
                    Supplement(key: key(of: c), name: c.name, dose: customDose(c, isTraining: isTraining),
                               trainingOnly: c.schedule?.trainingOnly, notes: c.schedule?.notes, customId: c.id)
                }
            )
        }
    }

    private static func timeOrder(_ a: String, _ b: String) -> Bool {
        if a == "—" { return b != "—" }
        if b == "—" { return false }
        return Array(a.utf16).lexicographicallyPrecedes(b.utf16)
    }
}
