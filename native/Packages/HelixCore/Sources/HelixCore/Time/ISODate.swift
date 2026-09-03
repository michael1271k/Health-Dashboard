import Foundation

/// Civil-date arithmetic on ISO `YYYY-MM-DD` strings — UTC, integer, and free
/// of `Calendar`.
///
/// The web does its date sums as `Date.parse(`${iso}T12:00:00Z`)` and divides
/// by 86,400,000, which is proleptic-Gregorian day counting with no time zone
/// in it. `Calendar.current` would put a zone, a locale and a DST table between
/// two ISO strings that the TypeScript compares as plain numbers, so the port
/// uses the same arithmetic the web does: days since the epoch, both ways.
///
/// Parsing is strict on SHAPE (`YYYY-MM-DD`, month 1–12, day 1–31) and no
/// stricter, which is what every caller here needs: a malformed string reads as
/// nil and the callers answer 0 / nil exactly as the TypeScript does for `NaN`.
public enum ISODate {
    /// Days since 1970-01-01, or nil when the string is not an ISO date.
    public static func dayNumber(_ iso: String) -> Int? {
        let p = iso.split(separator: "-", omittingEmptySubsequences: false)
        guard p.count == 3, p[0].count == 4, p[1].count == 2, p[2].count == 2,
              let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]),
              (1...12).contains(m), (1...31).contains(d)
        else { return nil }
        // days_from_civil — Howard Hinnant's algorithm, as used by libc++.
        let yy = m <= 2 ? y - 1 : y
        let era = (yy >= 0 ? yy : yy - 399) / 400
        let yoe = yy - era * 400
        let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    /// The ISO date `n` days after the epoch — the inverse of `dayNumber`.
    public static func iso(dayNumber n: Int) -> String {
        let z = n + 719468
        let era = (z >= 0 ? z : z - 146096) / 146097
        let doe = z - era * 146097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        let y = yoe + era * 400
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp + (mp < 10 ? 3 : -9)
        return String(format: "%04d-%02d-%02d", m <= 2 ? y + 1 : y, m, d)
    }

    /// `isoAddDays` — nil when the input does not parse (the web throws there).
    public static func addDays(_ iso: String, _ n: Int) -> String? {
        dayNumber(iso).map { self.iso(dayNumber: $0 + n) }
    }
}
