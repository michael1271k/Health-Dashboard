import Foundation
import GRDB
import OnyxCore

/// The Body & Vitals trends screen: one range read, and the three precedence
/// rules that turn its rows into series.
///
/// ── WHY THE SHAPERS SIT BESIDE THE QUERY ────────────────────────────────────
/// `HistoryAccess` says a range is shaped at the call site. These three are the
/// exception because each is a RULE the web tested — which table wins a date,
/// which column stands in for another, which Sunday a day belongs to — and a
/// view file has no test host. They are pure; nothing here touches I/O.
public struct BodyVitalsSlice: Sendable, Equatable {
    public var ledger: [BodyCompositionRow]
    public var logs: [DailyLogRow]
    public var metrics: [DailyMetricRow]
    public var goals: UserGoalRow?

    public init(ledger: [BodyCompositionRow] = [], logs: [DailyLogRow] = [], metrics: [DailyMetricRow] = [], goals: UserGoalRow? = nil) {
        self.ledger = ledger
        self.logs = logs
        self.metrics = metrics
        self.goals = goals
    }

    public static let empty = BodyVitalsSlice()
}

public extension AppDatabase {
    /// Every row the trends screen plots, `from`…`to` inclusive, oldest first.
    /// Ledger rows are ordered so the newest `measured_at` of a day comes LAST
    /// and wins a fold.
    func bodyVitals(userId: String, from: String, to: String) throws -> BodyVitalsSlice {
        try read { db in
            let user = Column("user_id") == userId
            let window = Column("date") >= from && Column("date") <= to
            return BodyVitalsSlice(
                ledger: try BodyCompositionRow.filter(user && window)
                    .order(Column("date"), Column("measured_at")).fetchAll(db),
                logs: try DailyLogRow.filter(user && window).order(Column("date")).fetchAll(db),
                metrics: try DailyMetricRow.filter(user && window).order(Column("date")).fetchAll(db),
                goals: try UserGoalRow.filter(user).fetchOne(db)
            )
        }
    }
}

/// One scale reading with every field the chart can plot. `nil` is a gap.
///
/// Three lean figures, never interchangeable: `leanSoftTissue` is
/// `muscle_mass_kg` (weight × muscle %, ~50 kg), `fatFreeMass` is weight − fat
/// (~53 kg), `skeletalMuscle` is the scale's own separate reading (~27 kg).
/// `waistToHip` is the scale's single float — never a tape, never derived.
public struct BodyReading: Sendable, Equatable, Identifiable {
    public var id: String { date }
    public var date: String
    public var weight: Double?
    public var fatPct: Double?
    public var leanSoftTissue: Double?
    public var fatFreeMass: Double?
    public var skeletalMuscle: Double?
    public var visceral: Double?
    public var waistToHip: Double?

    public init(date: String) { self.date = date }
}

public enum BodyVitals {
    /// Ledger over daily log per FIELD per date (`mergeBodyTrend`), sub-50 kg
    /// rows dropped, fat-free mass derived from weight × fat % when both are
    /// present and read from the row otherwise (`mergeBodyComposition`).
    public static func readings(ledger: [BodyCompositionRow], logs: [DailyLogRow]) -> [BodyReading] {
        var byDate: [String: BodyReading] = [:]
        // daily_logs first so the ledger — the deliberate weigh-in — overwrites.
        for l in logs {
            var r = byDate[l.date] ?? BodyReading(date: l.date)
            r.weight = l.weightKg ?? r.weight
            r.fatPct = l.bodyFatPct ?? r.fatPct
            r.leanSoftTissue = l.muscleMassKg ?? r.leanSoftTissue
            r.fatFreeMass = l.fatFreeMassKg ?? r.fatFreeMass
            r.skeletalMuscle = l.skeletalMuscleMassKg ?? r.skeletalMuscle
            r.visceral = l.visceralFat ?? r.visceral
            r.waistToHip = l.estimatedWaistToHipRatio ?? r.waistToHip
            byDate[l.date] = r
        }
        for b in ledger {
            var r = byDate[b.date] ?? BodyReading(date: b.date)
            r.weight = b.weightKg
            r.fatPct = b.bodyFatPct ?? r.fatPct
            r.leanSoftTissue = b.muscleMassKg ?? r.leanSoftTissue
            r.fatFreeMass = b.fatFreeMassKg ?? r.fatFreeMass
            r.skeletalMuscle = b.skeletalMuscleMassKg ?? r.skeletalMuscle
            r.visceral = b.visceralFat ?? r.visceral
            r.waistToHip = b.estimatedWaistToHipRatio ?? r.waistToHip
            byDate[b.date] = r
        }
        return byDate.values
            .filter { Format.validWeight($0.weight) != nil }
            .map { reading in
                var r = reading
                r.fatFreeMass = BodyComposition.derive(BodyCompInput(weightKg: r.weight, bodyFatPct: r.fatPct)).fatFreeMassKg ?? r.fatFreeMass
                return r
            }
            .sorted { $0.date < $1.date }
    }

    /// Daily steps, `daily_metrics` over `daily_logs` per date (`mergeStepsTrend`),
    /// oldest first. A day neither table counted is absent, not zero.
    public static func steps(metrics: [DailyMetricRow], logs: [DailyLogRow]) -> [TrendPoint] {
        var byDate: [String: Double] = [:]
        for (date, steps) in logs.map({ ($0.date, $0.steps) }) + metrics.map({ ($0.date, $0.steps) }) {
            if let steps { byDate[date] = jsRound(Double(steps)) }
        }
        return byDate.keys.sorted().map { TrendPoint(d: $0, v: byDate[$0]!) }
    }

    public enum Roll: Sendable { case mean, sum }

    /// Sunday-anchored weekly roll-up (`vitalWeeklySeries`), oldest first, `d`
    /// = the week's Sunday. A week with no readings is absent.
    public static func weekly(_ points: [TrendPoint], roll: Roll) -> [TrendPoint] {
        var buckets: [String: [Double]] = [:]
        for p in points {
            guard let n = ISODate.dayNumber(p.d) else { continue }
            buckets[ISODate.iso(dayNumber: n - ISODate.weekday(dayNumber: n)), default: []].append(p.v)
        }
        return buckets.keys.sorted().map { sunday in
            let xs = buckets[sunday]!
            let sum = xs.reduce(0, +)
            return TrendPoint(d: sunday, v: roll == .sum ? sum : sum / Double(xs.count))
        }
    }
}
