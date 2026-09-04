#if DEBUG
import SwiftUI
import HelixCore
import HelixData
import HelixUI

/// Seeded Today screens for `scripts/native-shot.sh`.
///
/// The feed is `HelixSnapshot.sample` — the same fixture the widget contact
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

        let snapshot = HelixSnapshot.sample
        let readiness = ScheduleReadiness.apply(
            ReadinessResult(level: .trainHard, label: "Train Hard", color: "#3E9E7A", reason: "Sleep, battery, and recovery are all strong today."),
            ScheduleReadinessContext(dayLabel: snapshot.workout.isRestDay ? nil : snapshot.workout.label, workoutToday: snapshot.workout.logged, contextMode: "normal", reentry: false)
        )
        let feed = TodayFeed(
            snapshot: snapshot,
            readiness: readiness,
            insights: [
                Insight(id: "sleep-volume", headline: "Sleep is carrying your volume", detail: "Nights over 7 h precede your three heaviest sessions this month (r = 0.71).", tone: .positive, confidence: 0.82),
                Insight(id: "rhr-drift", headline: "Resting heart rate is drifting up", detail: "Seven-day mean is 4 bpm above the month — recovery is lagging the load.", tone: .caution, confidence: 0.64),
            ],
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

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "today-edit":
            NavigationStack { TodayTabView(seeded: model(editing: true)) }.environment(AppEnvironment.preview)
        case "today-sheet":
            NavigationStack { TodayTabView(seeded: model(sheet: .tile(.recovery))) }.environment(AppEnvironment.preview)
        default:
            NavigationStack { TodayTabView(seeded: model()) }.environment(AppEnvironment.preview)
        }
    }
}
#endif
