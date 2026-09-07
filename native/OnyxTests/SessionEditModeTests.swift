import Foundation
import Testing
import GRDB
import OnyxCore
import OnyxData
@testable import Onyx

/// Re-opening a finished workout on the deck (§U4.5).
///
/// ── WHY THESE FOUR AND NOT MORE ─────────────────────────────────────────────
/// `SessionEditing` is already held to its own contract in `OnyxDataTests` —
/// the seed, the replay, the retraction, the aggregate guard. What is untested
/// there, and is the whole of what this wave added, is the JOIN: a deck built
/// from `Program.onyx5` folding onto rows that may carry the WEB's catalogue
/// uuids rather than this phone's slugs. Every fault that join can produce is
/// silent — a blank deck, a session split in two under one name, a bar built
/// from nothing — so each gets a case.
@MainActor
@Suite("Session edit mode")
struct SessionEditModeTests {

    /// `nonisolated` because `seedRows` takes a `@Sendable` closure and the
    /// suite is `@MainActor` — a main-actor-isolated constant cannot be read
    /// from one, and the alternative is spelling both strings twice.
    private nonisolated static let userId = "00000000-0000-0000-0000-000000000009"
    private nonisolated static let sessionId = "s-edit"

    /// One finished Upper A, logged the way the WEB logs: `exercise_id` is a
    /// catalogue uuid, not `helix5-<slug>`. This is the case `restoreLoggedSets`
    /// used to find nothing for.
    private func store() throws -> AppDatabase {
        let database = try AppDatabase.inMemory(deviceId: "edit-test")
        try database.seedRows { db in
            try Exercise(id: "ex-chest-press", name: "Chest Press (Machine)").insert(db)
            let start = LogicalDay.date(fromISO: "2026-08-30")!.addingTimeInterval(17 * 3600)
            try WorkoutSession(
                id: Self.sessionId, userId: Self.userId, dayKey: "cb_a", date: "2026-08-30",
                startedAt: start, endedAt: start.addingTimeInterval(60 * 60),
                durationMin: 60, sessionRpe: 7
            ).insert(db)
            for (index, reps) in [10, 9, 8].enumerated() {
                try WorkoutSet(
                    id: "set-\(index + 1)", sessionId: Self.sessionId, exerciseId: "ex-chest-press",
                    setIndex: index + 1, weightKg: 40, reps: reps, setType: "normal",
                    est1rmKg: Epley.oneRepMax(weight: 40, reps: Double(reps)), foldOrder: index
                ).insert(db)
            }
        }
        return database
    }

    private func attached(_ database: AppDatabase) throws -> LoggerModel {
        let session = try #require(try database.session(id: Self.sessionId))
        let model = LoggerModel(
            day: Program.onyx5.day(key: "cb_a")!, phase: .cut,
            store: database, userId: Self.userId, startedAt: session.startedAt ?? Date()
        )
        model.attach(editing: session)
        return model
    }

    private func chestPress(_ model: LoggerModel) throws -> LoggerModel.ExerciseState {
        try #require(model.exercises.first { $0.name == "Chest Press (Machine)" })
    }

    @Test("a session logged on the web restores onto the deck, matched by name")
    func restoresAcrossIdSchemes() throws {
        let model = try attached(try store())

        #expect(model.isEditing)
        #expect(model.sessionId == Self.sessionId)
        let exercise = try chestPress(model)
        let done = exercise.rows.filter(\.isDone)
        #expect(done.count == 3, "the three logged sets must come back ticked")
        #expect(done.map { $0.reps ?? 0 } == [10, 9, 8])
        // Matched by canonical NAME: the rows carry `ex-chest-press` and the
        // deck's own key for this movement is `helix5-chest-press-machine`.
        #expect(exercise.storedExerciseId == "ex-chest-press")
        #expect(exercise.rows[0].id == "set-1", "the deck must own the STORED set ids, or an amend addresses nothing")
    }

    @Test("a set added to a web-logged session keeps the session's own exercise id")
    func appendKeepsTheStoredId() throws {
        let database = try store()
        let model = try attached(database)
        let exercise = try chestPress(model)

        model.addSet(to: exercise)
        let fresh = try #require(exercise.rows.last)
        fresh.weightKg = 40
        fresh.reps = 7
        model.toggleDone(fresh, in: exercise)

        let ids = Set(try database.sets(sessionId: Self.sessionId).map(\.exerciseId))
        #expect(ids == ["ex-chest-press"], "a slug beside the uuid splits one movement into two in every report")
        #expect(try database.sets(sessionId: Self.sessionId).count == 4)
    }

    @Test("editing a finished session never opens a second one")
    func neverMintsASession() throws {
        let database = try store()
        let model = try attached(database)
        let exercise = try chestPress(model)

        model.addSet(to: exercise)
        let fresh = try #require(exercise.rows.last)
        fresh.weightKg = 30
        fresh.reps = 12
        model.toggleDone(fresh, in: exercise)

        let sessions = try database.read { db in try WorkoutSession.fetchAll(db) }
        #expect(sessions.count == 1)
        #expect(sessions[0].id == Self.sessionId)
        // `ended_at` is what makes it history; an edit must not reopen it.
        #expect(sessions[0].endedAt != nil)
    }

    @Test("an edit is dirty until it is finished, and finishing anchors the cascade on the session's date")
    func finishReportsTheCascadeAnchor() throws {
        let database = try store()
        let model = try attached(database)
        let exercise = try chestPress(model)

        #expect(!model.editDirty, "opening the deck changes nothing")

        let row = try #require(exercise.rows.first)
        row.weightKg = 60
        model.commitEdit(row, in: exercise)
        #expect(model.editDirty)

        // The date is the session's LOGICAL day, never today: `RescoreQueue`
        // walks forward from it, and anchoring on today would leave every score
        // between the workout and now describing the load that was corrected.
        #expect(model.finishEdit(sessionRpe: 8) == "2026-08-30")
        model.clearEditDirty()
        #expect(!model.editDirty)

        let session = try #require(try database.session(id: Self.sessionId))
        #expect(session.sessionRpe == 8)
        let stored = try #require(try database.sets(sessionId: Self.sessionId).first { $0.id == "set-1" })
        #expect(stored.weightKg == 60, "the amend must reach the projection, not just the event log")
    }
}
