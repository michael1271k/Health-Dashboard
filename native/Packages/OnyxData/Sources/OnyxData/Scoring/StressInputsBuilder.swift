import Foundation
import GRDB
import OnyxCore

/// The stress index's data half — rows in, `StressInputs` out (Phase 3 E3).
///
/// ── COMPUTED ON READ, NO COLUMN ─────────────────────────────────────────────
/// v1 stores nothing (`docs/STRESS_MODEL.md` §6). The Pulse tile asks for one
/// day and the Trends series for fourteen, and each day is one
/// `readinessHistory` read (five narrow table scans on a local SQLite file)
/// plus the day's own fatigue rows and flat row. Fourteen of those is a few
/// milliseconds on device, which is why nothing is cached or stored yet.
/// ponytail: 14 × readinessHistory per series read; the documented upgrade is
/// `daily_scores.stress_index` + `stress_breakdown` written by the scorer.
///
/// ── THE SAME SCALARS THE BATTERY READS, BY DESIGN ───────────────────────────
/// `hrvZ`, `rhrZ`, `acwr`, `strainZ` and the onset flag come from exactly the
/// calls `scoringInputs` makes, so the tile and the battery stack cannot
/// disagree about the same fact. The two the battery does not read — the
/// fragmentation z and the day MEAN of fatigue — are built here.
public extension AppDatabase {

    /// One day's stress inputs. A day with nothing to say comes back with every
    /// field nil, and `Stress.breakdown` reads that as no reading.
    func stressInputs(userId: String, date: String) throws -> StressInputs {
        try writer.read { db in try Self.stressInputs(db, userId: userId, date: date) }
    }

    static func stressInputs(_ db: Database, userId: String, date: String) throws -> StressInputs {
        let history = try readinessHistory(db, userId: userId, date: date)
        let signals = Readiness.signals(history)
        let frag = Stress.fragmentationZ(awakeMin: history.awakeMin ?? [], asleepMin: history.asleepMin ?? [])

        let log = try DailyLogRow
            .filter(Column("user_id") == userId && Column("date") == date)
            .fetchOne(db)

        // ── THE DAY MEAN, NOT THE LATEST ────────────────────────────────────
        // Folded as the tracker folds it. Whether the day was a training day
        // only decides which modern slot a LEGACY key maps to, and every
        // legacy key maps to exactly one slot either way — so the mean over
        // the folded slots is the same number whichever kind of day it was,
        // and the fold is asked as a training day without loss.
        let fatigueRows = try FatigueLogRow
            .filter(Column("user_id") == userId && Column("date") == date)
            .fetchAll(db)
            .map { FatigueRow(slot: $0.slot, level: $0.level) }
        let fatigueDayMean = Fatigue.dayMean(Fatigue.foldRows(fatigueRows, isTraining: true))

        return StressInputs(
            hrvZ: signals.hrv.z,
            rhrZ: signals.rhr.z,
            fragZ: frag.z,
            // The column is NOT NULL DEFAULT false: a missing row is the same
            // statement as an unticked night, as the scorer reads it.
            sleepOnsetTrouble: log?.sleepOnsetTrouble ?? false,
            fatigueDayMean: fatigueDayMean,
            acwr: signals.load.acwr,
            strainZ: signals.load.strainZ
        )
    }

    /// The day's reading, term by term — what the tile's breakdown sheet draws.
    func stressBreakdown(userId: String, date: String) throws -> Stress.Breakdown {
        Stress.breakdown(try stressInputs(userId: userId, date: date))
    }

    /// `limit` days ending on `endingOn`, computed on read, for the Trends
    /// series and the tile's sparkline. A day with nothing answered comes back
    /// empty, never as a 50.
    func stressSeries(userId: String, endingOn: String, limit: Int = 14) throws -> [StressDay] {
        guard limit > 0 else { return [] }
        let days = try writer.read { db in
            try (0..<limit).map { i -> StressDayIn in
                let date = ISODate.addDays(endingOn, -i) ?? endingOn
                return StressDayIn(date: date, breakdown: Stress.breakdown(try Self.stressInputs(db, userId: userId, date: date)))
            }
        }
        return StressSeries.build(days, endingOn: endingOn, limit: limit)
    }
}
