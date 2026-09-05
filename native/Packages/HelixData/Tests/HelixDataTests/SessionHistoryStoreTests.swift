import Testing
import Foundation
import GRDB
@testable import HelixData

/// The history reads: ledger order, the name join, and the side spelling the
/// domain's pair-folding rules depend on.
struct SessionHistoryStoreTests {
    let user = "u1"

    func seeded() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "t")
        try db.seedRows { g in
            try Exercise(id: "x", name: "Lat Pulldown").insert(g)
            for (id, date) in [("b", "2026-09-02"), ("a", "2026-09-01")] {
                try WorkoutSession(id: id, userId: "u1", dayKey: "cb_a", date: date).insert(g)
            }
            try WorkoutSet(id: "a1", sessionId: "a", exerciseId: "x", setIndex: 1, weightKg: 50, reps: 10).insert(g)
            try WorkoutSet(id: "b1", sessionId: "b", exerciseId: "x", setIndex: 1, weightKg: 5, reps: 12, side: "left", pairId: "p").insert(g)
            try WorkoutSet(id: "b2", sessionId: "b", exerciseId: "x", setIndex: 1, weightKg: 5, reps: 11, side: "right", pairId: "p", foldOrder: 1).insert(g)
            try WorkoutSet(id: "b3", sessionId: "b", exerciseId: "orphan", setIndex: 2, weightKg: 0, reps: 15, foldOrder: 2).insert(g)
            try PersonalRecordRow(userId: "u1", exerciseKey: "Lat Pulldown", axis: "weight", value: 50, achievedOn: "2026-09-01").insert(g)
        }
        return db
    }

    @Test("the ledger is oldest first, names joined, sides in domain spelling")
    func ledger() throws {
        let db = try seeded()
        let rows = try db.historySets()
        #expect(rows.map(\.id) == ["a1", "b1", "b2", "b3"])
        #expect(rows[0].exerciseName == "Lat Pulldown")
        #expect(rows[3].exerciseName == "orphan", "a set whose exercise was never pulled keeps its id")
        #expect(rows[1].lr == "L" && rows[2].lr == "R")
        #expect(rows[0].lr == nil)
        #expect(rows[1].date == "2026-09-02" && rows[1].dayKey == "cb_a")
    }

    @Test("scoped reads")
    func scoped() throws {
        let db = try seeded()
        #expect(try db.sessionHistory().map(\.id) == ["b", "a"], "newest first")
        #expect(try db.historySets(sessionId: "b").count == 3)
        #expect(try db.historySets(exerciseIds: ["x"]).map(\.id) == ["a1", "b1", "b2"])
        #expect(try db.historySets(exerciseIds: []).isEmpty)
        #expect(try db.personalRecords(exerciseKey: "Lat Pulldown").first?.value == 50)
        #expect(try db.personalRecords(exerciseKey: "Nope").isEmpty)
    }
}
