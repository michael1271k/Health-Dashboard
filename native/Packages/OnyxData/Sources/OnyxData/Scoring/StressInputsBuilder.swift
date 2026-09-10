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

    /// `schedule` is an optimisation and nothing else: it is the same context
    /// this would resolve for itself, hoisted by `stressSeries` so a fortnight
    /// costs one resolution rather than fourteen. Passing a context for a
    /// DIFFERENT user is the one way to make this lie.
    static func stressInputs(
        _ db: Database, userId: String, date: String, schedule: ScheduleContext? = nil
    ) throws -> StressInputs {
        let history = try readinessHistory(db, userId: userId, date: date)
        let signals = Readiness.signals(history)
        let frag = Stress.fragmentationZ(awakeMin: history.awakeMin ?? [], asleepMin: history.asleepMin ?? [])

        let log = try DailyLogRow
            .filter(Column("user_id") == userId && Column("date") == date)
            .fetchOne(db)

        // ── THE DAY MEAN, NOT THE LATEST, AND FOLDED AS THE DAY ACTUALLY WAS ─
        // This used to fold every day as a TRAINING day, on the argument that
        // the legacy keys are a bijection either way ({morning, noon, evening,
        // eod} onto {waking, pre, post} on a training day and onto {waking,
        // midday, night} on a rest day), so the mean over the slots comes out
        // the same. That is true of a day whose rows are ALL legacy or ALL
        // modern, and it is the only kind of day the argument considered.
        //
        // A MIXED day breaks it. A rest day carrying a legacy `noon` and a
        // modern `midday` folds to two slots when read as training (`pre` and
        // `midday`, both counted) and to one when read as rest (both land on
        // `midday`, later-wins). Two readings of 5 and 1 mean 3.0 one way and
        // 5.0 or 1.0 the other — and `fatigueDayMean` is a stress TERM, so the
        // tile reports a rest day as several points more stressed than the day
        // the athlete actually had. Every device that answers a slot under the
        // new vocabulary while an old row survives is such a day.
        //
        // `ScoringInputsBuilder` has always passed the real kind here
        // (`isTraining: !isRestDay`). This file's whole premise is that the
        // tile and the battery cannot disagree about the same fact, so it
        // resolves the day the same way rather than assuming past it.
        let fatigueRows = try FatigueLogRow
            .filter(Column("user_id") == userId && Column("date") == date)
            .fetchAll(db)
            .map { FatigueRow(slot: $0.slot, level: $0.level) }
        //
        // And "the real kind" is the day as LOGGED, not as planned — a session
        // on the calendar's rest day is a training day (`isTrainingDay`).
        let isTraining = try Self.isTrainingDay(
            db, userId: userId, date: date, schedule: try schedule ?? Self.scheduleContext(db, userId: userId)
        )
        let fatigueDayMean = Fatigue.dayMean(Fatigue.foldRows(fatigueRows, isTraining: isTraining))

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
            // Resolved once for the whole fortnight. It does not vary by date —
            // the overrides and the layout ARE the per-date rules — so asking
            // fourteen times would be fourteen identical reads.
            let schedule = try Self.scheduleContext(db, userId: userId)
            return try (0..<limit).map { i -> StressDayIn in
                let date = ISODate.addDays(endingOn, -i) ?? endingOn
                return StressDayIn(
                    date: date,
                    breakdown: Stress.breakdown(
                        try Self.stressInputs(db, userId: userId, date: date, schedule: schedule)
                    )
                )
            }
        }
        return StressSeries.build(days, endingOn: endingOn, limit: limit)
    }
}
