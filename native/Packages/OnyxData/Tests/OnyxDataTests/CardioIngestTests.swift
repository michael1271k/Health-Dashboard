import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// A watch with bouts on it and a flat resting-energy rate.
private struct Wrist: HealthReading {
    var isAvailable = true
    var bouts: [WorkoutSample] = []
    /// kcal/min at rest — 1.2 is a plausible basal rate and, more usefully,
    /// makes a 50-minute walk's resting share exactly 60.
    var restingPerMinute: Double = 1.2
    func requestAuthorization(read: [String]) async throws -> Bool { true }
    func quantity(_ identifier: String, reduce: HealthReduce, start: Date, end: Date) async throws -> Double? {
        guard identifier == HealthCatalogue.restingEnergyIdentifier else { return nil }
        return restingPerMinute * end.timeIntervalSince(start) / 60
    }
    func sleepSamples(start: Date, end: Date) async throws -> [SleepSample] { [] }
    func workouts(start: Date, end: Date) async throws -> [WorkoutSample] {
        bouts.filter { $0.end >= start && $0.start <= end }
    }
}

@Suite("Cardio auto-ingest: the bout nobody had to type")
struct CardioIngestTests {

    private let user = "u1"
    /// 2026-09-04 14:00 UTC — inside the day the bouts below sit on.
    private let now = Date(timeIntervalSince1970: 1_788_530_400)
    private let today = "2026-09-04"
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    /// A bout on `today` starting at `hour`, `minutes` long.
    private func bout(
        hour: Int, minutes: Double, kind: String = CardioImport.walk,
        distanceM: Double? = 4200, activeKcal: Double? = 210, avgHr: Double? = 112, elevationM: Double? = 86
    ) -> WorkoutSample {
        let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: hour))!
        return WorkoutSample(
            start: start, end: start.addingTimeInterval(minutes * 60), isLifting: false,
            cardioKind: kind, distanceM: distanceM, activeKcal: activeKcal,
            avgHr: avgHr, elevationM: elevationM
        )
    }

    private func ingest(_ db: AppDatabase, _ reader: any HealthReading) async throws -> CardioIngestReport {
        try await HealthSync(database: db, reader: reader, userId: user)
            .ingestCardio(day: today, now: now, calendar: calendar)
    }

    private func rows(_ db: AppDatabase) throws -> [CardioLogRow] {
        try db.cardioRows(userId: user, date: today)
    }

    // MARK: - Inserting

    @Test("a bout the ledger has never seen becomes a row, stamped with its own start")
    func insertsNewBout() async throws {
        let db = try store()
        let report = try await ingest(db, Wrist(bouts: [bout(hour: 7, minutes: 50)]))
        #expect(report == CardioIngestReport(inserted: 1, filled: 0))

        let row = try #require(rows(db).first)
        #expect(row.kind == CardioImport.walk)
        #expect(row.distanceM == 4200)
        #expect(row.durationMin == 50)
        #expect(row.avgHr == 112)
        #expect(row.elevationM == 86)
        #expect(row.fromHealthkit == true)
        // TOTAL energy is active plus resting over the bout's OWN window:
        // 210 + (1.2 × 50) = 270. Not the day's basal, not a guess.
        #expect(row.totalKcal == 270)
        // `created_at` is the bout's start, not the instant of the import — the
        // field the duplicate rule reads next time and the export prints as
        // `start_time`. 07:00 UTC, four hours before `now`.
        #expect(row.createdAt == calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 7)))
        // The write went through `addCardio`, so the push is queued and the
        // pre-migration `kcal` column carries the active figure.
        #expect(row.kcal == 210)
    }

    @Test("a lifting workout is never filed as cardio")
    func skipsLifting() async throws {
        let db = try store()
        var lift = bout(hour: 18, minutes: 60)
        lift.isLifting = true
        lift.cardioKind = nil
        let report = try await ingest(db, Wrist(bouts: [lift]))
        #expect(report.isEmpty)
        #expect(try rows(db).isEmpty)
    }

    @Test("every mapped kind comes in, not just walks and runs")
    func ingestsEveryMappedKind() async throws {
        let db = try store()
        let kinds = [CardioImport.walk, CardioImport.run, CardioImport.cycling,
                     CardioImport.rowing, CardioImport.elliptical, CardioImport.hiit]
        let bouts = kinds.enumerated().map { bout(hour: 6 + $0.offset, minutes: 30, kind: $0.element) }
        let report = try await ingest(db, Wrist(bouts: bouts))
        #expect(report.inserted == kinds.count)
        #expect(Set(try rows(db).map(\.kind)) == Set(kinds))
    }

    @Test("running the pass twice does not log the walk twice")
    func isIdempotent() async throws {
        let db = try store()
        let reader = Wrist(bouts: [bout(hour: 7, minutes: 50)])
        _ = try await ingest(db, reader)
        let second = try await ingest(db, reader)
        // Nothing inserted AND nothing filled: the second pass found the row it
        // wrote, merged it against itself, saw no change and did not write. A
        // launch on a quiet day costs one read and no rows.
        #expect(second.isEmpty)
        #expect(try rows(db).count == 1)
    }

    // MARK: - Merging

    @Test("a hand-typed bout keeps every figure it has and gains only the blanks")
    func fillsBlanksWithoutOverwriting() async throws {
        let db = try store()
        // The treadmill case: a console's own distance, typed at 21:00 for a
        // walk done that morning, with no heart rate and no ascent because no
        // console shows them.
        let typed = CardioLogRow(
            id: "c1", userId: user, date: today, kind: CardioImport.walk,
            distanceM: 5000, durationMin: 50, kcal: 300,
            createdAt: calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 21)),
            activeKcal: 300
        )
        try db.addCardio(typed)

        let report = try await ingest(db, Wrist(bouts: [bout(hour: 7, minutes: 50)]))
        #expect(report == CardioIngestReport(inserted: 0, filled: 1))

        let row = try #require(rows(db).first)
        #expect(row.id == "c1")
        // The typed figures stand. Health says 4200 m and 210 kcal; the person
        // read 5000 m and 300 kcal off the console and that is the number they
        // trust. An unattended process does not get to overrule them.
        #expect(row.distanceM == 5000)
        #expect(row.activeKcal == 300)
        #expect(row.durationMin == 50)
        // The blanks are filled — the figures nobody types.
        #expect(row.avgHr == 112)
        #expect(row.elevationM == 86)
        #expect(row.totalKcal == 270)
        // And it is still a hand-typed row. Flipping the provenance would make
        // the export print a 21:00 insertion instant as the bout's start.
        #expect(row.fromHealthkit != true)
    }

    @Test("a pre-migration row's active figure in `kcal` alone is not treated as a blank")
    func readsLegacyKcalAsActive() async throws {
        let db = try store()
        // `active_kcal` arrived later than `kcal`; a row written before it
        // carries the active figure in `kcal` and nothing in `active_kcal`.
        // Reading only `active_kcal` would see a blank and fill it from Health
        // — overwriting by the back door, which is the one thing this path
        // must not do.
        let legacy = CardioLogRow(
            id: "c1", userId: user, date: today, kind: CardioImport.walk,
            distanceM: 5000, durationMin: 50, kcal: 333,
            createdAt: calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 21))
        )
        try db.addCardio(legacy)

        _ = try await ingest(db, Wrist(bouts: [bout(hour: 7, minutes: 50)]))
        let row = try #require(rows(db).first)
        #expect(row.activeKcal == 333)
        #expect(row.kcal == 333)
    }

    @Test("a matched row Health can add nothing to is not rewritten")
    func writesNothingWhenThereIsNothingToAdd() async throws {
        let db = try store()
        let complete = CardioLogRow(
            id: "c1", userId: user, date: today, kind: CardioImport.walk,
            distanceM: 5000, durationMin: 50, kcal: 300, fromHealthkit: true,
            createdAt: calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 7)),
            activeKcal: 300, totalKcal: 360, avgHr: 130, elevationM: 100
        )
        try db.addCardio(complete)

        let report = try await ingest(db, Wrist(bouts: [bout(hour: 7, minutes: 50)]))
        #expect(report.isEmpty)
        let row = try #require(rows(db).first)
        #expect(row.avgHr == 130)
        #expect(row.elevationM == 100)
    }

    @Test("two walks the same morning map one to one, closest start wins")
    func matchesTheNearerBout() async throws {
        let db = try store()
        let reader = Wrist(bouts: [bout(hour: 7, minutes: 30), bout(hour: 11, minutes: 30)])
        #expect(try await ingest(db, reader).inserted == 2)
        // And a second pass still sees two, not four: each stored start is
        // within the five-minute window of exactly one incoming bout.
        #expect(try await ingest(db, reader).isEmpty)
        #expect(try rows(db).count == 2)
    }

    // MARK: - The store being unavailable

    @Test("no Health store is an empty report, never a throw")
    func unavailableStoreIsSilent() async throws {
        let db = try store()
        let report = try await ingest(db, Wrist(isAvailable: false, bouts: [bout(hour: 7, minutes: 50)]))
        #expect(report.isEmpty)
        #expect(try rows(db).isEmpty)
    }
}

