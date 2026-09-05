import Foundation

/// The aggregation behind the Muscle Balance / Volume by Body Part / Freshness /
/// Volume Stream charts — a port of `src/lib/charts/muscleAggregate.ts`.
///
/// Two load-bearing rules: a unilateral pair (shared `pairId` AND sides L+R,
/// exactly two rows) is ONE set and ONE tonnage at the weaker side; a row tagged
/// with the same group twice credits it once.
public struct MuscleSetRow: Codable, Sendable, Equatable {
    public var id: String
    public var weightKg: Double
    public var reps: Double
    public var pairId: String?
    public var side: String?
    public var groups: [String]
    public var date: String

    public init(id: String, weightKg: Double, reps: Double, pairId: String?, side: String? = nil, groups: [String], date: String) {
        self.id = id; self.weightKg = weightKg; self.reps = reps; self.pairId = pairId; self.side = side; self.groups = groups; self.date = date
    }
}

public struct MuscleStat: Codable, Sendable, Equatable {
    public var group: String
    public var sets: Int
    public var volume: Double
    public var daysSince: Int?
}

/// `{ week: "MM-DD", Chest: n, Back: n, … }` — a mixed-value JS object.
public struct WeeklyMuscleRow: Sendable, Equatable {
    public var week: String
    public var counts: [(String, Int)]

    public static func == (a: WeeklyMuscleRow, b: WeeklyMuscleRow) -> Bool {
        a.week == b.week && a.counts.count == b.counts.count && zip(a.counts, b.counts).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
    }
}

public struct MuscleAggregate: Sendable, Equatable {
    public var stats: [MuscleStat]
    public var weekly: [WeeklyMuscleRow]
}

public enum MuscleAggregator {
    /// Hevy tag → one of six display groups, in table order.
    public static let map: [(String, String)] = [
        ("chest", "Chest"), ("pecs", "Chest"),
        ("back", "Back"), ("lats", "Back"), ("traps", "Back"), ("rhomboids", "Back"), ("upper back", "Back"), ("lower back", "Back"),
        ("shoulders", "Shoulders"), ("delts", "Shoulders"), ("rear_delts", "Shoulders"), ("side_delts", "Shoulders"), ("front_delts", "Shoulders"),
        ("biceps", "Arms"), ("triceps", "Arms"), ("forearms", "Arms"), ("arms", "Arms"),
        ("quads", "Legs"), ("quadriceps", "Legs"), ("hamstrings", "Legs"), ("glutes", "Legs"), ("calves", "Legs"),
        ("abductors", "Legs"), ("adductors", "Legs"), ("inner_thigh", "Legs"), ("legs", "Legs"),
        ("core", "Core"), ("abs", "Core"), ("abdominals", "Core"), ("obliques", "Core"),
    ]
    public static let groups = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"]

    static func raw(_ r: MuscleSetRow) -> Double { (r.weightKg.isFinite ? r.weightKg : 0) * (r.reps.isFinite ? r.reps : 0) }

    /// Per-row tonnage with unilateral pairs collapsed to the WEAKER side, landing on the R row.
    static func effectiveVolumes(_ rows: [MuscleSetRow]) -> [String: Double] {
        var out: [String: Double] = [:]
        var pairOrder: [String] = []
        var pairs: [String: [MuscleSetRow]] = [:]
        for r in rows {
            if let p = r.pairId, !p.isEmpty, r.side == "L" || r.side == "R" {
                if pairs[p] == nil { pairOrder.append(p) }
                pairs[p, default: []].append(r)
                continue
            }
            out[r.id] = raw(r)
        }
        for p in pairOrder {
            let bucket = pairs[p]!
            let left = bucket.first { $0.side == "L" }
            let right = bucket.first { $0.side == "R" }
            if bucket.count == 2, let l = left, let r = right {
                let one = min(l.weightKg, r.weightKg) * min(l.reps, r.reps)
                out[r.id] = one
                out[l.id] = 0
            } else {
                for x in bucket { out[x.id] = raw(x) }
            }
        }
        return out
    }

    /// Sunday-anchored week start for a YYYY-MM-DD date.
    public static func weekStartUTC(_ dateISO: String) -> String {
        Swap.dateForWeekday(dateISO, 0)
    }

    public static func aggregate(_ rows: [MuscleSetRow], todayISO: String) -> MuscleAggregate {
        struct Agg { var sets = 0; var volume = 0.0; var last: String? = nil }
        var agg: [String: Agg] = [:]
        var weekOrder: [String] = []
        var weekMap: [String: [(String, Int)]] = [:]   // insertion-ordered per week
        var countedSets = Set<String>()
        var countedWeekly = Set<String>()
        let effective = effectiveVolumes(rows)

        for r in rows {
            // `new Set(r.groups)` — insertion order, duplicates dropped.
            var groups: [String] = []
            for g in r.groups where !groups.contains(g) { groups.append(g) }
            if groups.isEmpty { continue }
            let week = weekStartUTC(r.date)
            let dedupeKey = r.pairId ?? r.id
            let vol = effective[r.id] ?? raw(r)
            for g in groups {
                var a = agg[g] ?? Agg()
                a.volume += vol
                if a.last == nil || r.date > a.last! { a.last = r.date }
                let setKey = "\(g)|\(dedupeKey)"
                if !countedSets.contains(setKey) { countedSets.insert(setKey); a.sets += 1 }
                agg[g] = a
                if weekMap[week] == nil { weekOrder.append(week); weekMap[week] = [] }
                let weekKey = "\(week)|\(g)|\(dedupeKey)"
                if !countedWeekly.contains(weekKey) {
                    countedWeekly.insert(weekKey)
                    if let i = weekMap[week]!.firstIndex(where: { $0.0 == g }) { weekMap[week]![i].1 += 1 } else { weekMap[week]!.append((g, 1)) }
                }
            }
        }

        let todayN = ISODate.dayNumber(todayISO)
        let stats = groups.map { g -> MuscleStat in
            let a = agg[g]
            var daysSince: Int? = nil
            if let last = a?.last, let t = todayN, let l = ISODate.dayNumber(last) { daysSince = t - l }
            return MuscleStat(group: g, sets: a?.sets ?? 0, volume: jsRound(a?.volume ?? 0), daysSince: daysSince)
        }

        let weekly = weekOrder.sorted().map { week -> WeeklyMuscleRow in
            let counts = weekMap[week] ?? []
            return WeeklyMuscleRow(week: String(week.dropFirst(5)), counts: groups.map { g in (g, counts.first { $0.0 == g }?.1 ?? 0) })
        }
        return MuscleAggregate(stats: stats, weekly: weekly)
    }
}
