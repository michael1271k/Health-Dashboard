import Foundation
import GRDB
import Testing
@testable import OnyxCore
@testable import OnyxData

/// The reports table's first native writer, and the list of weeks it fills in.
@Suite("Reports — the weeks, and the week-keyed write")
struct ReportsStoreTests {

    private let user = "u1"

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    private func report(_ start: String, _ end: String, body: String? = "# body", id: String = newOnyxID()) -> ReportRow {
        ReportRow(
            id: id, userId: user, type: "sentinel7",
            periodStart: start, periodEnd: end, contentMd: body, createdAt: Date()
        )
    }

    // MARK: - The list

    @Test("a fresh account still gets a quarter of weeks to paste into")
    func minimumWeeks() {
        // Sat 2026-09-05, week starting Sunday.
        let weeks = AppDatabase.weeks([], today: "2026-09-05", startDay: 0, minWeeks: 12)
        #expect(weeks.count == 12)
        #expect(weeks.first?.start == "2026-08-30")
        #expect(weeks.first?.end == "2026-09-05")
        #expect(weeks.first?.isCurrent == true)
        #expect(weeks.allSatisfy { !$0.hasReport })
        // Newest first, one week apart, no gaps.
        #expect(weeks.map(\.start) == stride(from: 0, to: 12, by: 1).map {
            ISODate.addDays("2026-08-30", -7 * $0)!
        })
    }

    @Test("the list reaches back past the minimum to the oldest report")
    func reachesTheOldestReport() {
        let old = report("2026-04-05", "2026-04-11")
        let weeks = AppDatabase.weeks([old], today: "2026-09-05", startDay: 0, minWeeks: 12)
        #expect(weeks.last?.start == "2026-04-05")
        #expect(weeks.last?.hasReport == true)
        #expect(weeks.count == 22)
        #expect(weeks.filter(\.hasReport).count == 1)
    }

    @Test("a report written under a different week start is still that week's")
    func weekStartDrift() {
        // The row says Monday the 24th; this athlete's week starts Sunday, so
        // the report belongs to the week of Sunday the 23rd. Matching the raw
        // string would file it under no week and offer "Add report" over it.
        let row = report("2026-08-24", "2026-08-30")
        let weeks = AppDatabase.weeks([row], today: "2026-09-05", startDay: 0, minWeeks: 12)
        let hit = weeks.first { $0.start == "2026-08-23" }
        #expect(hit?.hasReport == true)
        #expect(weeks.filter(\.hasReport).count == 1)
    }

    @Test("a bodiless stub is not a report")
    func stubIsNotAReport() {
        let stub = report("2026-08-30", "2026-09-05", body: "   ")
        let weeks = AppDatabase.weeks([stub], today: "2026-09-05", startDay: 0, minWeeks: 4)
        #expect(weeks.first?.hasReport == false)
    }

    // MARK: - The write

    @Test("a week gets one report however many times it is saved")
    func writeIsKeyedOnTheWeek() throws {
        let db = try store()
        let first = try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: "# one"
        )
        let second = try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: "# two"
        )
        #expect(first == second)
        #expect(try db.read { try ReportRow.fetchCount($0) } == 1)
        #expect(try db.reportBody(id: #require(first)) == "# two")
        #expect(try db.pendingOutbox().allSatisfy { $0.kind == SyncKind.rowUpsert })
    }

    @Test("a Notion-era stub for the week is the row the text lands in")
    func fillsTheStub() throws {
        let db = try store()
        try db.seedRows { try report("2026-08-30", "2026-09-05", body: nil, id: "stub").insert($0) }
        let id = try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: "# pasted"
        )
        #expect(id == "stub")
        #expect(try db.read { try ReportRow.fetchCount($0) } == 1)
        // The stub's own type survives; only the body and the range are the
        // athlete's to restate.
        #expect(try db.read { try ReportRow.fetchOne($0)?.type } == "sentinel7")
    }

    @Test("saving nothing takes the report back, and tells the queue")
    func emptyBodyDeletes() throws {
        let db = try store()
        let id = try #require(try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: "# one"
        ))
        let gone = try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: "   \n "
        )
        #expect(gone == nil)
        #expect(try db.read { try ReportRow.fetchCount($0) } == 0)
        let deletes = try db.pendingOutbox()
            .filter { $0.kind == SyncKind.rowDelete }
            .compactMap { try? OnyxJSON.decoder.decode(RowDeleteRef.self, from: $0.payload) }
        #expect(deletes.contains { $0.table == "reports" && $0.key["id"] == id })
    }

    @Test("a report filed under a drifted date is EDITED, not duplicated")
    func editsTheDriftedRow() throws {
        let db = try store()
        // The row the web wrote: its `period_start` is the Monday, while this
        // athlete's week begins on the Sunday. `weeks(_:)` files it under the
        // Sunday, so that is the week the screen offers — and the write has to
        // find it there or it mints a second row the list then hides.
        try db.seedRows { try report("2026-08-24", "2026-08-30", body: "# from the web", id: "web").insert($0) }
        let id = try db.saveReport(
            userId: user, periodStart: "2026-08-23", periodEnd: "2026-08-29", markdown: "# edited"
        )
        #expect(id == "web")
        #expect(try db.read { try ReportRow.fetchCount($0) } == 1)
        #expect(try db.reportBody(id: "web") == "# edited")
        // And the range it is now filed under is the one the screen offered.
        #expect(try db.read { try ReportRow.fetchOne($0)?.periodEnd } == "2026-08-29")
    }

    @Test("removing a drifted report actually removes it")
    func removesTheDriftedRow() throws {
        let db = try store()
        try db.seedRows { try report("2026-08-24", "2026-08-30", body: "# from the web", id: "web").insert($0) }
        #expect(try db.saveReport(
            userId: user, periodStart: "2026-08-23", periodEnd: "2026-08-29", markdown: ""
        ) == nil)
        #expect(try db.read { try ReportRow.fetchCount($0) } == 0)
    }

    @Test("a week that somehow holds two reports comes back holding one")
    func duplicatesCollapse() throws {
        let db = try store()
        try db.seedRows { database in
            try report("2026-08-23", "2026-08-29", body: "# older", id: "a").insert(database)
            try report("2026-08-26", "2026-08-29", body: "# newer", id: "b").insert(database)
        }
        _ = try db.saveReport(
            userId: user, periodStart: "2026-08-23", periodEnd: "2026-08-29", markdown: "# one"
        )
        #expect(try db.read { try ReportRow.fetchCount($0) } == 1)
    }

    @Test("saving nothing on a week that never had one writes nothing at all")
    func emptyBodyOnAnEmptyWeek() throws {
        let db = try store()
        #expect(try db.saveReport(
            userId: user, periodStart: "2026-08-30", periodEnd: "2026-09-05", markdown: ""
        ) == nil)
        #expect(try db.read { try ReportRow.fetchCount($0) } == 0)
        #expect(try db.pendingOutbox().isEmpty)
    }
}
