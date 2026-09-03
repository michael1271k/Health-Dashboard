#if DEBUG
import SwiftUI
import HelixCore
import HelixData

/// Seeded Day screens for `#Preview` and `scripts/native-shot.sh`.
///
/// Every store is in-memory and written through the same `DayEditing` API the
/// screen uses, so a shot exercises the read path end to end. The date is
/// FIXED — a Tuesday, a Helix-5 training day — so the shot does not become a
/// rest-day layout on Wednesdays or churn its title daily.
enum DayPreviews {

    static let userId = "00000000-0000-0000-0000-000000000001"
    /// Tue 1 Sept 2026 — Helix-5 trains Sun/Mon/Tue/Thu/Fri.
    static let date = "2026-09-01"

    @MainActor
    static func model(_ seed: (AppDatabase) throws -> Void = { _ in }) -> DayModel {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        try? database.editUserGoals(userId: userId) { row in
            row.activePlan = "apex51"
            row.activePhase = ProgramPhase.cut.rawValue
            row.sleepGoalHours = 8
        }
        try? seed(database)
        return DayModel(database: database, userId: userId, date: date)
    }

    /// A full training day.
    @MainActor
    static func fullDay() -> DayModel {
        model { db in
            // Nine nights ending on the date: 3.2 h of decayed debt.
            for (i, minutes) in [400, 420, 500, 430, 480, 510, 460, 440, 490].enumerated() {
                let d = ISODate.addDays(date, -i) ?? date
                try db.editDailyLog(userId: userId, date: d) { $0.sleepMinutes = minutes }
            }
            // The night itself, with stages: 6 h 40 m asleep.
            let noon = LogicalDay.date(fromISO: date)!
            var cursor = noon.addingTimeInterval(-(12 * 60 + 40) * 60)   // 23:20 the evening before
            var samples: [SleepSample] = []
            for (stage, minutes) in [(3, 60), (4, 40), (3, 50), (5, 45), (2, 10), (3, 60), (4, 35), (3, 50), (5, 45), (2, 10), (3, 15)] {
                let end = cursor.addingTimeInterval(Double(minutes) * 60)
                samples.append(SleepSample(value: stage, start: cursor, end: end))
                cursor = end
            }
            try db.ingest(HealthPayload(date: date, sleep: Sleep.aggregate(samples)), userId: userId)

            try db.setFatigue(userId: userId, date: date, slot: FatigueSlot.waking.rawValue, level: 2)
            try db.setFatigue(userId: userId, date: date, slot: FatigueSlot.pre.rawValue, level: 3)
            try db.setDoms(userId: userId, date: date, muscleGroup: "Quads", severity: 2)
            try db.setDoms(userId: userId, date: date, muscleGroup: "Chest", severity: 1)
            try db.setSupplementSkipped(
                userId: userId, date: date, itemKey: "caffeine", skipped: true,
                dueAt: DayModel.localInstant(date, hhmm: "11:45")
            )
            try db.addCardio(CardioLogRow(
                id: newHelixID(), userId: userId, date: date, kind: "walk",
                distanceM: 4200, durationMin: 45, fromHealthkit: false, createdAt: Date(),
                activeKcal: 285, avgHr: 118, effort: 4, inclinePct: 12
            ))
            try db.saveBodyMetrics(userId: userId, date: date) { row in
                row.weightKg = 64.8; row.bodyFatPct = 15.2; row.musclePercent = 77.6
                row.waterPercent = 58.4; row.boneMineral = 4.1; row.visceralFat = 5
                row.bmr = 1540; row.bmi = 21.3; row.skeletalMuscleMassKg = 27.1
                row.estimatedWaistToHipRatio = 0.86
                row.muscleMassKg = 50.3; row.fatMassKg = 9.85; row.fatFreeMassKg = 54.95
            }
        }
    }

    /// Nothing logged, but a reading three days earlier for the form to offer.
    @MainActor
    static func withHistory() -> DayModel {
        model { db in
            try db.saveBodyMetrics(userId: userId, date: ISODate.addDays(date, -3) ?? date) { row in
                row.weightKg = 65.1; row.bodyFatPct = 15.6; row.musclePercent = 77.2
                row.waterPercent = 58.0; row.boneMineral = 4.1; row.visceralFat = 5
                row.bmr = 1545; row.bmi = 21.4; row.skeletalMuscleMassKg = 27.0
                row.estimatedWaistToHipRatio = 0.87
            }
        }
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "day":
            NavigationStack { DayTabView(seeded: fullDay()) }
                .environment(AppEnvironment.preview)
        case "day-empty":
            NavigationStack { DayTabView(seeded: model()) }
                .environment(AppEnvironment.preview)
        case "day-inbody":
            Presenting(model: withHistory()) { InBodyEntryView(model: $0) }
                .environment(AppEnvironment.preview)
        case "day-swap":
            Presenting(model: fullDay()) { SwapDaySheet(model: $0) }
                .environment(AppEnvironment.preview)
        default:
            ContentUnavailableView("No Day screen named \(screen)", systemImage: "questionmark.square.dashed")
        }
    }

    /// The screen with one of its sheets already up.
    private struct Presenting<Sheet: View>: View {
        let model: DayModel
        @ViewBuilder let sheet: (DayModel) -> Sheet
        @State private var shown = true

        var body: some View {
            NavigationStack { DayTabView(seeded: model) }
                .sheet(isPresented: $shown) { sheet(model) }
        }
    }
}

#Preview("Day — full") { DayPreviews.view("day") }
#Preview("Day — empty") { DayPreviews.view("day-empty") }
#Preview("Day — InBody") { DayPreviews.view("day-inbody") }
#Preview("Day — swap") { DayPreviews.view("day-swap") }
#endif
