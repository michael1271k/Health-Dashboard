#if DEBUG
import SwiftUI
import GRDB
import OnyxUI
import OnyxCore
import OnyxData

/// Seeded Pulse screens for `#Preview` and `scripts/native-shot.sh`.
///
/// Every store is in-memory and written through the same `DayEditing` API the
/// screen uses, so a shot exercises the read path end to end. The date is
/// FIXED — a Tuesday, a Onyx-5 training day — so the shot does not become a
/// rest-day layout on Wednesdays or churn its title daily.
enum PulsePreviews {

    static let userId = "00000000-0000-0000-0000-000000000001"
    /// Tue 1 Sept 2026 — Onyx-5 trains Sun/Mon/Tue/Thu/Fri.
    static let date = "2026-09-01"

    @MainActor
    static func model(_ seed: (AppDatabase) throws -> Void = { _ in }) -> DayModel {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        try? database.editUserGoals(userId: userId) { row in
            row.activePlan = "onyx5"
            row.activePhase = ProgramPhase.cut.rawValue
            row.sleepGoalHours = 8
            row.calorieGoal = 1955
            row.proteinGoalG = 170
        }
        try? seed(database)
        return DayModel(database: database, userId: userId, date: date)
    }

    /// A full training day.
    ///
    /// `withSession` adds the workout that was actually performed, which is
    /// what separates the `day` shot from `day-past`: the Workout summary card
    /// only exists when the day HAS a finished session, and a shot of the
    /// screen without one would never photograph it.
    @MainActor
    static func fullDay(withSession: Bool = false) -> DayModel {
        model { db in
            if withSession { try seedSession(db) }
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
                id: newOnyxID(), userId: userId, date: date, kind: "walk",
                distanceM: 4200, durationMin: 45, fromHealthkit: false, createdAt: Date(),
                activeKcal: 285, avgHr: 118, effort: 4, inclinePct: 12
            ))
            // The fortnight behind the date: every vital needs a BASELINE or
            // its row draws a reading with no delta and no sparkline, which is
            // exactly the half of this screen a shot has to prove.
            let hrv: [Double] =   [48, 51, 44, 47, 53, 49, 46, 50, 45, 52, 47, 43, 49, 41]
            let rest: [Int] =     [52, 51, 54, 53, 50, 52, 55, 51, 53, 52, 50, 54, 52, 56]
            let resp: [Double] =  [14.2, 14.0, 14.6, 14.1, 13.9, 14.3, 14.8, 14.2, 14.4, 14.1, 14.0, 14.5, 14.2, 15.1]
            let spo2: [Double] =  [97.4, 97.1, 96.8, 97.3, 97.6, 97.2, 96.9, 97.5, 97.0, 97.3, 97.4, 96.7, 97.2, 96.6]
            let temp: [Double] =  [-0.08, 0.02, 0.14, -0.03, 0.05, 0.11, 0.21, -0.02, 0.07, 0.03, -0.05, 0.16, 0.04, 0.27]
            let steps: [Int] =    [9120, 11040, 7480, 10230, 12560, 8890, 6740, 10410, 9330, 11870, 8060, 7210, 10980, 8430]
            let stand: [Int] =    [11, 12, 9, 12, 13, 10, 8, 12, 11, 13, 10, 9, 12, 10]
            let active: [Double] = [612, 704, 488, 668, 792, 574, 431, 683, 596, 741, 512, 466, 715, 548]
            for i in 0..<14 {
                let d = ISODate.addDays(date, -(13 - i)) ?? date
                try db.editDailyLog(userId: userId, date: d) { row in
                    row.hrvMs = hrv[i]
                    row.avgRestHeartRate = rest[i]
                    row.respiratoryRate = resp[i]
                    row.bloodOxygen = spo2[i]
                    row.wristTempDelta = temp[i]
                    row.steps = steps[i]
                    row.standHours = stand[i]
                    row.activeEnergy = active[i]
                }
            }
            try db.editDailyLog(userId: userId, date: date) { $0.waterMl = 2100 }
            // 1,420 kcal against macros that come to 1,450 — Health's own
            // figure, kept (memory `no-ai-in-app`'s sibling in `MacroEditSheet`).
            try db.setManualMacros(
                userId: userId, date: date,
                calories: 1420, proteinG: 128, carbsG: 132, fatG: 46, phase: ProgramPhase.cut.rawValue
            )
            try db.seedRows { db in
                try DailyScoreRow(
                    id: newOnyxID(), userId: userId, date: date, score: 78,
                    sleepScore: 71, nutritionScore: 84, activityScore: 76,
                    workoutScore: 88, recoveryScore: 69, batteryPct: 64,
                    computedAt: Date(), finalized: false
                ).insert(db)
            }

