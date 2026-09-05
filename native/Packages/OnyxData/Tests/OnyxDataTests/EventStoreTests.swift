import Foundation
import Testing
import GRDB
@testable import OnyxData

/// The event log against a real database: persistence, the projection, the
/// outbox, and two devices merging.
@Suite("Event store")
struct EventStoreTests {

    private func seeded(deviceId: String = "phone") throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: deviceId)
        try db.writer.write { conn in
            try Exercise(id: "ex-squat", name: "Back Squat").insert(conn)
            try Exercise(id: "ex-crunch", name: "Reverse Crunch", isBodyweight: true).insert(conn)
            try WorkoutSession(id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02")
                .insert(conn)
        }
        return db
    }

    private func snapshot(_ index: Int, _ kg: Double, _ reps: Int) -> SetSnapshot {
        SetSnapshot(exerciseId: "ex-squat", setIndex: index, weightKg: kg, reps: reps)
    }

    private func sets(_ db: AppDatabase) throws -> [WorkoutSet] {
        try db.writer.read { conn in
            try WorkoutSet.order(Column("set_index")).fetchAll(conn)
        }
    }

    // ── Opening and closing a session ─────────────────────────────────────

    @Test("opening twice rejoins the same session rather than starting a second")
    func openSessionIsIdempotentPerDay() throws {
        let db = try AppDatabase.inMemory()
        let first = try db.openSession(userId: "u1", dayKey: "cb_b", date: "2026-09-03")
        let again = try db.openSession(userId: "u1", dayKey: "cb_b", date: "2026-09-03")
        #expect(first.id == again.id)

        // A DIFFERENT split on the same day is a different session — a swap can
        // land two decks on one date.
        let other = try db.openSession(userId: "u1", dayKey: "legs_a", date: "2026-09-03")
        #expect(other.id != first.id)
        #expect(try db.sessions(on: "2026-09-03").count == 2)
    }

    @Test("a FINISHED session is never rejoined — the second Upper A is its own")
    func openSessionSkipsClosedSessions() throws {
        let db = try AppDatabase.inMemory()
        let morning = try db.openSession(userId: "u1", dayKey: "cb_a", date: "2026-09-03")
        try db.closeSession(id: morning.id)

        // Without the `ended_at IS NULL` predicate this returns `morning`, and
        // an evening session on the same split is appended to the morning's row:
        // two workouts merged into one, with a duration spanning the gap.
        let evening = try db.openSession(userId: "u1", dayKey: "cb_a", date: "2026-09-03")
        #expect(evening.id != morning.id)
        #expect(try db.sessions(on: "2026-09-03").count == 2)

        // And `liveSession` sees only the unfinished one.
        #expect(try db.liveSession(dayKey: "cb_a", date: "2026-09-03")?.id == evening.id)
        try db.closeSession(id: evening.id)
        #expect(try db.liveSession(dayKey: "cb_a", date: "2026-09-03") == nil)
    }

    @Test("closing derives the duration and leaves an unrated session unrated")
    func closeSessionStampsTheEnd() throws {
        let db = try AppDatabase.inMemory()
        let started = Date(timeIntervalSince1970: 1_756_000_000)
        let opened = try db.openSession(
            userId: "u1", dayKey: "cb_b", date: "2026-09-03", startedAt: started
        )

        let closed = try db.closeSession(id: opened.id, endedAt: started.addingTimeInterval(48 * 60))
        #expect(closed?.durationMin == 48)
        // nil is UNRATED, not zero. The battery falls back to its own default
        // rather than reading the session as effortless.
        #expect(closed?.sessionRpe == nil)

        let rated = try db.closeSession(
            id: opened.id, endedAt: started.addingTimeInterval(50 * 60), sessionRpe: 7.5
        )
        #expect(rated?.sessionRpe == 7.5)

        // Closing a session that is not there is nil, not a throw: the caller is
        // a Finish button, and there is nothing it could do with an error.
        #expect(try db.closeSession(id: "no-such-session") == nil)
    }

    // ── RPE (v7) ──────────────────────────────────────────────────────────

    @Test("an unrated set stays unrated, and rating it later is an amend not a rewrite")
    func rpeRoundTrips() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        // nil, not 0. A set nobody judged is not a set judged easy.
        #expect(try sets(db)[0].rpe == nil)

        try db.amendSet(sessionId: "s1", setId: "a", SetPatch(rpe: 8.5))
        #expect(try sets(db)[0].rpe == 8.5)
        // The load is untouched: a patch field left nil means UNCHANGED.
        #expect(try sets(db)[0].weightKg == 100)

        // And the original fact is still in the log — two events, not one
        // overwritten row.
        #expect(try db.setEvents(sessionId: "s1").count == 2)
    }

    @Test("a patch carrying only an RPE is not an empty patch")
    func rpeOnlyPatchIsAccepted() throws {
        #expect(SetPatch(rpe: 7).isEmpty == false)
        #expect(SetPatch().isEmpty)
    }

    // ── The projection ────────────────────────────────────────────────────

    @Test("appending projects a row into workout_sets")
    func appendProjects() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))

        let rows = try sets(db)
        #expect(rows.count == 1)
        #expect(rows[0].id == "a")
        #expect(rows[0].weightKg == 100)
    }

    // ── THE ONE THE BRIEF ASKED FOR, END TO END ───────────────────────────

    @Test("voiding a set removes it from workout_sets while the log keeps the history")
    func voidRemovesFromProjection() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2, 105, 5))
        #expect(try sets(db).count == 2)

        try db.voidSet(sessionId: "s1", setId: "a")

        let rows = try sets(db)
        #expect(rows.count == 1)
        #expect(rows[0].id == "b")

        // Nothing was deleted. The set is gone from the view; the facts that
        // produced it are all still on disk, which is what lets the other
        // device be told about the deletion later.
        let log = try db.setEvents(sessionId: "s1")
        #expect(log.count == 3)
        #expect(log.map(\.kind) == [.append, .append, .void])
    }

    @Test("amending updates the projected row in place")
    func amendProjects() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.amendSet(sessionId: "s1", setId: "a", SetPatch(weightKg: 102.5, reps: 4))

        let rows = try sets(db)
        #expect(rows.count == 1, "an amend edits a set, it does not create one")
        #expect(rows[0].weightKg == 102.5)
        #expect(rows[0].reps == 4)
    }

    @Test("a 0 kg bodyweight set projects intact")
    func bodyweightProjects() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", SetSnapshot(
            exerciseId: "ex-crunch", setIndex: 1, weightKg: 0, reps: 17
        ))
        let row = try #require(try sets(db).first)
        #expect(row.weightKg == 0)
        #expect(row.reps == 17)
        #expect(row.est1rmKg == nil)
    }

    // ── The clock ─────────────────────────────────────────────────────────

    @Test("each local event stamps strictly above the last")
    func clockAdvances() throws {
        let db = try seeded()
        let first = try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        let second = try db.appendSet(sessionId: "s1", setId: "b", snapshot(2, 100, 5))

        // The absolute values are not the invariant and must not be asserted:
        // the first write also claims the pencil, and that claim takes a stamp
        // of its own because it is a real ordered fact. Strict increase is what
        // the merge depends on.
        #expect(second.seq == first.seq + 1)
        #expect(try db.clockValue() == second.seq)
    }

    @Test("the clock survives the store being reopened")
    func clockPersists() throws {
        // A counter that resets on relaunch would stamp new events below ones
        // already written and reorder the session under the user. It lives in
        // the database for exactly this reason.
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2, 100, 5))

        let before = try db.clockValue()
        let reopened = try AppDatabase(db.writer)   // same file, fresh instance
        let next = try reopened.appendSet(sessionId: "s1", setId: "c", snapshot(3, 100, 5))
        #expect(next.seq == before + 1, "a reopened store must not restart the clock")
    }

    @Test("the device id is stable across reopens")
    func deviceIdStable() throws {
        let db = try seeded(deviceId: "watch-1")
        #expect(try db.deviceId() == "watch-1")
        #expect(try AppDatabase(db.writer).deviceId() == "watch-1")
    }

    @Test("a store with no injected id generates one and keeps it")
    func deviceIdGenerated() throws {
        let db = try AppDatabase.inMemory()
        let first = try db.deviceId()
        #expect(!first.isEmpty)
        #expect(try db.deviceId() == first)
    }

    // ── The outbox ────────────────────────────────────────────────────────

    @Test("every event is queued exactly once, in its own transaction")
    func everyEventQueued() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.amendSet(sessionId: "s1", setId: "a", SetPatch(reps: 6))
        try db.voidSet(sessionId: "s1", setId: "a")

        let queue = try db.pendingOutbox()
        #expect(queue.count == 3)
        #expect(queue.map(\.kind) == [
            "set_event.append", "set_event.amend", "set_event.void",
        ])
    }

    @Test("a confirmed event clears the pending flag on its set")
    func confirmClearsPending() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        #expect(try sets(db)[0].isPendingSync == true)

        let item = try #require(try db.pendingOutbox().first)
        try db.outboxSucceeded(item.id)

        // The projection was rebuilt, so the "queued" badge disappears on its
        // own — the ValueObservation on workout_sets sees the rewrite.
        #expect(try sets(db)[0].isPendingSync == false)
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("a set stays pending while ANY of its events is unsynced")
    func pendingUntilAllSynced() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.amendSet(sessionId: "s1", setId: "a", SetPatch(reps: 6))

        let queue = try db.pendingOutbox()
        try db.outboxSucceeded(queue[0].id)          // the append landed
        #expect(try sets(db)[0].isPendingSync == true, "the correction has not")

        try db.outboxSucceeded(queue[1].id)
        #expect(try sets(db)[0].isPendingSync == false)
    }

    @Test("deleting a session takes its event log with it")
    func cascadeDeletesEvents() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        _ = try db.writer.write { try WorkoutSession.deleteOne($0, key: "s1") }
        #expect(try db.setEvents(sessionId: "s1").isEmpty)
    }

    // ── Two devices ───────────────────────────────────────────────────────

    @Test("a remote event merges into the local projection")
    func ingestMerges() throws {
        let phone = try seeded(deviceId: "phone")
        try phone.appendSet(sessionId: "s1", setId: "p1", snapshot(1, 100, 5))

        // What the watch logged, arriving over the link.
        let fromWatch = SetEvent(
            id: "w-evt-1", sessionId: "s1", setId: "w1",
            deviceId: "watch", seq: 1,
            body: .append(SetSnapshot(
                exerciseId: "ex-squat", setIndex: 2, weightKg: 105, reps: 5
            ))
        )
        try phone.ingest([fromWatch])

        let rows = try sets(phone)
        #expect(rows.count == 2)
        #expect(rows.map(\.id) == ["p1", "w1"])
    }

    @Test("ingesting the same event twice changes nothing")
    func ingestIsIdempotent() throws {
        // The same event can legitimately arrive twice — once over the watch
        // link, once through Supabase.
        let phone = try seeded()
        let remote = SetEvent(
            id: "w-evt-1", sessionId: "s1", setId: "w1",
            deviceId: "watch", seq: 1,
            body: .append(snapshot(1, 60, 10))
        )
        try phone.ingest([remote])
        try phone.ingest([remote])

        #expect(try phone.setEvents(sessionId: "s1").count == 1)
        #expect(try sets(phone).count == 1)
    }

    @Test("ingest pulls the local clock above what it has seen")
    func ingestAdvancesClock() throws {
        let phone = try seeded()
        #expect(try phone.clockValue() == 0)

        try phone.ingest([SetEvent(
            id: "w-evt-1", sessionId: "s1", setId: "w1",
            deviceId: "watch", seq: 40,
            body: .append(snapshot(1, 60, 10))
        )])
        #expect(try phone.clockValue() == 40)

        // The phone's next event must sort strictly after the one it just saw.
        let reply = try phone.appendSet(sessionId: "s1", setId: "p1", snapshot(2, 60, 10))
        #expect(reply.seq > 40)
    }

    @Test("a remote event is not echoed back to the server")
    func ingestDoesNotQueue() throws {
        // Queuing what arrived from the network is how a sync loop starts.
        let phone = try seeded()
        try phone.ingest([SetEvent(
            id: "w-evt-1", sessionId: "s1", setId: "w1",
            deviceId: "watch", seq: 1,
            body: .append(snapshot(1, 60, 10))
        )])
        #expect(try phone.pendingOutbox().isEmpty)
        #expect(try sets(phone)[0].isPendingSync == false, "it is already on the server")
    }

    @Test("the watch deletes a set the phone logged, and the phone agrees")
    func remoteVoidWins() throws {
        let phone = try seeded(deviceId: "phone")
        let logged = try phone.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        #expect(try sets(phone).count == 1)

        try phone.ingest([SetEvent(
            id: "w-void", sessionId: "s1", setId: "a",
            deviceId: "watch", seq: logged.seq + 1,
            body: .void
        )])
        #expect(try sets(phone).isEmpty)
    }

    @Test("two devices that exchange the same log agree on the same sets")
    func devicesConverge() throws {
        // The property everything else exists to provide. Two independent
        // stores, each with its own facts, each fed the other's — both must
        // end at an identical list.
        let phone = try seeded(deviceId: "phone")
        let watch = try seeded(deviceId: "watch")

        let p1 = try phone.appendSet(sessionId: "s1", setId: "p1", snapshot(1, 100, 5))
        let w1 = try watch.appendSet(sessionId: "s1", setId: "w1", snapshot(2, 105, 5))
        let p2 = try phone.amendSet(sessionId: "s1", setId: "p1", SetPatch(reps: 6))

        try watch.ingest([p1, p2])
        try phone.ingest([w1])

        let onPhone = try sets(phone)
        let onWatch = try sets(watch)

        #expect(onPhone.count == 2)
        // isPendingSync differs by device — each knows only about its own
        // uploads — so compare what the sets ARE, not this device's bookkeeping.
        #expect(onPhone.map(\.id) == onWatch.map(\.id))
        #expect(onPhone.map(\.weightKg) == onWatch.map(\.weightKg))
        #expect(onPhone.map(\.reps) == onWatch.map(\.reps))
        #expect(onPhone.first?.reps == 6)
    }

    @Test("reprojectAll rebuilds every session from its log alone")
    func reprojectAllRebuilds() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1, 100, 5))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2, 105, 5))
        try db.voidSet(sessionId: "s1", setId: "b")

        // Corrupt the projection the way a bad migration would.
        try db.writer.write { try $0.execute(sql: "DELETE FROM workout_sets") }
        #expect(try sets(db).isEmpty)

        try db.reprojectAll()

        // The log is the source of truth, so the table comes back exactly.
        let rows = try sets(db)
        #expect(rows.count == 1)
        #expect(rows[0].id == "a")
    }

    @Test("event columns are snake_case like every other table")
    func eventColumnNames() throws {
        let db = try AppDatabase.inMemory()
        let columns = try db.writer.read { try $0.columns(in: "set_events").map(\.name) }
        #expect(columns.contains("session_id"))
        #expect(columns.contains("set_id"))
        #expect(columns.contains("device_id"))
        #expect(columns.contains("is_synced"))
        #expect(!columns.contains("sessionId"))
    }
}
