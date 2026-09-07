import Foundation
import GRDB
import OnyxCore

public extension AppDatabase {

    /// What this day type usually COSTS: the tonnage-weighted mean per-set
    /// rating of the last few sessions of the same split, newest first.
    ///
    /// ── WHY THE SUGGESTION NEEDS IT ─────────────────────────────────────────
    /// `Effort.suggestEffortWord` is deliberately RELATIVE. Rating working sets
    /// at 8.5–9 is what a hypertrophy block looks like, so an absolute map
    /// calls every ordinary Tuesday "Everything" and leaves no word for the day
    /// that earned it. Measured against your own recent sessions of the same
    /// day, a typical one sits at delta ≈ 0 and reads "Hard".
    ///
    /// Below `Effort.minHistory` entries the function ignores this and uses its
    /// cold baseline, so a short answer is not a wrong one — which is why this
    /// returns whatever it finds rather than nil.
    ///
    /// `deriveSessionRpe`, not a plain mean: an unrated set is not a zero, a
    /// warm-up is not a working set, and a heavy set weighs more than a light
    /// one. `SessionDetail.avgRpe` is a different number for a different
    /// question and must not be substituted here.
    func effortHistory(
        userId: String, dayKey: String?, before date: String, limit: Int = 6
    ) throws -> [Double] {
        guard let dayKey else { return [] }
        return try writer.read { db in
            let sessions = try WorkoutSession
                .filter(
                    Column("user_id") == userId
                        && Column("day_key") == dayKey
                        && Column("date") < date
                )
                .order(Column("date").desc, Column("started_at").desc)
                .limit(limit)
                .fetchAll(db)
            guard !sessions.isEmpty else { return [] }

            var byId: [String: [RatedSet]] = [:]
            for set in try WorkoutSet
                .filter(sessions.map(\.id).contains(Column("session_id")))
                .fetchAll(db) {
                byId[set.sessionId, default: []].append(
                    RatedSet(
                        weightKg: set.weightKg, reps: Double(set.reps),
                        rpe: set.rpe, setType: set.setType
                    )
                )
            }
            // An unrated session contributes nothing rather than a zero — the
            // median it feeds is about how hard this day HAS been, and a
            // session nobody rated is not a session that was easy.
            return sessions.compactMap { RpeMemory.deriveSessionRpe(byId[$0.id] ?? []) }
        }
    }
}
