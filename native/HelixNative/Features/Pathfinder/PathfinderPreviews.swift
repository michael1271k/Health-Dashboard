#if DEBUG
import SwiftUI
import GRDB
import HelixCore
import HelixData
import HelixUI

/// Seeded Pathfinder screens for `scripts/native-shot.sh`: six Helix-cut weeks
/// of sessions folded through the real model, one of them with a report.
enum PathfinderPreviews {
    static let userId = "00000000-0000-0000-0000-000000000001"
    static let today = "2026-09-04"

    @MainActor
    static func environment(_ database: AppDatabase) -> AppEnvironment {
        AppEnvironment(
            database: database,
            supabase: HelixSupabase.makeClient(config: SupabaseConfig(url: URL(string: "https://preview.invalid")!, anonKey: "preview"))
        )
    }

    @MainActor
    static func seededDatabase() -> AppDatabase {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        let t = Date()
        try! database.seedRows { db in
            try UserGoalRow(
                id: "g1", userId: userId, calorieGoal: 1999, proteinGoalG: 170, stepsGoal: 10_000, contextMode: "normal",
                createdAt: t, updatedAt: t, autoLogSupplements: false, activeProgram: "apex51", dayCutoffHour: 4,
                unitSystem: "metric", reduceMotion: false, timezone: "UTC", activePlan: "apex51", activePhase: "cut",
                trackRpe: true, activeLever: "custom"
            ).insert(db)
            let deck: [(id: String, name: String)] = [
                ("ex-lp", "Leg Press"), ("ex-rc", "Reverse Crunch"), ("ex-lr", "Single Arm Lateral Raise (Cable)"),
                ("ex-cp", "Chest Press"), ("ex-row", "Seated Cable Row"),
            ]
            for e in deck { try Exercise(id: e.id, name: e.name).insert(db) }

            // Six weeks, the plan's five days each — Week 2 through Week 7 —
            // with Week 5 missing its Friday and Week 6 missing two.
            let plan: [(weekday: Int, key: String, lifts: [(String, Double, Int)])] = [
                (0, "cb_a", [("ex-cp", 60, 10), ("ex-row", 55, 12)]),
                (1, "legs_a", [("ex-lp", 75, 12), ("ex-rc", 0, 15)]),
                (2, "arms", [("ex-lr", 5, 15)]),
                (4, "cb_b", [("ex-cp", 62.5, 9), ("ex-row", 57.5, 11)]),
                (5, "legs_b", [("ex-lp", 70, 14)]),
            ]
            var n = 0
            for w in 0..<6 {
                let weekStart = ISODate.addDays("2026-07-26", w * 7)!
                for day in plan {
                    if (w == 3 && day.weekday == 5) || (w == 4 && day.weekday >= 4) { continue }
                    let date = ISODate.addDays(weekStart, day.weekday)!
                    let id = "s\(n)"
                    n += 1
                    try WorkoutSession(id: id, userId: userId, dayKey: day.key, date: date,
                                       startedAt: LogicalDay.date(fromISO: date), durationMin: 62, sessionRpe: 8).insert(db)
                    var index = 0
                    for (exercise, kg, reps) in day.lifts {
                        for set in 0..<3 {
                            try WorkoutSet(id: "\(id)-\(index)", sessionId: id, exerciseId: exercise, setIndex: index,
                                           weightKg: kg + Double(w) * 2.5, reps: reps - set, rpe: 8).insert(db)
                            index += 1
                        }
                    }
                }
            }
            try ReportRow(
                id: "r1", userId: userId, type: "sentinel7", periodStart: "2026-08-23", periodEnd: "2026-08-29",
                contentMd: PreviewReport.body, sessionSummaryMd: nil, weightReportMd: nil,
                metrics: nil, notionPageId: nil, createdAt: t
            ).insert(db)
        }
        return database
    }

    @MainActor
    static func model(empty: Bool = false) -> (AppEnvironment, PathfinderModel) {
        if empty {
            let database = try! AppDatabase.inMemory(deviceId: "shot")
            return (environment(database), PathfinderModel(database: database, userId: userId))
        }
        let database = seededDatabase()
        let weeks = try! PathfinderModel.fold(database: database, userId: userId, today: today)
        return (environment(database), PathfinderModel(database: database, userId: userId, weeks: weeks))
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        let (environment, model) = model(empty: screen == "pathfinder-empty")
        NavigationStack { PathfinderView(seeded: model) }.environment(environment)
    }
}
#endif
