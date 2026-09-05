import Foundation
import GRDB
import HelixCore

// ─────────────────────────────────────────────────────────────────────────────
// "Ready to progress" — the store side of `ProgressionQueue` (§6.5).
//
// Scoped to ONE day key: the lifts today's session asks for, graded over the
// last two sessions logged UNDER THAT KEY in the current era. The web queue
// walks the whole plan and scopes at the banner; here the Workout tab only
// ever asks about today, and reading the whole ledger to answer a question
// about five lifts was the cost the app-side scan paid.
// ─────────────────────────────────────────────────────────────────────────────

public extension AppDatabase {

    /// The plan's lifts for `dayKey`, in the order the day performs them, with
    /// the verdict over their last two sessions on that key. Empty when the
    /// program has no such day, or nothing has been logged under it.
    ///
    /// Sessions are attributed by their own `day_key`, never by the weekday —
    /// a swapped session still carries the key it was performed as. Rows from
    /// the other era are dropped, as the web does: a new block never inherits
    /// the old one's chain.
    func progressionQueue(dayKey: String, program: Program, phase: ProgramPhase, today: String) throws -> [ProgressionQueue.Alert] {
        guard let day = program.day(key: dayKey) else { return [] }
        let exercises = day.exercises(for: phase)
        guard !exercises.isEmpty else { return [] }

        // Canonical name → EVERY catalogue id it was logged under. A merged
        // alias leaves the same lift under two ids, and a chain split across
        // them is still one chain: rows are read for all of them and folded
        // onto the first.
        let wanted = Set(exercises.map { ExerciseAliases.canonicalName($0.name).lowercased() })
        var idsByName: [String: [String]] = [:]
        for row in try read({ db in try Exercise.fetchAll(db) }) {
            let canonical = ExerciseAliases.canonicalName(row.name).lowercased()
            if wanted.contains(canonical) { idsByName[canonical, default: []].append(row.id) }
        }

        var fold: [String: String] = [:]   // any id → the target's id
        let targets = exercises.compactMap { exercise -> ProgressionQueue.Target? in
            let canonical = ExerciseAliases.canonicalName(exercise.name)
            guard let ids = idsByName[canonical.lowercased()], let first = ids.first else { return nil }
            for id in ids { fold[id] = first }
            return ProgressionQueue.Target(
                id: first, name: canonical, dayKey: day.key, dayLabel: day.label,
                color: String(format: "#%06X", day.accent)
            )
        }
        guard !targets.isEmpty else { return [] }

        let era = Era.forDate(today)
        // The session instant, for ordering two sessions of one lift: the
        // ledger already comes date-then-started_at ordered, so the date plus
        // the row's position in that order is a sortable key without a second
        // read of `workout_sessions`.
        var instant: [String: String] = [:]
        var rows: [ProgressionQueue.SetRow] = []
        for r in try historySets(exerciseIds: Array(fold.keys)) where r.dayKey == dayKey && Era.forDate(r.date) == era {
            if instant[r.sessionId] == nil {
                instant[r.sessionId] = "\(r.date)|\(String(format: "%06d", instant.count))"
            }
            rows.append(ProgressionQueue.SetRow(
                exerciseId: fold[r.exerciseId] ?? r.exerciseId, weightKg: r.weightKg, reps: Double(r.reps), setType: r.setType,
                startedAt: instant[r.sessionId]!, dayKey: r.dayKey
            ))
        }
        return ProgressionQueue.alerts(targets: targets, rows: rows, program: program, phase: phase)
    }
}
