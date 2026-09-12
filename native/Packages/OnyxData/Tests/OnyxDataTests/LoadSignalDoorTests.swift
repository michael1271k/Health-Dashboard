import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// `AppDatabase.loadSignal(userId:date:)` — the door W1b's week hero reads
/// training load through.
///
/// ── WHAT IS ACTUALLY AT RISK HERE ───────────────────────────────────────────
/// The arithmetic is not: `Readiness.loadSignal` is vector-proven against the
/// web by `ReadinessGoldenTests`, and `readinessHistory`'s row rules are pinned
/// by `ReadinessHistoryTests`. What has no test anywhere is the SEAM between
/// them, and it carries the one claim the hero makes:
///
///     `strain` is Foster's over the seven days ENDING on `date`.
///
/// That is true only because `loadSignal` slices the last `monotonyDays` of the
/// series and `readinessHistory` ends its series on `date`. Neither file states
/// the other's half. If either moved — a series that ended on today regardless,
/// a slice taken from the front — the hero would keep rendering a plausible
/// four-digit number for the wrong week, and nothing would fail.
///
/// So this asserts the seam and nothing else: the window the door reports on is
/// the week the caller asked for, and asking for a different day reports on a
/// different week.
@Suite("The load-signal door — which seven days it answers for")
struct LoadSignalDoorTests {
    private let user = "u1"

    /// One session a day across a fortnight, each a different length, so every
    /// seven-day window has a different sum and two windows cannot agree by
    /// accident. RPE is fixed: the load is `rpe × minutes`, and varying one
    /// factor is enough to tell the windows apart.
    private func seeded() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        try db.writer.write { conn in
            for (offset, minutes) in (0..<14).map({ ($0, 30.0 + Double($0) * 5) }) {
                let date = ISODate.addDays("2026-08-16", offset)!
                try WorkoutSession(
                    id: "s-\(date)", userId: user, dayKey: "legs_a", date: date,
                    durationMin: minutes, sessionRpe: 8
                ).insert(conn)
            }
            // Another user's work never reaches this series. `readinessHistory`
            // filters on `user_id` and the door inherits that — which is the
            // one place W1b's read diverges from `HistoryWeeks`' unfiltered
            // convention, deliberately, because the battery reads it this way.
            try WorkoutSession(
                id: "x1", userId: "u2", dayKey: "legs_a", date: "2026-08-20",
                durationMin: 999, sessionRpe: 10
            ).insert(conn)
        }
        return db
    }

    @Test("strain is Foster's over the seven days ending on the date asked for")
    func windowEndsOnTheDate() throws {
        let db = try seeded()
        let end = "2026-08-22"
        let signal = try db.loadSignal(userId: user, date: end)

        // The week of 16–22 August: 30, 35, 40, 45, 50, 55, 60 minutes at RPE 8.
        let minutes = [30.0, 35, 40, 45, 50, 55, 60]
        let expected = minutes.reduce(0) { $0 + $1 * 8 }
        #expect(signal.weeklyLoad == expected)

        // And the strain is that sum times the week's own monotony, which is
        // only true if the slice really is those seven days.
        let monotony = try #require(signal.monotony)
        let strain = try #require(signal.strain)
        #expect(abs(strain - expected * monotony) < 0.000_001)
    }

    @Test("a different date reports on a different week")
    func windowMoves() throws {
        let db = try seeded()
        let first = try db.loadSignal(userId: user, date: "2026-08-22")
        let second = try db.loadSignal(userId: user, date: "2026-08-29")
        // 23–29 August is 65…95 minutes; strictly heavier than 16–22.
        let later = try #require(second.weeklyLoad)
        let earlier = try #require(first.weeklyLoad)
        #expect(later > earlier)
    }

    @Test("a future endpoint fills the week with real zeros — the reason the caller clamps")
    func futureZeros() throws {
        let db = try seeded()
        // Four days past the last seeded session. `Readiness.dailyLoads` is
        // explicit that a date with nothing on it is a REAL zero, so the week
        // ending here holds three loaded days and four empty ones.
        let signal = try db.loadSignal(userId: user, date: "2026-09-02")
        // 27, 28 and 29 August — the last three seeded days — at 85, 90 and 95
        // minutes. The other four days of the window are past the fixture.
        let weekly = try #require(signal.weeklyLoad)
        #expect(weekly == [85.0, 90, 95].reduce(0) { $0 + $1 * 8 })
        // The acute side has decayed through the empty days, which is the
        // falling ratio `HistoryWeeks.detail` refuses to show on a live week.
        let ratio = try #require(signal.acwr)
        let atLastSession = try #require(try db.loadSignal(userId: user, date: "2026-08-29").acwr)
        #expect(ratio < atLastSession)
    }

    @Test("another user's sessions never enter the series")
    func filtersByUser() throws {
        let db = try seeded()
        let mine = try db.loadSignal(userId: user, date: "2026-08-22")
        let theirs = try db.loadSignal(userId: "u2", date: "2026-08-22")
        #expect(mine.weeklyLoad != theirs.weeklyLoad)
        // u2's single 999-minute session at effort 10, and nothing else.
        #expect(theirs.weeklyLoad == 9_990.0)
    }
}