            try db.saveBodyMetrics(userId: userId, date: date) { row in
                row.weightKg = 64.8; row.bodyFatPct = 15.2; row.musclePercent = 77.6
                row.waterPercent = 58.4; row.boneMineral = 4.1; row.visceralFat = 5
                row.bmr = 1540; row.bmi = 21.3; row.skeletalMuscleMassKg = 27.1
                row.estimatedWaistToHipRatio = 0.86
                row.muscleMassKg = 50.3; row.fatMassKg = 9.85; row.fatFreeMassKg = 54.95
            }
        }
    }

    /// One finished Legs & Core A, on the seeded date.
    ///
    /// Written as raw rows rather than through the logger: the card reads
    /// `workout_sessions` and `workout_sets` and nothing else, and a seed that
    /// drove the whole logger would be photographing the logger.
    private static func seedSession(_ db: AppDatabase) throws {
        let lifts: [(name: String, kg: Double, reps: Int)] = [
            ("Leg Press", 92, 10), ("Hack Squat", 60, 10), ("Leg Extension", 45, 12),
            ("Seated Leg Curl", 45, 12), ("Calf Press", 67.5, 15),
        ]
        try db.seedRows { db in
            let sessionId = newOnyxID()
            let noon = LogicalDay.date(fromISO: date)!
            try WorkoutSession(
                id: sessionId, userId: userId, dayKey: "legs_a", date: date,
                startedAt: noon.addingTimeInterval(-3 * 3600),
                endedAt: noon.addingTimeInterval(-3 * 3600 + 68 * 60),
                durationMin: 68, sessionRpe: 8
            ).insert(db)
            var index = 0
            for lift in lifts {
                let exerciseId = newOnyxID()
                try Exercise(id: exerciseId, name: lift.name).insert(db)
                // A warm-up and three working sets: the warm-up is what proves
                // the card counts working sets rather than rows.
                for set in 0..<4 {
                    let load = set == 0 ? lift.kg * 0.6 : lift.kg
                    try WorkoutSet(
                        id: newOnyxID(), sessionId: sessionId, exerciseId: exerciseId,
                        setIndex: index, weightKg: load, reps: lift.reps,
                        setType: set == 0 ? "warmup" : "normal", side: nil, pairId: nil,
                        est1rmKg: Epley.oneRepMax(weight: load, reps: Double(lift.reps)),
                        foldOrder: index
                    ).insert(db)
                    index += 1
                }
            }
        }
    }

    /// A stack with every state on it at once: one due, one explicitly taken,
    /// one skipped, two still ahead, and one archived.
    ///
    /// The clock is PINNED to 13:00 rather than read, so the Due and Later
    /// sections hold the same rows whatever time the loop runs.
    @MainActor
    static func stackDay() -> DayModel {
        let model = model { db in
            let add = { (name: String, dose: String, time: String, key: String, micros: [String: Double]?) in
                _ = try db.addCustomSupplement(
                    userId: userId, name: name, dose: dose, color: nil, form: nil, time: time,
                    schedule: CustomSchedule(key: key, slot: time == "10:30" ? "Morning" : "Before Bed"),
                    micros: micros
                )
            }
            try add("Two Per Day Multivitamin", "2 tabs", "10:30", "multivitamin", nil)
            try add("Vitamin D3 + K2", "125 mcg", "10:30", "d3k2", nil)
            try add("Creatine Monohydrate", "5 g", "10:30", "creatine", nil)
            try add("Magnesium Glycinate", "300 mg", "22:00", "magnesium", nil)
            try add("L-Theanine", "200 mg", "22:00", "theanine", nil)

            let retired = try db.addCustomSupplement(
                userId: userId, name: "Ashwagandha", dose: "600 mg", time: "22:00",
                schedule: CustomSchedule(key: "ashwagandha")
            )
            try db.setCustomSupplementArchived(id: retired, userId: userId, archived: true, at: Date(timeIntervalSince1970: 1_756_000_000))

            try db.markSupplement(userId: userId, date: date, itemKey: "d3k2", mark: .taken)
            try db.markSupplement(userId: userId, date: date, itemKey: "creatine", mark: .skipped)
        }
        model.previewNowMinutes = 13 * 60
        return model
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
            NavigationStack { PulseTabView(seeded: fullDay()) }
                .environment(AppEnvironment.preview)
        case "day-rows":
            NavigationStack { PulseTabView(seeded: fullDay(), startAtRows: true) }
                .environment(AppEnvironment.preview)
        // A day with the session on it, parked on the bottom half — which is
        // where the Workout summary card and the four rows are. The rows
        // section is the last content on the screen, so scrolling to it clamps
        // to the end and the card comes with it.
        case "day-past":
            NavigationStack { PulseTabView(seeded: fullDay(withSession: true), startAtRows: true) }
                .environment(AppEnvironment.preview)
        case "day-empty":
            NavigationStack { PulseTabView(seeded: model()) }
                .environment(AppEnvironment.preview)
        // Named for what it is rather than for where it opens from: the shot
        // list called this `day-inbody` and the plan's gate calls it `scale`,
        // and two names for one screen is the drift this file exists to stop.
        case "scale":
            Presenting(model: withHistory()) { InBodyEntryView(model: $0) }
                .environment(AppEnvironment.preview)
        // The same form with nothing behind it — the nil-history path, where
        // "Fill from last time" has nothing to copy and says so.
        case "scale-first":
            Presenting(model: model()) { InBodyEntryView(model: $0) }
                .environment(AppEnvironment.preview)
        case "day-swap":
            Presenting(model: fullDay()) { SwapDaySheet(model: $0) }
                .environment(AppEnvironment.preview)
        case "stack":
            Observing(model: stackDay()) { StackView(model: $0) }
                .environment(AppEnvironment.preview)
        case "stack-add":
            Presenting(model: stackDay()) { SupplementEditSheet(model: $0, editing: nil) }
                .environment(AppEnvironment.preview)
        case "doms":
            // The tile alone, at the size it actually gets: half of what §5.7
            // asks of it — the severity tints, the flip, the hit targets — is
            // below the fold on the full screen and cannot be photographed
            // there.
            DomsOnly()
                .environment(AppEnvironment.preview)
        default:
            ContentUnavailableView("No Day screen named \(screen)", systemImage: "questionmark.square.dashed")
        }
    }

    /// The soreness tile on its own ground, observed — the ratings arrive on a
    /// GRDB stream, and a tile handed an unobserved model draws an untouched
    /// body no matter what the seed wrote.
    private struct DomsOnly: View {
        /// Built ONCE and kept: the harness re-evaluates its switch on every
        /// observation tick, and a fresh model each time is a model whose
        /// streams never get past their first yield.
        @State private var model: DayModel?

        var body: some View {
            NavigationStack {
                ScrollView {
                    if let model {
                        DomsTile(model: model).padding(OnyxSpace.l)
                    }
                }
                .onyxScreen(.recover)
                .navigationTitle("Soreness")
                .navigationBarTitleDisplayMode(.inline)
            }
            .task {
                if model == nil { model = PulsePreviews.fullDay() }
                await model?.observe()
            }
        }
    }

    /// The screen with one of its sheets already up.
    /// A screen the tab PUSHES, rendered on its own. It needs the model's
    /// streams running — `PulseTabView` is what normally starts them, and a
    /// pushed screen photographed without it draws the seed protocol instead of
    /// the store's own stack.
    private struct Observing<Content: View>: View {
        /// `@State`, not a `let`: the harness rebuilds this view's arguments on
        /// every pass, so a stored model would be a NEW in-memory database each
        /// time and the streams would restart against a store the previous
        /// render seeded. The first one wins and keeps its rows.
        @State private var model: DayModel
        @ViewBuilder let content: (DayModel) -> Content

        init(model: DayModel, @ViewBuilder content: @escaping (DayModel) -> Content) {
            _model = State(initialValue: model)
            self.content = content
        }

        var body: some View {
            NavigationStack { content(model) }
                .task { await model.observe() }
        }
    }

    private struct Presenting<Sheet: View>: View {
        let model: DayModel
        @ViewBuilder let sheet: (DayModel) -> Sheet
        @State private var shown = true

        var body: some View {
            NavigationStack { PulseTabView(seeded: model) }
                .sheet(isPresented: $shown) { sheet(model) }
        }
    }
}

#Preview("Pulse — full") { PulsePreviews.view("day") }
#Preview("Pulse — past") { PulsePreviews.view("day-past") }
#Preview("Pulse — empty") { PulsePreviews.view("day-empty") }
#Preview("Pulse — InBody") { PulsePreviews.view("scale") }
#Preview("Pulse — swap") { PulsePreviews.view("day-swap") }
#endif
