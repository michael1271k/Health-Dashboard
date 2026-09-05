import Foundation
import Testing
import GRDB
import OnyxCore
@testable import OnyxData

/// "Ready to progress" off the local ledger — scoped to one day key and one
/// era, in plan order.
@Suite("Progression queue")
struct ProgressionQueueTests {
    private let user = "u1"
    private let today = "2026-09-05"

    private var lift: (name: String, ceiling: Double, dayKey: String) {
        let day = Program.onyx5.day(key: "legs_a")!
        let first = day.exercises(for: .cut).first { !TimedExercise.isTimed($0.name) && Ceilings.repWindow(for: $0.name, dayKey: day.key) != nil }!
        return (first.name, Ceilings.repWindow(for: first.name, dayKey: day.key)!.ceiling, day.key)
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
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            try session(conn, id: "a", date: "2026-08-24", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "b", date: "2026-08-31", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            // A warm-up opener in the newest session is not evidence.
            try WorkoutSet(id: "b-w", sessionId: "b", exerciseId: "ex-1", setIndex: 0, weightKg: 20, reps: 8, setType: "warmup").insert(conn)
        }
        let queue = try db.progressionQueue(dayKey: l.dayKey, program: .onyx5, phase: .cut, today: today)
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
            try Exercise(id: "ex-1", name: l.name).insert(conn)
            // Cleared twice — but once under Legs B, and once before the cut.
            try session(conn, id: "a", date: "2026-08-24", dayKey: "legs_b", weight: 40, reps: l.ceiling)
            try session(conn, id: "p", date: "2026-06-01", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
            try session(conn, id: "b", date: "2026-08-31", dayKey: l.dayKey, weight: 40, reps: l.ceiling)
        }
        let queue = try db.progressionQueue(dayKey: l.dayKey, program: .onyx5, phase: .cut, today: today)
        #expect(queue.map(\.state) == [.oneMore], "one clean session on its own key in this era")
        #expect(try db.progressionQueue(dayKey: "cb_a", program: .onyx5, phase: .cut, today: today).isEmpty)
        #expect(try db.progressionQueue(dayKey: "nope", program: .onyx5, phase: .cut, today: today).isEmpty)
    }
}
