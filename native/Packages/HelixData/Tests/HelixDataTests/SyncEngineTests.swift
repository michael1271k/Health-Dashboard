import Foundation
import Testing
import GRDB
import HelixCore
@testable import HelixData

/// A server that remembers what it was told.
///
/// It applies the same rules Postgres does — upsert on `id`, delete by `id`,
/// `ON CONFLICT DO NOTHING` when asked to ignore duplicates, and a hard refusal
/// of a body naming the same id twice — so "the rows after two drains are
/// identical to the rows after one" is a claim about real behaviour and not
/// about a mock's bookkeeping.
///
/// The duplicate check earns its keep. Without it, a dictionary write silently
/// collapses two rows that Postgres rejects with SQLSTATE 21000, and a test
/// asserting the drainer collapses events passed while the drainer did not.
private actor FakeRemote: SyncRemote {

    var sessions: [String: RemoteSessionRow] = [:]
    var sets: [String: RemoteSetRow] = [:]
    var catalogue: [RemoteExercise]
    /// Requests seen, so a test can prove a replay sent nothing.
    var setUpsertCalls = 0
    var deleteCalls = 0
    /// When set, every call throws — the offline / server-error case.
    var failure: (any Error)?
    /// When set, ONLY the catalogue read throws. An RLS change or a decode
    /// failure on `exercises` is not the same event as the network being gone,
    /// and the drainer is supposed to tell them apart.
    var catalogueFailure: (any Error)?

    init(catalogue: [RemoteExercise]) {
        self.catalogue = catalogue
    }

    func setFailure(_ error: (any Error)?) { failure = error }
    func setCatalogueFailure(_ error: (any Error)?) { catalogueFailure = error }

    func exerciseCatalogue() async throws -> [RemoteExercise] {
        if let failure { throw failure }
        if let catalogueFailure { throw catalogueFailure }
        return catalogue
    }

    func upsertSessions(_ rows: [RemoteSessionRow], ignoreDuplicates: Bool) async throws {
        if let failure { throw failure }
        try Self.rejectDuplicates(rows.map(\.id))
        for row in rows {
            // `ON CONFLICT DO NOTHING` — the row is created if absent and left
            // exactly as it is if present.
            if ignoreDuplicates && sessions[row.id] != nil { continue }
            sessions[row.id] = row
        }
    }

    func upsertSets(_ rows: [RemoteSetRow]) async throws {
        if let failure { throw failure }
        try Self.rejectDuplicates(rows.map(\.id))
        setUpsertCalls += 1
        for row in rows { sets[row.id] = row }
    }

    /// `ON CONFLICT DO UPDATE command cannot affect row a second time`.
    static func rejectDuplicates(_ ids: [String]) throws {
        guard Set(ids).count == ids.count else { throw CardinalityViolation() }
    }

    func deleteSets(ids: [String]) async throws {
        if let failure { throw failure }
        deleteCalls += 1
        for id in ids { sets.removeValue(forKey: id) }
    }
}

private struct Offline: Error {}
/// SQLSTATE 21000, as Postgres raises it on a duplicate constrained value.
private struct CardinalityViolation: Error {}

@Suite("Outbox drainer")
struct SyncEngineTests {

    private static let catalogue: [RemoteExercise] = [
        RemoteExercise(id: "uuid-hack-squat", name: "Hack Squat"),
        RemoteExercise(id: "uuid-leg-press", name: "Leg Press"),
        RemoteExercise(id: "uuid-pec-deck", name: "Pec Deck"),
    ]

