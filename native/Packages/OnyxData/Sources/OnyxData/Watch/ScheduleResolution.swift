import Foundation
import GRDB
import OnyxCore

extension AppDatabase {

    /// Whether `date` was a training day, for anything that folds the day's
    /// self-reports by its kind (`Fatigue.foldRows`).
    ///
    /// ── LOGGED BEATS PLANNED ────────────────────────────────────────────────
    /// The schedule says what the day was MEANT to be. A session row says what
    /// it WAS. The fatigue fold used to read the plan alone, so a session
    /// logged on a swapped or unscheduled day folded its `noon` reading onto
    /// `midday` instead of `pre`, and a stale legacy row could merge away the
    /// answer the athlete actually gave. A day with a session is a training
    /// day whatever the calendar promised; a day without one is whatever the
    /// calendar says.
    static func isTrainingDay(
        _ db: Database, userId: String, date: String, schedule: ScheduleContext
    ) throws -> Bool {
        if Schedule.isTrainingDayIn(schedule, date) { return true }
        return try WorkoutSession
            .filter(Column("user_id") == userId && Column("date") == date)
            .fetchCount(db) > 0
    }

    /// The plan, phase, dated overrides, weekday layout and catalogue for this
    /// user — the value `Schedule.scheduleDayIn` turns into "today is Upper A".
    /// One assembly (`PlanCatalogue.swift`), shared by the feed, the widget,
    /// the export and the watch bridge, so no two of them can normalise the
    /// plan id or fold the routines differently. `today` is unused since W2
    /// and kept for the callers that pass it.
    public func scheduleContext(userId: String, today: String) throws -> ScheduleContext {
        try scheduleContext(userId: userId)
    }
}
