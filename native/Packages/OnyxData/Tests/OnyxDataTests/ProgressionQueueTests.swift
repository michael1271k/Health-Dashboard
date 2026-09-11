import Foundation
import Testing
import GRDB
import OnyxCore
@testable import OnyxData

/// "Ready to progress" off the local ledger — scoped to one day key, one era
/// and the non-maintenance weeks, in plan order.
///
/// The three filters are `SessionSeedBuilder.sessionsForSeed`'s, shared with
/// the deck seed since P3 E4: grading a chain that includes a deliberately
/// lighter week and then pre-filling the deck from a list that excludes it
/// would put a `ready` chip on a load the seed never proposed.
///
/// The dates matter. The ladder rows (`seedLadder`) put a maintenance week on
/// 2026-08-30 … 09-05, so the sessions here sit either side of it deliberately.
@Suite("Progression queue")
struct ProgressionQueueTests {
    private let user = "u1"
    private let today = "2026-09-13"

    private var lift: (name: String, ceiling: Double, dayKey: String) {
        let day = SampleDeck.onyx5.day(key: "legs_a")!
        let first = day.exercises(for: .cut).first { !TimedExercise.isTimed($0.name) && Ceilings.repWindow(for: $0.name, dayKey: day.key, program: SampleDeck.onyx5) != nil }!
        return (first.name, Ceilings.repWindow(for: first.name, dayKey: day.key, program: SampleDeck.onyx5)!.ceiling, day.key)
    }

    /// The rung rows `Levers.schedule` used to compile in: a release rung and
    /// the period that put it in force for the week of 30 Aug (W2: rows).
    private func seedLadder(_ conn: Database) throws {
        try SampleDeck.seedCatalogue(conn, userId: user)
        try UserGoalRow(id: "g", userId: user, contextMode: "normal", createdAt: Date(), updatedAt: Date(), autoLogSupplements: false, activeProgram: "onyx5", dayCutoffHour: 0, unitSystem: "kg", reduceMotion: false, timezone: "UTC", trackRpe: false).insert(conn)
        try TargetProfileRow(userId: user, key: "maintenance-week", label: "Maintenance Week", sort: 13, kcal: 2151, proteinG: 170, carbsG: 244, fatG: 55, stepsGoal: 7500, updatedAt: Date(), kind: "release").insert(conn)
        try TargetProfileRow(userId: user, key: "baseline", label: "Baseline", sort: 10, kcal: 1935, proteinG: 170, carbsG: 190, fatG: 55, stepsGoal: 10000, updatedAt: Date(), kind: "deficit").insert(conn)
        try LeverPeriodRow(userId: user, startsOn: "2026-07-15", profileKey: "baseline", updatedAt: Date()).insert(conn)
        try LeverPeriodRow(userId: user, startsOn: "2026-08-30", profileKey: "maintenance-week", updatedAt: Date()).insert(conn)
        try LeverPeriodRow(userId: user, startsOn: "2026-09-06", profileKey: "baseline", updatedAt: Date()).insert(conn)
    }

    private func session(_ conn: Database, id: String, date: String, dayKey: String, weight: Double, reps: Double, setType: String = "working") throws {
        try WorkoutSession(id: id, userId: user, dayKey: dayKey, date: date, startedAt: Date()).insert(conn)
        for i in 1...2 {
            try WorkoutSet(id: "\(id)-\(i)", sessionId: id, exerciseId: "ex-1", setIndex: i, weightKg: weight, reps: Int(reps), setType: setType).insert(conn)
        }
    }

    @Test("two clean sessions on the day's own key → ready, with the bump")
    func ready() throws {
        let db = try AppDatabase.inMemory(deviceId: "d")
        let l = lift
        try db.writer.write { conn in
            try seedLadder(conn)
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            try session(conn, id: "a", date: "2026-08-17", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "b", date: "2026-08-24", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            // A warm-up opener in the newest session is not evidence.
            try WorkoutSet(id: "b-w", sessionId: "b", exerciseId: "ex-1", setIndex: 0, weightKg: 20, reps: 8, setType: "warmup").insert(conn)
        }
        let queue = try db.progressionQueue(dayKey: l.dayKey, program: SampleDeck.onyx5, phase: .cut, today: today)
        let alert = try #require(queue.first)
        #expect(queue.count == 1)
        #expect(alert.name == l.name)
        #expect(alert.state == .ready)
        #expect(alert.currentKg == 40)
        #expect(alert.suggestKg == 42.5)
        #expect(alert.dayKey == l.dayKey)
    }

    @Test("the other day's sessions and the other era do not count")
    func scoped() throws {
        let db = try AppDatabase.inMemory(deviceId: "d")
        let l = lift
        try db.writer.write { conn in
            try seedLadder(conn)
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            // Cleared twice — but once under Legs B, and once before the cut.
            try session(conn, id: "a", date: "2026-08-17", dayKey: "legs_b", weight: 40, reps: l.ceiling)
            try session(conn, id: "p", date: "2026-06-01", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "b", date: "2026-08-24", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
        }
        let queue = try db.progressionQueue(dayKey: l.dayKey, program: SampleDeck.onyx5, phase: .cut, today: today)
        #expect(queue.map(\.state) == [.oneMore], "one clean session on its own key in this era")
        #expect(try db.progressionQueue(dayKey: "cb_a", program: SampleDeck.onyx5, phase: .cut, today: today).isEmpty)
        #expect(try db.progressionQueue(dayKey: "nope", program: SampleDeck.onyx5, phase: .cut, today: today).isEmpty)
    }

    @Test("a maintenance week breaks the chain rather than extending it")
    func maintenanceIsNotEvidence() throws {
        let db = try AppDatabase.inMemory(deviceId: "d")
        let l = lift
        try db.writer.write { conn in
            try seedLadder(conn)
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            // One clean session before the maintenance week, one inside it.
            // Two cleared sessions is `ready` — but only one of these counts.
            try session(conn, id: "a", date: "2026-08-24", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "m", date: "2026-08-31", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
        }
        #expect(
            try db.progressionQueue(dayKey: l.dayKey, program: SampleDeck.onyx5, phase: .cut, today: today).map(\.state) == [.oneMore],
            "2026-08-31 is inside the scheduled maintenance week and is not evidence about a ceiling"
        )
    }

    @Test("the seed and the verdict read the same sessions")
    func seedAndVerdictAgree() throws {
        let db = try AppDatabase.inMemory(deviceId: "d")
        let l = lift
        try db.writer.write { conn in
            try seedLadder(conn)
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            try session(conn, id: "a", date: "2026-08-24", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "m", date: "2026-08-31", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "other", date: "2026-08-25", dayKey: "legs_b", weight: 40, reps: l.ceiling)
        }
        let seen = try db.sessionsForSeed(dayKey: l.dayKey, today: today).sessions.map(\.id)
        #expect(seen == ["a"], "the maintenance week and the other day are both out")
    }
}
