#if DEBUG
import SwiftUI
import OnyxCore
import OnyxData

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

    /// `--onyx-screen you` on the launch command line.
    static var requestedScreen: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--onyx-screen"),
              index + 1 < arguments.count
        else { return nil }
        return arguments[index + 1]
    }

    /// A store holding one plausible week of settings.
    ///
    /// The figures are the live block's: Lever 1 is not selected, so the screens
    /// show the user's own numbers — the state with the most controls visible,
    /// which is the one worth photographing.
    /// Built once: `view(_:)` is a `@ViewBuilder` and runs on every evaluation,
    /// and a model constructed inside it is a NEW model each time — the
    /// `.task { model.observe() }` then observes an instance the rendered view
    /// no longer holds, which since W2 (the catalogue arrives by observation)
    /// photographed an empty plan and no rungs.
    @MainActor static let sharedSettingsModel: SettingsModel = seededModel()

    @MainActor
    static func seededModel() -> SettingsModel {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        // The catalogue as rows (W2): decks, plans, phases, rungs.
        PreviewCatalogue.seed(database)
        let userId = "00000000-0000-0000-0000-000000000001"
        _ = try? database.editUserGoals(userId: userId) { row in
            row.calorieGoal = 1955
            row.proteinGoalG = 170
            row.carbsGoalG = 195
            row.fatGoalG = 55
            row.stepsGoal = 10000
            row.activeCalGoal = 500
            row.sleepGoalHours = 8
            row.waterGoalMl = 3000
            row.activeLever = "custom"
            row.activePlan = "onyx5"
            row.activePhase = ProgramPhase.cut.rawValue
            row.unitSystem = "kg"
            row.weekEndDay = 6
            row.trackRpe = true
            row.targetWeightKg = 62
            row.targetBodyFatPct = 13
            row.targetMuscleMassKg = 33
        }
        _ = try? database.editPlanPhaseGoals(userId: userId, planId: "onyx5", phase: "cut") { row in
            row.kcal = 1955
            row.proteinG = 170
            row.carbsG = 195
            row.fatG = 55
            row.stepsGoal = 10000
            row.targetWeightKg = 62
        }
        return SettingsModel(database: database, userId: userId)
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
        .init(id: "5", name: "Shoulder Press", setCount: 27, lastTrained: "2026-09-02"),
        .init(id: "ex-raise", name: "Single Arm Lateral Raise", setCount: 41, lastTrained: "2026-09-02"),
        .init(id: "7", name: "Rope Triceps Pushdown", setCount: 33, lastTrained: "2026-08-30"),
        .init(id: "8", name: "Seated Incline DB Curl", setCount: 26, lastTrained: "2026-08-30"),
        .init(id: "ex-hack", name: "Hack Squat", setCount: 24, lastTrained: "2026-08-30"),
        .init(id: "10", name: "Seated Leg Curl", setCount: 21, lastTrained: "2026-08-29"),
        .init(id: "11", name: "Calf Press", setCount: 30, lastTrained: "2026-08-29"),
        .init(id: "ex-hkr", name: "Hanging Knee Raise", setCount: 18, lastTrained: "2026-09-02"),
    ]

    /// A morning walk and a lunchtime ride, as Health would hand them over.
    ///
    /// One of each shape the card has to survive: a bout with everything
    /// (distance, pace, heart rate, ascent, energy) and one with no ascent,
    /// because an indoor ride records none and the card must not print a dash
    /// for it. Times are absolute so the shot does not move with the clock.
    static let sampleBouts: [WorkoutSample] = {
        let day = LogicalDay.date(fromISO: "2026-09-03") ?? Date()
        let at: (Int, Int) -> Date = { hour, minute in
            Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
        }
        return [
            WorkoutSample(
                start: at(7, 12), end: at(7, 53), isLifting: false,
                cardioKind: CardioImport.walk, distanceM: 4_240, activeKcal: 218,
                avgHr: 112, elevationM: 38
            ),
            WorkoutSample(
                start: at(12, 40), end: at(13, 18), isLifting: false,
                cardioKind: CardioImport.cycling, distanceM: 14_800, activeKcal: 340,
                avgHr: 131, elevationM: nil
            ),
        ]
    }()

    /// The bout ghosted behind the empty state.
    static let sampleLastBout = CardioLogRow(
        id: "preview-bout", userId: "00000000-0000-0000-0000-000000000001", date: "2026-09-01", kind: CardioImport.walk,
        distanceM: 3_980, durationMin: 39, fromHealthkit: true, createdAt: nil,
        activeKcal: 201, avgHr: 108
    )

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        let model = sharedSettingsModel
        switch screen {
        case "signin":
            SignInView().environment(AppEnvironment.preview)
        case "backfill":
            BackfillSheet(model: .preview).environment(AppEnvironment.preview)
        case "you":
            NavigationStack { SettingsTabView(seeded: model) }.environment(AppEnvironment.preview)
        case "train", "train-empty":
            // Seeded from the history store: the This-week panel and the
            // Ready-to-progress box are both reads over the ledger, so an empty
            // database photographs the empty states rather than the screen.
            HistoryPreviews.view(screen)
        case "sync-status":
            NavigationStack { SyncStatusView(seeded: .preview) }.environment(AppEnvironment.preview)
        // The same screen with every fault it can name — a table behind the
        // server, one ahead, one that could not be counted, two split across
        // user ids, and a rejected write. `sync-status` is the quiet twin, and
        // the pair is the review: a tint means nothing without the state it is
        // a departure from.
        case "sync-doctor":
            NavigationStack { SyncStatusView(seeded: .faults) }.environment(AppEnvironment.preview)
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
        case "day", "day-rows", "day-past", "day-empty", "scale", "scale-first", "day-swap", "doms", "stack", "stack-add",
             "sleep-edit", "stress":
            PulsePreviews.view(screen)
        case "fuel", "fuel-over", "fuel-empty", "nutrients", "macro-edit":
            NutritionPreviews.view(screen)
        case "logger", "logger-stats", "logger-paused", "logger-finish", "logger-options",
             "set-row", "set-row-split", "set-row-cardio", "set-row-records", "set-options", "effort-picker":
            LoggerPreviews.view(screen)
        // ── THE CARDIO SHEET, IN BOTH OF ITS STATES ────────────────────────
        // It had never had a shot, which is most of how it got to look the way
        // it did. It has two now because the screen has two: what it draws when
        // Health has bouts to offer, and what it draws when it has none. The
        // second is the one that used to be four hundred points of black.
        //
        // The bouts are SEEDED rather than read. A HealthKit query on a
        // simulator returns nothing, every time, so a shot of the live read
        // would photograph the empty state twice and call one of them "import".
        case "cardio":
            CardioLogSheet(
                userId: "preview", date: "2026-09-03", onSave: { _ in true },
                bouts: { PreviewHarness.sampleBouts }
            )
            .environment(AppEnvironment.preview)
        case "cardio-empty":
            CardioLogSheet(
                userId: "preview", date: "2026-09-03", onSave: { _ in true },
                bouts: { [] }, lastBout: PreviewHarness.sampleLastBout
            )
            .environment(AppEnvironment.preview)
        case "today", "today-edit", "today-sheet", "today-sheet-vitals",
             "today-sheet-steps", "today-sheet-muscle", "today-sheet-records",
             "today-weighin", "today-board":
            TodayPreviews.view(screen)
        case "history", "history-week", "session", "session-ledger", "exercise-history",
             "session-atlas", "session-edit":
            HistoryPreviews.view(screen)
        case "trends", "trends-empty", "trends-maintenance":
            TrendsPreviews.view(screen)
        case "body-trends", "body-trends-empty", "body-trends-tooltip", "body-trends-stress":
            BodyTrendsPreviews.view(screen)
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
