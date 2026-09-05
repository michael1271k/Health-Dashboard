import Foundation
import Testing
@testable import OnyxCore

/// No golden vectors here, and the reason is worth stating: the TypeScript
/// original reads the wall clock, so there is no fixed input to export. What can
/// be pinned is the behaviour on a fixed calendar, which is what these do.
@Suite("Logical day")
struct LogicalDayTests {

    private var jerusalem: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Jerusalem")!
        return calendar
    }

    @Test("formats a date as yyyy-MM-dd, zero-padded")
    func formats() {
        let date = jerusalem.date(from: DateComponents(year: 2026, month: 9, day: 2, hour: 13))!
        #expect(LogicalDay.iso(date, calendar: jerusalem) == "2026-09-02")

        let single = jerusalem.date(from: DateComponents(year: 2026, month: 1, day: 5, hour: 13))!
        #expect(LogicalDay.iso(single, calendar: jerusalem) == "2026-01-05")
    }

    @Test("one minute before midnight is still today")
    func lateNightIsToday() {
        // The removed cutoff would have called this tomorrow — or yesterday,
        // depending on which app you asked. The boundary is midnight, full stop.
        let date = jerusalem.date(from: DateComponents(
            year: 2026, month: 9, day: 2, hour: 23, minute: 59
        ))!
        #expect(LogicalDay.iso(date, calendar: jerusalem) == "2026-09-02")
    }

    @Test("days-ago crosses a month, a year and a leap day")
    func daysAgoWalksTheCalendar() {
        let march = jerusalem.date(from: DateComponents(year: 2026, month: 3, day: 2, hour: 12))!
        #expect(LogicalDay.daysAgo(1, from: march, calendar: jerusalem) == "2026-03-01")
        #expect(LogicalDay.daysAgo(2, from: march, calendar: jerusalem) == "2026-02-28")

        let newYear = jerusalem.date(from: DateComponents(year: 2026, month: 1, day: 1, hour: 12))!
        #expect(LogicalDay.daysAgo(1, from: newYear, calendar: jerusalem) == "2025-12-31")

        // 2024 was a leap year.
        let leap = jerusalem.date(from: DateComponents(year: 2024, month: 3, day: 1, hour: 12))!
        #expect(LogicalDay.daysAgo(1, from: leap, calendar: jerusalem) == "2024-02-29")
    }

    @Test("a day is not 86,400 seconds when the clocks move")
    func daylightSaving() {
        // Israel moves to summer time on the Friday before the last Sunday in
        // March; 2026-03-27 is a 23-hour day. Subtracting a fixed 86,400 seconds
        // from noon on the 28th lands at 13:00 on the 27th — still the right
        // date here, but the same arithmetic on a date near the boundary is how
        // "yesterday" becomes "the day before" twice a year. Calendar arithmetic
        // has no such case.
        let after = jerusalem.date(from: DateComponents(year: 2026, month: 3, day: 28, hour: 12))!
        #expect(LogicalDay.daysAgo(1, from: after, calendar: jerusalem) == "2026-03-27")
        #expect(LogicalDay.daysAgo(7, from: after, calendar: jerusalem) == "2026-03-21")
    }

    @Test("parsing lands at local noon, never midnight")
    func parsesAtNoon() {
        let parsed = try! #require(LogicalDay.date(fromISO: "2026-09-02", calendar: jerusalem))
        let parts = jerusalem.dateComponents([.year, .month, .day, .hour], from: parsed)
        #expect(parts.year == 2026)
        #expect(parts.month == 9)
        #expect(parts.day == 2)
        // Midnight here is what makes a date render as the previous day in any
        // timezone west of the calendar's.
        #expect(parts.hour == 12)
    }

    @Test("a malformed date is nil, not a guess")
    func rejectsGarbage() {
        #expect(LogicalDay.date(fromISO: "") == nil)
        #expect(LogicalDay.date(fromISO: "2026-09") == nil)
        #expect(LogicalDay.date(fromISO: "not-a-date") == nil)
        #expect(LogicalDay.date(fromISO: "2026/09/02") == nil)
    }

    @Test("round-trips today through both directions")
    func roundTrips() {
        let today = LogicalDay.today(calendar: jerusalem)
        let parsed = try! #require(LogicalDay.date(fromISO: today, calendar: jerusalem))
        #expect(LogicalDay.iso(parsed, calendar: jerusalem) == today)
        #expect(LogicalDay.daysAgo(0, calendar: jerusalem) == today)
    }
}
