import Foundation
import GRDB
import OnyxCore

extension AppDatabase {

    /// The same four stored values, read straight off an OPEN transaction.
    ///
    /// The instance method below borrows `WidgetSnapshotBuilder.fetch`, which
    /// is the right trade when the caller wanted the whole snapshot anyway and
    /// the wrong one for a caller that wants a single boolean: that fetch is a
    /// fortnight of metrics, sleep, water and sessions. `StressInputsBuilder`
    /// asks fourteen times per series, so it gets this instead — three narrow
    /// reads, and the SAME normalisation, which is the part that has to match.
    static func scheduleContext(_ db: Database, userId: String) throws -> ScheduleContext {
        let user = Column("user_id") == userId
        let goals = try UserGoalRow.filter(user).fetchOne(db)
        let programId = Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram)
            ?? Programs.defaultPlanId
        var overrides: [String: String] = [:]
        for row in try ScheduleOverrideRow.filter(user).fetchAll(db) { overrides[row.date] = row.dayKey }
        let layoutRaw = try ProgramDayLayoutRow
            .filter(user && Column("program_id") == programId)
            .fetchOne(db)?.layout.raw
        return ScheduleContext(
            programId: programId,
            phase: ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset),
            overrides: overrides,
            layout: ScheduleLayout.parseLayout(layoutRaw.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) })
        )
    }

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

    /// The plan, phase, dated overrides and weekday layout for this user — the
    /// value `Schedule.scheduleDayIn` turns into "today is Upper A".
    ///
    /// ── WHY IT IS HERE AND NOT REBUILT BY THE CALLER ────────────────────────
    /// `TodayFeedBuilder` and `WidgetSnapshotBuilder` both assemble this from
    /// the same four stored values, and the watch bridge would have been a
    /// third. Three assemblies of one context is three chances to normalise the
    /// plan id differently, and a watch that resolved `helix5` where the phone
    /// resolved `onyx5` would open a different workout with a straight face.
    ///
    /// `WidgetSnapshotBuilder.fetch` is the one read that already gathers all
    /// four, so this borrows it rather than adding a fifth query shape.
    public func scheduleContext(userId: String, today: String) throws -> ScheduleContext {
        let rows = try WidgetSnapshotBuilder(database: self, userId: userId)
            .fetch(date: today, trendFrom: today)
        let goals = rows.goals
        return ScheduleContext(
            programId: Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram)
                ?? Programs.defaultPlanId,
            phase: ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset),
            overrides: rows.overrides,
            layout: rows.layout
        )
    }
}
