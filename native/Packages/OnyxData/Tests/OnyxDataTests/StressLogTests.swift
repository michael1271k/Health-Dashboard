import Foundation
import GRDB
import Testing
@testable import OnyxCore
@testable import OnyxData

/// The psych-stress loop, end to end: what the sheet writes is what the index
/// reads (D6).
///
/// ── THE SEAM THIS EXISTS FOR ────────────────────────────────────────────────
/// `StressInputsBuilder` has read `stress_logs` since W2 and there was no
/// writer, so the `self` term's second input has never once been exercised
/// against a real row. The two halves agree on a table name and on nothing
/// else unless something asserts it: the slot vocabulary, the tag encoding and
/// the "mean of the day's rows" rule are each a place where a writer and a
/// reader can be individually correct and jointly wrong.
@Suite("Stress logs — the write the index reads")
struct StressLogTests {

    private let user = "u1"
    private let date = "2026-09-03"

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    @Test("a written reading is the day mean the index reads")
    func writeThenRead() throws {
        let db = try store()
        try db.setStress(userId: user, date: date, slot: .morning, level: 2, tags: [.work], note: "deadline")
        let one = try db.stressInputs(userId: user, date: date)
        #expect(one.stressDayMean == 2)

        // A second bucket does not replace the first — the day carries both and
        // the term is their MEAN, which is the rule `StressInputsBuilder`
        // states and the only reason the slot column exists.
        try db.setStress(userId: user, date: date, slot: .evening, level: 4)
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == 3)

        // Re-answering a bucket replaces that bucket, and nothing else.
        try db.setStress(userId: user, date: date, slot: .morning, level: 5)
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == 4.5)
        #expect(try db.read { try StressLogRow.fetchCount($0) } == 2)
    }

    @Test("the level reaches the index's self term, and moves it")
    func reachesTheSelfTerm() throws {
        let db = try store()
        // Nothing logged: the term is fatigue's alone, and nil when neither is.
        #expect(try db.stressBreakdown(userId: user, date: date).terms.selfReport.z == nil)

        try db.setStress(userId: user, date: date, slot: .evening, level: 5)
        let loaded = try db.stressBreakdown(userId: user, date: date)
        // 5 − 3 neutral = +2, clamped at the z bound: the most stress one
        // self-report can state.
        #expect(loaded.terms.selfReport.z == 2)
        #expect(loaded.terms.selfReport.stressDayMean == 5)
        #expect(loaded.terms.selfReport.answered == 1)

        // With fatigue beside it the term is the mean of the two, not either.
        try db.setFatigue(userId: user, date: date, slot: FatigueSlot.waking.rawValue, level: 1)
        let both = try db.stressBreakdown(userId: user, date: date)
        #expect(both.terms.selfReport.answered == 2)
        #expect(both.terms.selfReport.z == 0)
    }

    @Test("tags round-trip in stored order, and an unknown one costs a chip not a reading")
    func tagsRoundTrip() throws {
        let db = try store()
        // Written out of order on purpose: `StressTag.sorted` is what stops the
        // column diffing on every pull.
        try db.setStress(userId: user, date: date, slot: .midday, level: 3, tags: [.travel, .work, .money])
        let row = try #require(try db.read { try StressLogRow.fetchOne($0) })
        #expect(row.tags.raw == #"["work","money","travel"]"#)
        #expect(AppDatabase.reading(row)?.tags == [.work, .money, .travel])

        var forged = row
        forged.tags = JSONText(raw: #"["work","astrology"]"#)
        #expect(AppDatabase.reading(forged)?.tags == [.work])
        #expect(AppDatabase.reading(forged)?.level == 3)
    }

    @Test("a cleared reading leaves the day, and tells the queue")
    func clearing() throws {
        let db = try store()
        try db.setStress(userId: user, date: date, slot: .morning, level: 4)
        try db.setStress(userId: user, date: date, slot: .morning, level: nil)
        #expect(try db.read { try StressLogRow.fetchCount($0) } == 0)
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == nil)
        #expect(try db.pendingOutbox().contains { $0.kind == SyncKind.rowDelete })
    }

    @Test("a blanked note is queued as a null, not omitted")
    func blankedNoteClears() throws {
        let db = try store()
        try db.setStress(userId: user, date: date, slot: .evening, level: 3, note: "  ")
        let row = try #require(try db.read { try StressLogRow.fetchOne($0) })
        #expect(row.note == nil)
        let refs = try db.pendingOutbox()
            .filter { $0.kind == SyncKind.rowUpsert }
            .compactMap { try? OnyxJSON.decoder.decode(RowRef.self, from: $0.payload) }
        #expect(refs.contains { $0.nulls.contains("note") })
    }

    @Test("a slot the server also wrote does not get counted twice")
    func shadowRowGoes() throws {
        let db = try store()
        try db.setStress(userId: user, date: date, slot: .morning, level: 2)
        // What a pull leaves behind: the local table's key is `id`, so a server
        // row for the same (user, date, slot) INSERTS beside the local one —
        // only Postgres holds the unique constraint.
        try db.seedRows { database in
            try StressLogRow(
                id: "from-the-server", userId: user, date: date, slot: StressSlot.morning.rawValue,
                level: 5, tags: JSONText(raw: "[]"), note: nil, createdAt: Date(), updatedAt: Date()
            ).insert(database)
        }
        #expect(try db.read { try StressLogRow.fetchCount($0) } == 2)
        // Flat mean over the day's rows: the duplicate weighs the slot twice.
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == 3.5)

        // The next write to that slot resolves it — one row, one answer.
        try db.setStress(userId: user, date: date, slot: .morning, level: 4)
        #expect(try db.read { try StressLogRow.fetchCount($0) } == 1)
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == 4)
        let deletes = try db.pendingOutbox()
            .filter { $0.kind == SyncKind.rowDelete }
            .compactMap { try? OnyxJSON.decoder.decode(RowDeleteRef.self, from: $0.payload) }
        #expect(deletes.contains { $0.key["id"] == "from-the-server" })
    }

    @Test("the bucket comes from the clock, and a finished day files under evening")
    func buckets() {
        #expect(StressSlot.forClock(.today(minutes: 0)) == .morning)
        #expect(StressSlot.forClock(.today(minutes: 11 * 60 + 59)) == .morning)
        #expect(StressSlot.forClock(.today(minutes: 12 * 60)) == .midday)
        #expect(StressSlot.forClock(.today(minutes: 17 * 60 + 59)) == .midday)
        #expect(StressSlot.forClock(.today(minutes: 18 * 60)) == .evening)
        #expect(StressSlot.forClock(.past) == .evening)
    }

    @Test("the row states the latest reading, never the mean")
    func latestNotMean() throws {
        let db = try store()
        try db.setStress(userId: user, date: date, slot: .morning, level: 1)
        try db.setStress(userId: user, date: date, slot: .evening, level: 5)
        let readings = try db.read {
            try StressLogRow.fetchAll($0)
        }.compactMap(AppDatabase.reading)

        // What the ROW says: the last thing you answered. A day that went from
        // Relaxed at breakfast to Swamped at bedtime is not a "3" — that
        // describes neither moment.
        #expect(PsychStress.latest(readings)?.level == 5)
        // What the INDEX reads: the mean, and the one place it is computed.
        #expect(try db.stressInputs(userId: user, date: date).stressDayMean == 3)
        #expect(PsychStress.latest([]) == nil)
    }
}
