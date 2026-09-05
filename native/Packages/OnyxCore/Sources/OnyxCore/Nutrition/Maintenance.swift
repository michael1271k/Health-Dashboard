import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Is this date inside a planned maintenance / deload week? A port of
// `src/lib/nutrition/maintenance.ts`.
//
// Two axes claim to know: the LEVER (`Levers.leverForDate == .maintenanceWeek`,
// what the targets, the scorer and the export are graded against) and the PHASE
// (`Phases.span(for:).def.kind == .deload`, what the timeline and the chart
// bands read). The lever wins when it has an opinion — it has a live user
// selection behind it; the phase is the fallback that covers the historical
// deloads (Thailand, the Transition) that predate levers entirely.
//
// `Battery.maintenanceDrainFactor` is the drain-budget factor this module's
// TypeScript also exports; it lives with the battery here.
// ─────────────────────────────────────────────────────────────────────────────

public enum Maintenance {
    /// An inclusive `[start, end]` of dates.
    public struct Span: Codable, Equatable, Sendable {
        public var start: String
        public var end: String
        public init(start: String, end: String) { self.start = start; self.end = end }
    }

    /// The lever selection, bounded by its end date.
    public static func leverOn(_ dateISO: String, stored: String?, until: String?, today: String) -> Bool {
        Levers.leverForDate(dateISO, stored: stored, today: today, releaseEndsOn: until) == .maintenanceWeek
    }

    /// Is `dateISO` a planned maintenance / deload day? Lever first, phase as fallback.
    public static func isMaintenanceDate(_ dateISO: String, stored: String?, until: String?, today: String) -> Bool {
        if leverOn(dateISO, stored: stored, until: until, today: today) { return true }
        return Phases.span(for: dateISO)?.def.kind == .deload
    }

    /// The inclusive span of the deload PHASE containing `dateISO`, or nil.
    /// Answered from `Phases` only: a lever knows when it started and at best
    /// when it means to stop, and a band drawn out to a date the user may still
    /// move would paint the future as though it had happened.
    public static func span(for dateISO: String) -> Span? {
        guard let s = Phases.span(for: dateISO), s.def.kind == .deload,
              let end = ISODate.addDays(s.start, s.def.weeks * 7 - 1)
        else { return nil }
        return Span(start: s.start, end: end)
    }

    /// Every deload span touching a run of dates, clamped to the dates present.
    /// Keyed on the SPAN's own start, so two blocks separated by a cut never
    /// merge just because every date between them was adjacent in the array.
    public static func bands(_ dates: [String]) -> [Span] {
        var out: [Span] = []
        var openSpan: String?
        for date in dates {
            guard let span = span(for: date) else { openSpan = nil; continue }
            if openSpan == span.start, !out.isEmpty {
                out[out.count - 1].end = date
                continue
            }
            openSpan = span.start
            out.append(Span(start: date, end: date))
        }
        return out
    }
}
