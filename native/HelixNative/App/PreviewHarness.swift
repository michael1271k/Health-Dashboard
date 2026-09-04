#if DEBUG
import SwiftUI
import HelixCore
import HelixData

/// One screen, seeded, for `scripts/native-shot.sh`.
///
/// ── WHY THE SHOT LOOP NEEDS A DOOR AT ALL ───────────────────────────────────
/// A screenshot of a settings screen is only useful if it shows the same numbers
/// every time. Reaching the real You tab means signing in, which means network,
/// a live database and whatever this week's training happens to look like — so
/// the diff in `native/__screenshots__` would be a diff of the data, not of the
/// design, and would churn on every run.
///
/// This launches straight into one screen backed by an in-memory database that
/// holds exactly what the shot is demonstrating. `#if DEBUG`, and reached only
/// through a launch argument, so it cannot ship and cannot be stumbled into.
enum PreviewHarness {

    /// `--helix-screen you` on the launch command line.
    static var requestedScreen: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--helix-screen"),
              index + 1 < arguments.count
        else { return nil }
        return arguments[index + 1]
    }

    /// A store holding one plausible week of settings.
    ///
    /// The figures are the live block's: Lever 1 is not selected, so the screens
    /// show the user's own numbers — the state with the most controls visible,
    /// which is the one worth photographing.
    @MainActor
    static func seededModel() -> YouModel {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        let userId = "00000000-0000-0000-0000-000000000001"
        try? database.editUserGoals(userId: userId) { row in
            row.calorieGoal = 1955
            row.proteinGoalG = 170
            row.carbsGoalG = 195
            row.fatGoalG = 55
            row.stepsGoal = 10000
            row.activeCalGoal = 500
            row.sleepGoalHours = 8
            row.waterGoalMl = 3000
            row.activeLever = LeverId.custom.rawValue
            row.activePlan = "apex51"
            row.activePhase = ProgramPhase.cut.rawValue
            row.unitSystem = "kg"
            row.weekEndDay = 6
            row.trackRpe = true
            row.targetWeightKg = 62
            row.targetBodyFatPct = 13
            row.targetMuscleMassKg = 33
        }
        try? database.editPlanPhaseGoals(userId: userId, planId: "apex51", phase: "cut") { row in
            row.kcal = 1955
            row.proteinG = 170
            row.carbsG = 195
            row.fatG = 55
            row.stepsGoal = 10000
            row.targetWeightKg = 62
        }
        return YouModel(database: database, userId: userId)
    }

    /// A week of real movements, one per display group, so the library shot
    /// exercises every heading and the detail shot lands on a lift with both a
    /// primary and an assisting muscle.
    ///
    /// Six of them carry the ids of the movements the history seed actually holds sets for
    /// (`HistoryPreviews`), so the library shot draws REAL sparklines on those
    /// rows and honest blanks on the rest — which is what the screen looks like
    /// for anyone who has trained a movement once.
    static let sampleExercises: [ExerciseCatalogEntry] = [
        .init(id: "ex-incline", name: "Incline DB Press", setCount: 48, lastTrained: "2026-09-02"),
        .init(id: "2", name: "Pec Deck", setCount: 30, lastTrained: "2026-09-01"),
        .init(id: "ex-pulldown", name: "Lat Pulldown", setCount: 36, lastTrained: "2026-09-02"),
        .init(id: "ex-row", name: "Seated Cable Row (Wide Grip)", setCount: 22, lastTrained: "2026-09-02"),
        .init(id: "5", name: "DB Shoulder Press", setCount: 27, lastTrained: "2026-09-02"),
        .init(id: "ex-raise", name: "Single Arm Lateral Raise (Cable)", setCount: 41, lastTrained: "2026-09-02"),
        .init(id: "7", name: "Rope Triceps Pushdown", setCount: 33, lastTrained: "2026-08-30"),
        .init(id: "8", name: "Seated Incline DB Curl", setCount: 26, lastTrained: "2026-08-30"),
        .init(id: "ex-hack", name: "Hack Squat", setCount: 24, lastTrained: "2026-08-30"),
        .init(id: "10", name: "Seated Leg Curl", setCount: 21, lastTrained: "2026-08-29"),
        .init(id: "11", name: "Calf Press", setCount: 30, lastTrained: "2026-08-29"),
        .init(id: "ex-hkr", name: "Hanging Knee Raise", setCount: 18, lastTrained: "2026-09-02"),
    ]

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        let model = seededModel()
        switch screen {
        case "signin":
            SignInView().environment(AppEnvironment.preview)
        case "backfill":
            BackfillSheet(model: .preview).environment(AppEnvironment.preview)
        case "you":
            NavigationStack { YouTabView(seeded: model) }.environment(AppEnvironment.preview)
        case "train":
            // Seeded from the history store: the This-week panel and the
            // Ready-to-progress box are both reads over the ledger, so an empty
            // database photographs the empty states rather than the screen.
            HistoryPreviews.view("train")
        case "levers":
            NavigationStack { LeversView(model: model) }
        case "plan":
            NavigationStack { PlanView(model: model) }
        case "body":
            NavigationStack { BodyTargetsView(model: model) }
        case "volume":
            NavigationStack { VolumeTargetsView(model: model) }
        case "library":
            HistoryPreviews.view("library")
        case "exercise":
            NavigationStack {
                ExerciseDetailView(entry: sampleExercises[3], siblings: sampleExercises)
            }
            .environment(HistoryPreviews.environment())
        case "reports":
            NavigationStack { ReportsListView(seeded: PreviewReport.rows) }
                .environment(AppEnvironment.preview)
        case "report":
            NavigationStack {
                ReportReaderView(report: PreviewReport.rows[0], seededBody: PreviewReport.body)
            }
            .environment(AppEnvironment.preview)
        case "day", "day-empty", "day-inbody", "day-swap":
            DayPreviews.view(screen)
        case "fuel", "fuel-over", "fuel-empty", "nutrients", "macro-edit":
            NutritionPreviews.view(screen)
        case "logger", "logger-finish":
            LoggerPreviews.view(screen)
        case "today", "today-edit", "today-sheet", "today-sheet-vitals":
            TodayPreviews.view(screen)
        case "history", "session", "session-ledger", "exercise-history":
            HistoryPreviews.view(screen)
        case "trends", "trends-empty":
            TrendsPreviews.view(screen)
        case "body-trends", "body-trends-empty":
            BodyTrendsPreviews.view(screen)
        case "pathfinder", "pathfinder-empty":
            PathfinderPreviews.view(screen)
        case let s where s.hasPrefix("widgets"):
            WidgetPreviews.view(s)
        default:
            // Visible rather than silent: a typo in the shot script should
            // produce a photograph of the mistake, not of the last screen.
            ContentUnavailableView(
                "No harness screen named \(screen)",
                systemImage: "questionmark.square.dashed"
            )
        }
    }
}
#endif
