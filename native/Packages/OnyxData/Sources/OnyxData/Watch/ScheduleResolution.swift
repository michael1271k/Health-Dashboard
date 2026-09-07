import Foundation
import OnyxCore

extension AppDatabase {

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
