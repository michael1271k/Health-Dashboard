import Foundation

/// Reads a day out of HealthKit and writes it into the store.
///
/// ── THE HOP THAT DISAPPEARED ────────────────────────────────────────────────
/// The web path was: plugin → JSON over the Capacitor bridge → `syncDay` in the
/// browser → `POST /api/ingest` with a bearer token → `ingestDailyLog` on a
/// Netlify function in UTC → six Supabase round trips → the phone refetches what
/// it just sent. The function ran in UTC and could not know the user's day, so
/// `logicalTodayForUser` existed to read a timezone out of `user_goals` to work
/// out what "today" meant on a device it was not running on.
///
/// This runs on the device. The day is the device's own calendar day, the write
/// is local and instant, and the upload is the outbox's problem.
public actor HealthSync {

    private let database: AppDatabase
    private let reader: any HealthReading
    private let userId: String

    public init(database: AppDatabase, reader: any HealthReading, userId: String) {
        self.database = database
        self.reader = reader
        self.userId = userId
    }

    /// Ask for permission. Safe to call on every launch: after the first, iOS
    /// resolves it without showing anything.
    @discardableResult
    public func requestAuthorization() async throws -> Bool {
        try await reader.requestAuthorization(read: HealthCatalogue.readTypes)
    }

    /// Today's running total, then yesterday's finalised one.
    ///
    /// ── THE ORDER IS THE POINT ──────────────────────────────────────────────
    /// Today first because it is the visible day. Yesterday second because it
    /// self-corrects whatever Apple recorded after the previous evening's last
    /// sync — a walk before bed after a 21:00 sync — and nothing on screen is
    /// waiting for it.
    ///
    /// Sequential, not concurrent. Two adjacent days' NIGHT WINDOWS are
    /// adjacent, and the sleep write replaces the night it finds; running them
    /// at once is the shape of the bug that used to make the dashboard flip back
    /// to "Awaiting Sleep Data" after a pull-to-refresh.
    @discardableResult
    public func syncRecent(now: Date = Date(), calendar: Calendar = .current) async throws -> [IngestReport] {
        let today = LogicalDayISO.string(now, calendar: calendar)
        var out = [try await sync(day: today, isToday: true, now: now, calendar: calendar)]
        let yesterday = NightWindow.previousDay(today)
        out.append(try await sync(day: yesterday, isToday: false, now: now, calendar: calendar))
        return out
    }

    /// One local day.
    ///
    /// `isToday` caps the window at `now` — a live running total — where a past
    /// day reads its whole midnight-to-midnight span. The bound matters for the
    /// `sum` metrics: querying a future window is not an error, it just returns
    /// the same number more slowly.
    @discardableResult
    public func sync(
        day dateISO: String, isToday: Bool, now: Date = Date(), calendar: Calendar = .current
    ) async throws -> IngestReport {
        guard reader.isAvailable else { return IngestReport() }
        guard let start = Self.localMidnight(dateISO, calendar: calendar) else { return IngestReport() }
        let end = isToday
            ? now
            : (calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400))

        var payload = HealthPayload(date: dateISO)
        for metric in HealthCatalogue.metrics {
            // One metric that throws is one metric that is absent. A device
            // without a wrist temperature sensor must not cost the day its
            // steps, and `quantity` already treats "no samples" as `nil` —
            // this catches the rarer case where the store itself refuses.
            let raw = try? await reader.quantity(
                metric.identifier, reduce: metric.reduce, start: start, end: end
            )
            if let value = HealthCatalogue.round(raw, reduce: metric.reduce, scale: metric.scale) {
                payload[metric.key] = value
            }
        }

        // Sleep has its own window — the night that ENDS on this morning — and
        // its own aggregation. It is not a metric of the calendar day.
        if let night = NightWindow.range(dateISO) {
            let samples = (try? await reader.sleepSamples(start: night.from, end: night.to)) ?? []
            payload.sleep = Sleep.aggregate(samples)
        }

        return try database.ingest(payload, userId: userId, now: now)
    }

    /// Local midnight for a `yyyy-MM-dd`, in the device's own calendar — which
    /// is the whole reason this is on the device and not on a server.
    static func localMidnight(_ dateISO: String, calendar: Calendar) -> Date? {
        let parts = dateISO.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
