#if DEBUG
import SwiftUI
import GRDB
import OnyxCore
import OnyxData

/// Seeded history screens for `#Preview` and `scripts/native-shot.sh`.
///
/// Six weeks of a Chest & Back A day plus one leg day, written straight into
/// an in-memory store. The last session carries a real record — 42 kg on the
/// incline press clears the asserted 40 kg / 53.3 e1RM floor in `PrTruth` —
/// so the report has a trophy to draw without anyone hand-marking a row.
enum HistoryPreviews {
    static let userId = "00000000-0000-0000-0000-000000000001"
    static let lastSession = "s-2026-09-01"
    static let incline = ExerciseCatalogEntry(id: "ex-incline", name: "Incline DB Press", setCount: 24, lastTrained: "2026-09-01")

    @MainActor
    static func environment() -> AppEnvironment {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        // The catalogue as rows (W2): decks, plans, phases, rungs.
        PreviewCatalogue.seed(database)
        try! database.seedRows(seed)
        return AppEnvironment(
            database: database,
            supabase: OnyxSupabase.makeClient(config: SupabaseConfig(url: URL(string: "https://preview.invalid")!, anonKey: "preview"))
        )
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "session":
            NavigationStack { SessionDetailView(sessionId: lastSession) }.environment(environment())
        case "session-ledger":
            // The same page, parked at the bottom. Half of §5.4 is the ledger,
            // and a shot of the top half reviews only the half that fits.
            NavigationStack { SessionDetailView(sessionId: lastSession, startAtLedger: true) }
                .environment(environment())
        // §U4.4's flip, opened. A sheet cannot be photographed by launching
        // the screen under it, so the harness presents it directly — the same
        // trick `day-swap` uses, and the reason `Presenting` exists.
        case "session-atlas":
            NavigationStack { SessionDetailView(sessionId: lastSession, startAtAtlas: true) }
                .environment(environment())
        // §U4.5's edit mode, re-opened on the logger's own deck. It is the ONLY
        // way to see the edit hero — a shot script can launch a screen and
        // cannot press a toolbar button.
        //
        // The LEG day, not `lastSession`, and now only by habit: `canEdit` used
        // to refuse any session holding L/R pairs, which every Chest & Back
        // session in this fixture does, so the Upper A shot photographed a
        // disabled button. That gate is gone (the logger carries `side` and
        // `pairId` and has for some time — see `SessionDetailView.canEdit`), so
        // either day shoots now. Left on the leg day so the shot is comparable
        // with the ones already in `docs/shots`.
        case "session-edit":
            NavigationStack { SessionDetailView(sessionId: "s-2026-08-30", startAtEditor: true) }
                .environment(environment())
        case "exercise-history":
            // The HISTORY segment — the two-column set grid §W7 rebuilt. The
            // Summary segment is `exercise`.
            NavigationStack {
                ExerciseDetailView(entry: incline, siblings: PreviewHarness.sampleExercises, startOnHistory: true)
            }
            .environment(environment())
        case "train":
            // ── WHY THE DATE IS PINNED ──────────────────────────────────────
            // The This-week panel is a picture of a WEEK, so a shot taken on a
            // Monday and a shot taken on a Friday differ in six cells and the
            // visual diff becomes a diff of the calendar. `2026-09-03` is the
            // Thursday of the seeded week: three sessions behind it, Upper B
            // ahead, and a cardio bout on the Tuesday.
            NavigationStack {
                WorkoutTabView(seededDay: PlanTemplates.program("onyx5")?.day(key: "cb_b"), seededToday: "2026-09-03")
            }
            .environment(environment())
        case "train-empty":
            // A REST day: no session card, no footer CTA, and the cardio card
            // sits where the deck would be — which is the only way to
            // photograph it in full, and the state a Wednesday actually is.
            // `2026-09-05` is the seeded block's Saturday.
            NavigationStack {
                WorkoutTabView(seededToday: "2026-09-05")
            }
            .environment(environment())
        case "library":
            NavigationStack { ExerciseLibraryView(seeded: PreviewHarness.sampleExercises) }
                .environment(environment())
        case "history-week":
            // The seeded block's last full week — the one holding both the
            // Tuesday cardio and the Wednesday swap, so the day rows show a
            // logged day, a swapped day and a rest day in one photograph.
            NavigationStack {
                WeekDaysView(window: WeekWindow(containing: "2026-09-02", startDay: 0))
            }
            .environment(environment())
        default:
            NavigationStack { HistoryView() }.environment(environment())
        }
    }

    // MARK: - Seed

    private static let exercises: [(id: String, name: String)] = [
        ("ex-incline", "Incline DB Press"),
        ("ex-pulldown", "Lat Pulldown"),
        ("ex-row", "Seated Cable Row (Wide Grip)"),
        ("ex-raise", "Single Arm Lateral Raise"),
        ("ex-hkr", "Hanging Knee Raise"),
        ("ex-hack", "Hack Squat"),
        ("ex-treadmill", "Treadmill"),
    ]

    /// (weight, reps) per working set, per session, oldest first.
    private static let chestBack: [(date: String, incline: [(Double, Int)], pulldown: [(Double, Int)], row: [(Double, Int)], raise: [(Double, Int)])] = [
        ("2026-07-28", [(36, 10), (36, 9), (36, 8)],   [(55, 12), (55, 11), (55, 10)], [(45, 12), (45, 12), (45, 11)], [(5, 12), (5, 12)]),
        ("2026-08-04", [(36, 12), (36, 11), (36, 10)], [(55, 12), (55, 12), (55, 11)], [(45, 13), (45, 12), (45, 12)], [(5, 13), (5, 12)]),
        ("2026-08-11", [(38, 10), (38, 9), (38, 9)],   [(60, 10), (60, 10), (60, 9)],  [(47.5, 12), (47.5, 11), (47.5, 10)], [(5, 14), (5, 13)]),
        ("2026-08-18", [(38, 12), (38, 11), (38, 10)], [(60, 12), (60, 11), (60, 10)], [(47.5, 13), (47.5, 12), (47.5, 12)], [(5, 15), (5, 14)]),
        ("2026-08-25", [(40, 10), (40, 10), (40, 9)],  [(60, 12), (60, 12), (60, 12)], [(50, 12), (50, 11), (50, 10)], [(5, 15), (5, 15)]),
        ("2026-09-01", [(42, 10), (42, 9), (40, 12)],  [(65, 10), (65, 10), (65, 9)],  [(50, 13), (50, 12), (50, 12)], [(5, 16), (5, 15)]),
        // Swapped onto the Wednesday rest slot — which is also what makes the
        // Workout tab's Ready-to-progress box non-empty: the wide-grip row has
        // now cleared its 10–12 window at 50 kg TWICE, and the lateral raise has
        // cleared its 15–20 window once. One green row, one gold.
        ("2026-09-02", [(42, 11), (42, 10), (42, 10)],  [(65, 11), (65, 10), (65, 10)], [(50, 12), (50, 13), (50, 12)], [(5, 21), (5, 22)]),
    ]

    @Sendable
    private static func seed(_ db: Database) throws {
        for e in exercises { try Exercise(id: e.id, name: e.name).insert(db) }

        for (n, s) in chestBack.enumerated() {
            let id = "s-\(s.date)"
            let start = LogicalDay.date(fromISO: s.date)!.addingTimeInterval(17 * 3600)
            // ── HEART RATE AND CALORIES, MEASURED ON THE LAST SESSION ───
            // The metric grid has four provenance states and could photograph
            // only one: `SessionPage` hard-coded `avgBpm: nil` and always
            // estimated the calories, so every shot showed "—" and "no weight"
            // and the measured case — the one the watch actually produces, and
            // the one the Calories cell overflowed in — was unreviewable.
            //
            // On the LAST session only, so the grid's own "first of this split"
            // and no-data lines are still reachable on the six behind it.
            let watched = id == lastSession
            try WorkoutSession(id: id, userId: userId, dayKey: "cb_a", date: s.date, startedAt: start,
                               endedAt: start.addingTimeInterval(64 * 60), durationMin: 64, sessionRpe: 7 + Double(n % 2) * 0.5,
                               avgBpm: watched ? 122 : nil, caloriesBurned: watched ? 383 : nil,
                               avgBpmEstimated: false, caloriesEstimated: false).insert(db)
            var order = 0
            // The MOVEMENT's own position, as `LoggerModel.deckOrder` writes it
            // and as the real 7 September rows carry it. The treadmill is 0 and
            // is inserted LAST, so its card being first in the report is the
            // `exercise_order` sort doing its job rather than fold order
            // agreeing with it by accident — which is the whole of what a
            // reorder has to survive.
            let placed = ["ex-treadmill": 0, "ex-incline": 1, "ex-pulldown": 2,
                          "ex-row": 3, "ex-raise": 4, "ex-hkr": 5]
            func set(_ ex: String, _ i: Int, _ w: Double, _ r: Int, type: String = "normal", side: String? = nil, pair: String? = nil, rpe: Double? = nil) throws {
                try WorkoutSet(id: "\(id)-\(ex)-\(i)\(side ?? "")", sessionId: id, exerciseId: ex, setIndex: i, weightKg: w, reps: r,
                               setType: type, side: side, pairId: pair, est1rmKg: Epley.oneRepMax(weight: w, reps: Double(r)), rpe: rpe,
                               exerciseOrder: placed[ex], foldOrder: order).insert(db)
                order += 1
            }
            try set("ex-incline", 0, 20, 12, type: "warmup")
            for (i, (w, r)) in s.incline.enumerated() { try set("ex-incline", i + 1, w, r, rpe: 7 + Double(i) * 0.5) }
            // The last set of the pulldown on the session the shot loop opens
            // is taken to FAILURE, which is the only way any screenshot of this
            // app shows the state: nothing else in six weeks of this fixture
            // sits on the top rung of `RpeLadder`, so the `F` badge and the red
            // effort word were unreviewable — and an unreviewable state is one
            // that breaks silently.
            for (i, (w, r)) in s.pulldown.enumerated() {
                let failed = id == lastSession && i == s.pulldown.count - 1
                try set("ex-pulldown", i + 1, w, r, rpe: failed ? 10 : 7.5)
            }
            for (i, (w, r)) in s.row.enumerated() { try set("ex-row", i + 1, w, r, rpe: 8) }
            for (i, (w, r)) in s.raise.enumerated() {
                let pair = "\(id)-raise-\(i)"
                try set("ex-raise", i + 1, w, r, side: "left", pair: pair)
                try set("ex-raise", i + 1, w, r - 1, side: "right", pair: pair)
            }
            for i in 0..<2 { try set("ex-hkr", i + 1, 0, 12 + i + n / 2, rpe: 6) }
            // ── THE SET THAT IS NOT REPS AND KILOGRAMS ──────────────────
            // 2026-09-07 opens with one, and it is the only row in the live
            // database using `duration_sec` / `incline` / `distance_km` /
            // `elevation_m`. A fixture without one photographs the fix as an
            // unchanged screen: the ledger's job here is to render
            // `5:00 · 0.37 km · 2% · 7 m` where it used to render `0kg × 0`,
            // and nothing else in six weeks of this seed carries a cardio
            // axis.
            //
            // On the LAST session only, and as a warm-up — the same shape the
            // real row has, so it earns no tonnage, no ordinal and no record,
            // and the other six sessions' arithmetic is untouched.
            //
            // LOGGED LAST, PLACED FIRST. `exercise_order` 0 against a fold
            // order behind every lift, so the report putting its card at the
            // top is `SessionAnalysis.grouped` reading the column rather than
            // first appearance agreeing with it — the one state that tells a
            // reorder apart from a coincidence.
            if id == lastSession {
                try WorkoutSet(
                    id: "\(id)-treadmill", sessionId: id, exerciseId: "ex-treadmill", setIndex: 1,
                    weightKg: 0, reps: 0, setType: "warmup",
                    exerciseOrder: placed["ex-treadmill"],
                    // 7 m of ascent. 0.37 km at 2 % is 7.4 — close, and NOT
                    // where this comes from: the column is measured, and a
                    // fixture that used the product would photograph the one
                    // thing the column exists to disprove.
                    durationSec: 300, incline: 2, distanceKm: 0.37, elevationM: 7,
                    foldOrder: order
                ).insert(db)
                order += 1
            }
        }

        // ── ONE PPL-ERA SESSION ─────────────────────────────────────────────
        // 8 July 2026 is inside the Thailand deload, which `Phases` tags `.ppl`
        // — so History has two eras in it and the era filter is a control with
        // something to do rather than one that can only empty the list. Its day
        // key is not one of Onyx-5's, which is the point: the schedule cannot
        // speak for a week before Week 0, and this week must therefore draw no
        // missed days at all.
        let ppl = "s-2026-07-08"
        let pplStart = LogicalDay.date(fromISO: "2026-07-08")!.addingTimeInterval(17 * 3600)
        try WorkoutSession(id: ppl, userId: userId, dayKey: "push", date: "2026-07-08", startedAt: pplStart,
                           endedAt: pplStart.addingTimeInterval(52 * 60), durationMin: 52, sessionRpe: 7).insert(db)
        for (i, (w, r)) in [(32.0, 12), (32.0, 11), (32.0, 10)].enumerated() {
            try WorkoutSet(id: "\(ppl)-incline-\(i)", sessionId: ppl, exerciseId: "ex-incline", setIndex: i + 1,
                           weightKg: w, reps: r, est1rmKg: Epley.oneRepMax(weight: w, reps: Double(r)), rpe: 7, foldOrder: i).insert(db)
        }

        // One leg day, so the list has a second colour and Hack Squat a ledger.
        let legs = "s-2026-08-30"
        let start = LogicalDay.date(fromISO: "2026-08-30")!.addingTimeInterval(17 * 3600)
        try WorkoutSession(id: legs, userId: userId, dayKey: "legs_a", date: "2026-08-30", startedAt: start,
                           endedAt: start.addingTimeInterval(58 * 60), durationMin: 58, sessionRpe: 8).insert(db)
        for (i, (w, r)) in [(60.0, 12), (60.0, 11), (60.0, 10)].enumerated() {
            try WorkoutSet(id: "\(legs)-hack-\(i)", sessionId: legs, exerciseId: "ex-hack", setIndex: i + 1, weightKg: w, reps: r,
                           est1rmKg: Epley.oneRepMax(weight: w, reps: Double(r)), rpe: 8, foldOrder: i).insert(db)
        }

        // The record book as the save path would have filed it.
        for (axis, value, w, r) in [("weight", 42.0, 42.0, 10), ("e1rm", 56.0, 42.0, 10), ("volume", 480.0, 40.0, 12)] {
            try PersonalRecordRow(userId: userId, exerciseKey: "Incline DB Press", axis: axis, value: value, reps: r, weightKg: w,
                                  sessionId: lastSession, achievedOn: "2026-09-01", updatedAt: Date()).insert(db)
        }

        // Five bouts, so the Workout tab's cardio trail has something to draw
        // and the last one carries every figure the card can print. Two of them
        // clear `Zone2.minMinutes`, which is what makes the rail read 2/2 on a
        // week that earned it.
        let bouts: [(String, String, Double, Double, Double, Double)] = [
            ("c-5", "2026-08-22", 3200, 32, 121, 6),
            ("c-4", "2026-08-25", 2400, 22, 118, 8),
            ("c-3", "2026-08-28", 1600, 14, 124, 10),
            ("c-2", "2026-08-31", 4100, 38, 126, 4),
            ("c-1", "2026-09-01", 1800, 15, 131, 10),
        ]
        for (id, date, distance, minutes, hr, incline) in bouts {
            try CardioLogRow(
                id: id, userId: userId, date: date, kind: "treadmill",
                distanceM: distance, durationMin: minutes,
                fromHealthkit: false, createdAt: Date(),
                avgHr: hr,
                sessionId: id == "c-1" ? lastSession : nil,
                inclinePct: incline
            ).insert(db)
        }
    }
}

#Preview("History") { HistoryPreviews.view("history") }
#Preview("Session") { HistoryPreviews.view("session") }
#endif
