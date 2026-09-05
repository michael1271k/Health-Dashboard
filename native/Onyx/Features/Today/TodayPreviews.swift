#if DEBUG
import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// Seeded Today screens for `scripts/native-shot.sh`.
///
/// The feed is `OnyxSnapshot.sample` — the same fixture the widget contact
/// sheet renders — so the grid and the Home Screen shots show the same numbers.
enum TodayPreviews {
    static let userId = "00000000-0000-0000-0000-000000000001"

    @MainActor
    static func model(editing: Bool = false, sheet: TodaySheet? = nil) -> TodayModel {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        var layout = Dashboard.defaultLayout(.phone)
        // One stack, so the shot shows the page dots: Sleep over Vitals.
        layout = Dashboard.stackSlots(layout, fromId: "sl-vitals", ontoId: "sl-sleep")
        layout = Dashboard.resizeSlot(layout, slotId: "sl-sleep")
        // Two tiles in the tray, so the gallery has something to offer.
        layout = Dashboard.removeFace(layout, slotId: "sl-consistency", index: 0)
        layout = Dashboard.removeFace(layout, slotId: "sl-cardio", index: 0)
        // Edit mode is photographed with the hero at Medium, so the smalls, the
        // stack and the gallery all fit on one screen.
        if editing { layout = Dashboard.resizeSlot(layout, slotId: "sl-recovery") }
        try? database.saveDashboardLayout(userId: userId, layout)

        let snapshot = OnyxSnapshot.sample
        let readiness = ScheduleReadiness.apply(
            ReadinessResult(level: .trainHard, label: "Train Hard", color: "#3E9E7A", reason: "Sleep, battery, and recovery are all strong today."),
            ScheduleReadinessContext(dayLabel: snapshot.workout.isRestDay ? nil : snapshot.workout.label, workoutToday: snapshot.workout.logged, contextMode: "normal", reentry: false)
        )
        let feed = TodayFeed(
            snapshot: snapshot,
            readiness: readiness,
            goalBoard: GoalBoard(
                ratePerWeekKg: -0.46, trendWeightKg: 68.4,
                targetRateMinKgWk: -0.50, targetRateMaxKgWk: -0.40,
                targetWeightKg: 62, weeksToTarget: 9.6, etaISO: "2026-11-08",
                weekBalanceKcal: -2_310, weekDaysCounted: 4, pace: .onTrack
            ),
            weekSoFar: WeekSoFarSummary(
                weekStart: "2026-08-30", weekNumber: 7, dayOfWeek: 5,
                current: WeekTotals(volumeKg: 24_120, sessions: 3, sleepMin: 442, score: 78),
                previous: WeekTotals(volumeKg: 22_800, sessions: 3, sleepMin: 431, score: 74),
                change: WeekChange(label: "Tonnage", text: "+6%", direction: .up, good: true),
                sessionTarget: 5
            ),
            weeklySummaryReady: false,
            lastWeekStart: "2026-08-23"
        )
        let model = TodayModel(database: database, userId: userId, feed: feed, layout: layout)
        model.editing = editing
        model.sheet = sheet
        return model
    }

    @MainActor
    private static var weighInEnvironment: AppEnvironment {
        let environment = AppEnvironment.preview
        environment.seedWeighInPendingForPreview()
        return environment
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "today-edit":
            NavigationStack { TodayTabView(seeded: model(editing: true)) }.environment(AppEnvironment.preview)
        // The two sheets §5.1 rewrote. Both are photographed because both were
        // the same bug — a sheet repeating its own content — and a regression in
        // either is invisible in a diff and obvious in a PNG.
        case "today-sheet":
            NavigationStack { TodayTabView(seeded: model(sheet: .tile(.sleep))) }.environment(AppEnvironment.preview)
        case "today-sheet-vitals":
            NavigationStack { TodayTabView(seeded: model(sheet: .tile(.vitals))) }.environment(AppEnvironment.preview)
        // The weigh-in banner (§W5.4): Health landed a weight and the InBody
        // numbers it cannot know are still blank.
        // The Goal Board's three states. It lives under the grid on Today, which
        // is below the fold in a screenshot, so it gets a contact sheet of its
        // own — the states are the point and one of them is always wrong.
        case "today-board":
            VStack(spacing: OnyxSpace.m) {
                GoalBoardRow(board: GoalBoard(
                    ratePerWeekKg: -0.46, trendWeightKg: 68.4,
                    targetRateMinKgWk: -0.50, targetRateMaxKgWk: -0.40,
                    targetWeightKg: 62, weeksToTarget: 9.6, etaISO: "2026-11-08",
                    weekBalanceKcal: -2_310, weekDaysCounted: 4, pace: .onTrack
                ))
                GoalBoardRow(board: GoalBoard(
                    ratePerWeekKg: 0.12, trendWeightKg: 68.4,
                    targetRateMinKgWk: -0.50, targetRateMaxKgWk: -0.40,
                    targetWeightKg: 62,
                    weekBalanceKcal: 1_140, weekDaysCounted: 6, pace: .reversed
                ))
                GoalBoardRow(board: GoalBoard(
                    targetRateMinKgWk: -0.50, targetRateMaxKgWk: -0.40, targetWeightKg: 62
                ))
                Spacer(minLength: 0)
            }
            .padding(OnyxSpace.l)
            .onyxScreen(.recover)
        case "today-weighin":
            NavigationStack { TodayTabView(seeded: model()) }.environment(weighInEnvironment)
        default:
            NavigationStack { TodayTabView(seeded: model()) }.environment(AppEnvironment.preview)
        }
    }
}
#endif
