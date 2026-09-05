import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// The ledger the phone never used to write.
///
/// `PrEngine` itself is pinned by golden vectors against the TypeScript, so
/// nothing here re-tests what counts as a record. What is unproven is the three
/// things the TRANSLATION can get wrong, each of which fails silently: the
/// baseline window, the key the row is filed under, and whether the outbox
/// hears about it at all.
@Suite("The PR ledger, written from the phone")
struct PrRecorderTests {

    private let user = "u1"
    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    /// `helix5-hack-squat` is the slug the logger mints, so every case here is
    /// also the not-yet-synced path — the one where no catalogue row claims the
    /// id and the name has to come from the program deck.
    private func log(
        _ db: AppDatabase, id: String, date: String, weights: [Double], reps: Int = 8,
        exercise: String = "helix5-hack-squat", dayKey: String = "legs_a"
    ) throws {
        try db.writer.write { conn in
            try WorkoutSession(id: id, userId: user, dayKey: dayKey, date: date, startedAt: Date()).insert(conn)
            for (i, w) in weights.enumerated() {
                try WorkoutSet(
                    id: "\(id)-\(i)", sessionId: id, exerciseId: exercise,
                    setIndex: i + 1, weightKg: w, reps: reps
                ).insert(conn)
            }
        }
    }

    private func records(_ db: AppDatabase) throws -> [PersonalRecordRow] {
        try db.writer.read { conn in
            try PersonalRecordRow.order(Column("exercise_key"), Column("axis")).fetchAll(conn)
        }
    }

    /// A first-ever log is a data point, not a PR — `detectSetPrs` says so in
    /// as many words, and every case below is built on it. Two sets here, so
    /// the second has the first to beat.
    @Test("finishing a session files its records under the canonical NAME")
    func writesLedger() throws {
        let db = try store()
        try log(db, id: "s1", date: "2026-09-04", weights: [100, 110])
        _ = try db.closeSession(id: "s1")

        let rows = try records(db)
        #expect(!rows.isEmpty)
        // The key is what `useSessionDetail` looks a record up by, and it looks
        // it up by `exercises.name`. A raw `helix5-hack-squat` here renders a
        // trophy with no chips and nothing ever notices.
        #expect(Set(rows.map(\.exerciseKey)) == ["Hack Squat"])
        #expect(rows.allSatisfy { $0.sessionId == "s1" && $0.achievedOn == "2026-09-04" })
        // Every axis carries the winning set's load and reps — volume and e1RM
        // included, which stored null until 2026-08-03 and hung the chip on
        // whichever set happened to come last.
        #expect(rows.allSatisfy { $0.weightKg != nil && $0.reps != nil })
        let weight = try #require(rows.first { $0.axis == "weight" })
        #expect(weight.value == 110, "the set that BEAT the bar, not the one that set it")
    }

    @Test("every filed record is queued for the server under its natural key")
    func queuesForPush() throws {
        let db = try store()
        try log(db, id: "s1", date: "2026-09-04", weights: [100, 110])
        _ = try db.closeSession(id: "s1")

        let queued = try db.writer.read { conn in
            try OutboxItem.fetchAll(conn, sql: "SELECT * FROM outbox WHERE idempotency_key LIKE 'row:personal_records:%'")
        }
        #expect(!queued.isEmpty, "a record that never leaves the phone is not a record")
        // Composite key, ASCII-31 joined. A single-value id crashed the drainer
        // once already — see `rowID`.
        let refs = try queued.map { try OnyxJSON.decoder.decode(RowRef.self, from: $0.payload) }
        #expect(refs.allSatisfy { $0.id.split(separator: "\u{1f}").count == 3 })
        #expect(refs.allSatisfy { $0.table == "personal_records" })
    }

    /// The rule the whole ledger rests on, through the recorder.
    ///
    /// A first log has nothing to beat, so it files nothing and simply becomes
    /// the bar. Get this wrong — by letting an empty baseline count as a zero
    /// to clear — and every first session in the app's history reads as a clean
    /// sweep of records that never happened.
    @Test("a first-ever log sets the bar; it does not clear it")
    func firstLogIsNotARecord() throws {
        let db = try store()
        try log(db, id: "s1", date: "2026-09-04", weights: [100])
        _ = try db.closeSession(id: "s1")
        #expect(try records(db).isEmpty)

        try log(db, id: "s2", date: "2026-09-05", weights: [110])
        _ = try db.closeSession(id: "s2")
        #expect(try #require(try records(db).first { $0.axis == "weight" }).value == 110)
    }

    @Test("the baseline is the history WITHOUT this session, or nothing is ever a record")
    func baselineExcludesItself() throws {
        let db = try store()
        try log(db, id: "s1", date: "2026-09-01", weights: [100])
        _ = try db.closeSession(id: "s1")

        try log(db, id: "s2", date: "2026-09-04", weights: [120])
        _ = try db.closeSession(id: "s2")
        let after = try #require(try records(db).first { $0.axis == "weight" })
        #expect(after.value == 120 && after.sessionId == "s2")

        // Lighter than the standing record: NOT a weight record. If the session
        // sat in its own baseline this set would be measured against itself and
        // the heavier day's row would be overwritten by whichever session ran
        // last.
        try log(db, id: "s3", date: "2026-09-07", weights: [90])
        _ = try db.closeSession(id: "s3")
        let unchanged = try #require(try records(db).first { $0.axis == "weight" })
        #expect(unchanged.value == 120 && unchanged.sessionId == "s2", "a lighter day must not overwrite the record")
    }

    @Test("replaying every session lands the same ledger, twice over")
    func recomputeIsIdempotent() throws {
        let db = try store()
        try log(db, id: "s1", date: "2026-09-01", weights: [100])
        try log(db, id: "s2", date: "2026-09-04", weights: [120])
        try log(db, id: "s3", date: "2026-09-07", weights: [90])

        // No `closeSession` above: this is the one-off for sessions logged
        // before the recorder existed.
        try db.writer.write { conn in _ = try PrRecorder.recomputeAll(conn, userId: user) }
        let first = try records(db)
        #expect(!first.isEmpty)
        #expect(try #require(first.first { $0.axis == "weight" }).value == 120)

        try db.writer.write { conn in _ = try PrRecorder.recomputeAll(conn, userId: user) }
        #expect(try records(db) == first, "a second replay must change nothing")
    }
}