    private func store() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        try db.writer.write { conn in
            try WorkoutSession(
                id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02",
                startedAt: Date(timeIntervalSince1970: 1_788_000_000),
                isPendingSync: true
            ).insert(conn)
        }
        return db
    }

    private func squat(_ index: Int, kg: Double = 100, reps: Int = 8) -> SetSnapshot {
        SetSnapshot(exerciseId: ExerciseSlug.id("Hack Squat"), setIndex: index,
                    weightKg: kg, reps: reps, rpe: 8)
    }

    // MARK: The happy path

    @Test("a logged set reaches Postgres as a translated row, and leaves the queue")
    func drainsASet() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.pushed == 1)
        #expect(report.failed == 0)

        let session = try #require(await remote.sessions["s1"])
        #expect(session.splitDay == "legs", "legs_a is a `legs` split, from the live pairs")
        #expect(session.dayKey == "legs_a")

        let set = try #require(await remote.sets["set-1"])
        #expect(set.setNumber == 1, "set_index became set_number")
        #expect(set.exerciseId == "uuid-hack-squat", "the slug became a catalogue uuid")
        #expect(set.userId == "u1", "workout_sets.user_id is NOT NULL and comes from the session")
        #expect(set.weightKg == 100)

        // The queue is empty and nothing is flagged any more — the badge clears
        // itself through the ValueObservation. The session's own flag matters
        // too: `openSession` sets it and only the drainer can clear it.
        #expect(try db.pendingOutbox().isEmpty)
        #expect(try db.sets(sessionId: "s1").allSatisfy { !$0.isPendingSync })
        #expect(try db.session(id: "s1")?.isPendingSync == false)
    }

    @Test("a 30-set workout is two requests, not sixty")
    func batchesBySession() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        for i in 1...30 {
            try db.appendSet(sessionId: "s1", setId: "set-\(i)", squat(i))
        }

        _ = try await SyncEngine(database: db, remote: remote).drain(limit: 50)
        #expect(await remote.setUpsertCalls == 1, "one upsert for the whole session")
        #expect(await remote.sets.count == 30)
    }

    // MARK: Idempotence — the wave's stated gate

    @Test("a replay is a no-op: draining twice leaves identical rows")
    func replayIsANoOp() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.appendSet(sessionId: "s1", setId: "set-2", squat(2))

        let engine = SyncEngine(database: db, remote: remote)
        _ = try await engine.drain()
        let afterFirst = await remote.sets
        let callsAfterFirst = await remote.setUpsertCalls

        // Nothing is queued, so the second drain does no work at all.
        let second = try await engine.drain()
        #expect(second.pushed == 0)
        #expect(await remote.setUpsertCalls == callsAfterFirst)
        #expect(await remote.sets == afterFirst)
    }

    @Test("killed mid-drain and re-run, the rows come out identical")
    func killedMidDrainRecovers() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.appendSet(sessionId: "s1", setId: "set-2", squat(2))

        // A process killed after `claimOutbox` and before the acknowledgement
        // leaves rows reserved with no worker. iOS does this routinely.
        let stranded = try db.claimOutbox()
        #expect(stranded.count == 2)
        #expect(try db.pendingOutbox().isEmpty, "reserved rows are invisible to another worker")

        // Relaunch: the sweep returns them, and the drain that follows produces
        // exactly what an uninterrupted one would have.
        #expect(try db.resetInFlight() == 2)
        _ = try await SyncEngine(database: db, remote: remote).drain()

        #expect(await remote.sets.count == 2)
        #expect(await remote.sets["set-1"]?.setNumber == 1)
        #expect(await remote.sets["set-2"]?.setNumber == 2)
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("three amends collapse into one upsert of the final row")
    func amendsCollapse() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1, kg: 100))
        try db.amendSet(sessionId: "s1", setId: "set-1", SetPatch(weightKg: 102.5))
        try db.amendSet(sessionId: "s1", setId: "set-1", SetPatch(reps: 9))

        // Three queued events, all naming set-1. The fake refuses a body with a
        // repeated id exactly as Postgres does, so this passes only if the
        // drainer really does emit one row per SET rather than one per EVENT.
        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.failed == 0)
        #expect(report.pushed == 3, "every event is still acknowledged individually")
        #expect(await remote.setUpsertCalls == 1)
        let set = try #require(await remote.sets["set-1"])
        #expect(set.weightKg == 102.5)
        #expect(set.reps == 9)
    }

    @Test("a set corrected after logging does not wedge the queue forever")
    func appendAndAmendInOneBatch() async throws {
        // The commonest editing gesture in the app, and the shape that used to
        // put the same id in one upsert body twice: Postgres answers SQLSTATE
        // 21000, the whole session fails, the items back off together and
        // re-form the identical body — so the workout never syncs again.
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1, kg: 100))
        try db.appendSet(sessionId: "s1", setId: "set-2", squat(2))
        try db.appendSet(sessionId: "s1", setId: "set-3", squat(3))
        try db.amendSet(sessionId: "s1", setId: "set-1", SetPatch(weightKg: 97.5))

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.failed == 0)
        #expect(try db.pendingOutbox().isEmpty)
        #expect(await remote.sets.count == 3)
        #expect(await remote.sets["set-1"]?.weightKg == 97.5)
    }

    @Test("a set event never overwrites the session row it only needs to exist")
    func setEventsDoNotClobberTheSession() async throws {
        // Two devices, one session. The phone finishes it; the watch, which
        // never heard the close, still has an unsynced correction. Merging the
        // watch's copy of the session row would reopen the session on the
        // server and take the rating with it, silently, with nothing left
        // queued to show for it.
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.closeSession(id: "s1", endedAt: Date(timeIntervalSince1970: 1_788_002_820),
                            sessionRpe: 8.5)
        _ = try await SyncEngine(database: db, remote: remote).drain()
        #expect(await remote.sessions["s1"]?.sessionRpe == 8.5)

        // Now a device whose local session row knows nothing of the finish.
        let stale = try AppDatabase.inMemory(deviceId: "device-b")
        try await stale.writer.write { conn in
            try WorkoutSession(id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02",
                               startedAt: Date(timeIntervalSince1970: 1_788_000_000)).insert(conn)
        }
        try stale.appendSet(sessionId: "s1", setId: "set-9", squat(9))
        _ = try await SyncEngine(database: stale, remote: remote).drain()

        #expect(await remote.sets["set-9"] != nil, "the set still lands")
        let session = try #require(await remote.sessions["s1"])
        #expect(session.endedAt != nil, "the session did not reopen")
        #expect(session.sessionRpe == 8.5, "the rating survived")
    }

    @Test("a catalogue failure does not back off the session closes behind it")
    func catalogueFailureSparesSessionCloses() async throws {
        // A set event and a session close, queued together, when the catalogue
        // read fails for a reason of its own (an RLS change, a 406, a decode
        // error). Only the set needs the catalogue. Failing the close along
        // with it is how `ended_at` stops reaching the server for a reason that
        // has nothing to do with it — and the close is the one write the outbox
        // exists for.
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.closeSession(id: "s1", endedAt: Date(timeIntervalSince1970: 1_788_002_820),
                            sessionRpe: 8.5)
        await remote.setCatalogueFailure(Offline())

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.pushed == 1, "the session close still went")
        #expect(report.failed == 1, "the set could not resolve its exercise")

        let queued = try db.pendingOutbox()
        #expect(queued.count == 1)
        #expect(queued[0].kind.hasPrefix("set_event."), "only the set is waiting")

        // And the close actually landed, with its rating.
        let session = try #require(await remote.sessions["s1"])
        #expect(session.endedAt != nil)
        #expect(session.sessionRpe == 8.5)
    }

    // MARK: Deletion

    @Test("a voided set is deleted server-side, and only by its own id")
    func voidDeletes() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.appendSet(sessionId: "s1", setId: "set-2", squat(2))
        _ = try await SyncEngine(database: db, remote: remote).drain()
        #expect(await remote.sets.count == 2)

        try db.voidSet(sessionId: "s1", setId: "set-1")
        _ = try await SyncEngine(database: db, remote: remote).drain()

        #expect(await remote.sets["set-1"] == nil)
        #expect(await remote.sets["set-2"] != nil, "only the tombstoned id is touched")
    }

    @Test("a set voided before it ever synced deletes an id the server never had")
    func voidBeforeFirstSyncIsHarmless() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.voidSet(sessionId: "s1", setId: "set-1")

        // Both events drain in one pass. Neither can produce a row: the fold
        // has already removed the set, so both resolve to a delete of an id
        // that was never uploaded — which is a no-op, not an error.
        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.failed == 0)
        #expect(await remote.sets.isEmpty)
        #expect(try db.pendingOutbox().isEmpty)
    }

    // MARK: Finishing a session

    @Test("finishing a session queues the row that carries ended_at")
    func closeSessionSyncs() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        _ = try await SyncEngine(database: db, remote: remote).drain()
        #expect(await remote.sessions["s1"]?.endedAt == nil)

        // Without the enqueue in `closeSession` there is no set event after the
        // finish, so ended_at / duration_min / session_rpe would never leave the
        // phone and the server would keep the session open forever.
        try db.closeSession(
            id: "s1",
            endedAt: Date(timeIntervalSince1970: 1_788_002_820),   // +47 min
            sessionRpe: 8.5
        )
        let queued = try db.pendingOutbox()
        #expect(queued.count == 1)
        #expect(queued[0].kind == "session.upsert")

        _ = try await SyncEngine(database: db, remote: remote).drain()
        let session = try #require(await remote.sessions["s1"])
        #expect(session.endedAt != nil)
        #expect(session.durationMin == 47)
        #expect(session.sessionRpe == 8.5)
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("closing twice replaces the queued item rather than colliding on its key")
    func closingTwiceIsSafe() throws {
        let db = try store()
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.closeSession(id: "s1", endedAt: Date())
        // Rating a session after finishing it closes it again. `idempotency_key`
        // is UNIQUE, so a second insert would throw and take the rating with it.
        try db.closeSession(id: "s1", endedAt: Date(), sessionRpe: 9)

        let queued = try db.pendingOutbox().filter { $0.kind == "session.upsert" }
        #expect(queued.count == 1)
    }

    // MARK: Failure

    @Test("an offline drain keeps every item, counts the attempt and spaces the retry")
    func offlineKeepsEverything() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        await remote.setFailure(Offline())

        let now = Date(timeIntervalSince1970: 1_788_100_000)
        let report = try await SyncEngine(database: db, remote: remote).drain(now: now)
        #expect(report.pushed == 0)
        #expect(report.failed == 1)

        let queued = try db.pendingOutbox()
        #expect(queued.count == 1, "a workout that cannot sync is a workout you still did")
        #expect(queued[0].attempts == 1, "one drain charges one attempt, never two")
        #expect(queued[0].status == .failed)
        // `pendingOutbox` excludes `in_flight`, so finding the row here is also
        // the proof that nothing was left reserved — a stranded reservation is
        // invisible to every future drain until the next cold launch.

        // And the backoff holds it back until its time, rather than burning the
        // radio on the same 400 at every drain.
        #expect(try db.claimOutbox(now: now.addingTimeInterval(1)).isEmpty)
        #expect(try db.claimOutbox(now: now.addingTimeInterval(SyncBackoff.base + 1)).count == 1)
    }

    @Test("one unresolvable movement costs its own rows and nothing else")
    func oneBadExerciseDoesNotBlockTheWorkout() async throws {
        let db = try store()
        // A catalogue missing Pec Deck: the movement was renamed, or the slug
        // drifted. Everything else in the session must still reach the server.
        let remote = FakeRemote(catalogue: [Self.catalogue[0]])
        try db.appendSet(sessionId: "s1", setId: "set-1", squat(1))
        try db.appendSet(sessionId: "s1", setId: "set-2", SetSnapshot(
            exerciseId: ExerciseSlug.id("Pec Deck"), setIndex: 2, weightKg: 47.5, reps: 12
        ))

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.pushed == 1)
        #expect(report.failed == 1)
        #expect(await remote.sets["set-1"] != nil)
        #expect(await remote.sets["set-2"] == nil)
        #expect(await remote.sessions["s1"] != nil, "the session row still lands")

        // The failure names the movement, in front of the user rather than in a
        // discarded row.
        let stuck = try #require(try db.pendingOutbox().first)
        #expect(stuck.lastError?.contains("Pec Deck") == true)
    }

    @Test("a session with no day key fails loudly instead of guessing a split")
    func unmappedDayKeyFails() async throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        // `await`: in an async test GRDB resolves `write` to its async overload.
        try await db.writer.write { conn in
            try WorkoutSession(id: "s9", userId: "u1", dayKey: nil, date: "2026-09-02",
                               startedAt: Date()).insert(conn)
        }
        let remote = FakeRemote(catalogue: Self.catalogue)
        try db.appendSet(sessionId: "s9", setId: "set-1", squat(1))

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.failed == 1)
        #expect(await remote.sessions.isEmpty)
        #expect(try db.pendingOutbox().first?.lastError?.contains("split_day") == true)
    }

    @Test("an undecodable payload is kept and counted, never dropped")
    func poisonRowSurvives() async throws {
        let db = try store()
        let remote = FakeRemote(catalogue: Self.catalogue)
        try await db.writer.write { conn in
            var item = OutboxItem(
                kind: "set_event.append",
                payload: Data("not json".utf8),
                idempotencyKey: "set_event:broken"
            )
            try item.insert(conn)
        }

        let report = try await SyncEngine(database: db, remote: remote).drain()
        #expect(report.failed == 1)
        // A row nobody can read is still evidence of a set somebody logged.
        #expect(try db.pendingOutbox().count == 1)
    }
}