@Suite("The merge rule: an unattended process only ever adds")
struct CardioMergeTests {

    @Test("every stored value wins, every stored blank is filled")
    func storedWins() {
        let stored = CardioImport.Fields(distanceM: 5000, durationMin: 50, activeKcal: 300)
        let incoming = CardioImport.Fields(
            distanceM: 4200, durationMin: 48, activeKcal: 210,
            totalKcal: 270, avgHr: 112, elevationM: 86
        )
        #expect(CardioImport.merge(stored: stored, incoming: incoming) == CardioImport.Fields(
            distanceM: 5000, durationMin: 50, activeKcal: 300,
            totalKcal: 270, avgHr: 112, elevationM: 86
        ))
    }

    @Test("merging a row against itself changes nothing")
    func isIdempotent() {
        let row = CardioImport.Fields(
            distanceM: 4200, durationMin: 50, activeKcal: 210,
            totalKcal: 270, avgHr: 112, elevationM: 86, inclinePct: 3
        )
        #expect(CardioImport.merge(stored: row, incoming: row) == row)
    }

    @Test("an incline nobody can read from Health survives the merge")
    func keepsIncline() {
        // HealthKit has no incline metric for a walk, so the ingest never
        // supplies one. It is in `Fields` so a merge stays a whole-row
        // replacement the caller cannot accidentally narrow — the shape of bug
        // where a treadmill's 3% gradient disappears on the next launch.
        let stored = CardioImport.Fields(durationMin: 30, inclinePct: 3)
        let merged = CardioImport.merge(stored: stored, incoming: CardioImport.Fields(avgHr: 120))
        #expect(merged.inclinePct == 3)
        #expect(merged.avgHr == 120)
    }

    @Test("a zero is a value, not a blank")
    func zeroIsNotMissing() {
        // A flat walk climbed 0 m and that is a fact. `??` treats only nil as
        // absent, which is the behaviour wanted — a `0` coalesced away would
        // let Health overwrite a measured flat with its own estimate.
        let merged = CardioImport.merge(
            stored: CardioImport.Fields(elevationM: 0),
            incoming: CardioImport.Fields(elevationM: 86)
        )
        #expect(merged.elevationM == 0)
    }
}
