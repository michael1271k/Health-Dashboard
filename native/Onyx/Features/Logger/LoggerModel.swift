import Foundation
import Observation
import OnyxCore
import OnyxData
import OnyxUI

/// The live session, as the logger sees it.
///
/// ── WHY THERE IS A MODEL AT ALL AND NOT JUST A `ValueObservation` ───────────
/// Half of what the logger draws is not in the database and never will be. A
/// planned-but-unlogged set is a row in the PROGRAM: it has a rep window, a
/// rest target and a seed load, and it exists so you know what to walk up to
/// the machine and do. `workout_sets` only ever holds work that HAPPENED.
///
/// So the screen is the deck (from `Program.onyx5`) with the log folded onto
/// it. Ticking a set appends an event; untickng voids it; editing a ticked set
/// amends it. Nothing here awaits the network to draw, which is the property
/// the whole data layer exists to provide.
///
/// ── AND WHY THE STORE IS OPTIONAL ───────────────────────────────────────────
/// `store == nil` is the previews' mode: the same model, the same state
/// machine, no database. That is deliberate — a preview that runs different
/// code from the device is a preview that lies, and the alternative (a protocol
/// with one real implementation) is an abstraction bought for nothing.
@MainActor
@Observable
final class LoggerModel: Identifiable, PauseControlling, LivePrProviding {

    /// Identity, for `fullScreenCover(item:)`.
    ///
    /// ── WHY THE COVER IS PRESENTED BY ITEM AND NOT BY A BOOLEAN ─────────────
    /// `fullScreenCover(isPresented:)` evaluates its content builder against
    /// whatever state exists at that instant, and the tab's builder read
    /// `if let session` — so a flag flipped in the same runloop turn as the
    /// model being assigned presented a cover with nothing in it. That is the
    /// black screen. Presenting by item makes the model's existence the
    /// PRECONDITION of the cover rather than a second fact that has to agree
    /// with a flag, and the empty case stops being representable.
    ///
    /// `nonisolated let` of a `Sendable` type: `Identifiable` is not isolated,
    /// so a main-actor-isolated `id` would make the conformance itself a data
    /// race the compiler refuses.
    nonisolated let id = newOnyxID()

    // MARK: - Rows

    /// How a set counts. `ghost` is work you marked as NOT done and it counts
    /// for nothing, anywhere — which is the one thing that separates it from a
    /// warm-up, which counts everywhere the body is asked about.
    enum SetKind: String, CaseIterable, Identifiable, Sendable {
        case normal, warmup, failure, dropset, ghost

        var id: String { rawValue }

        /// The single character the row wears in place of its ordinal.
        ///
        /// A letter, not a word: "Warmup" is eight characters on the one row
        /// that has no spare width, and "Dropset" and "Failure" are seven each.
        /// The full word lives in the options sheet and in the weekly export,
        /// which is what a coach actually reads.
        ///
        /// Ghost is `G`, matching the web's badge and its export. It used to be
        /// an em dash here — a glyph that reads as "nothing" in a column where
        /// every other value is an identity, and which said something different
        /// in the sheet that sets it from what the row then drew.
        var badge: String? {
            switch self {
            case .normal:  nil
            case .warmup:  "W"
            case .failure: "F"
            case .dropset: "D"
            case .ghost:   "G"
            }
        }

        var label: String {
            switch self {
            case .normal:  "Normal"
            case .warmup:  "Warm-up"
            case .failure: "Failure"
            case .dropset: "Drop"
            case .ghost:   "Ghost"
            }
        }

        /// What choosing it MEANS, in four words. The sheet keeps one of these
        /// on screen at all times: five hints stacked under five chips would put
        /// the height straight back, and a tooltip is not reachable by thumb.
        var hint: String {
            switch self {
            case .normal:  "Counts as work"
            case .warmup:  "Before the work"
            case .failure: "Taken to failure"
            case .dropset: "No record from it"
            case .ghost:   "Logged, counts for nothing"
            }
        }
    }

    @MainActor
    @Observable
    final class SetRow: Identifiable {
        let id: String
        var weightKg: Double?
        var reps: Int?
        /// CR-10. `nil` is UNRATED, which the progression rule has to be able to
        /// tell apart from "rated easy".
        var rpe: Double?
        var kind: SetKind
        /// HOW the set went, as opposed to how hard — the second axis the set
        /// options sheet asks about. `nil` is "not reported", never "clean":
        /// see `SetQuality`.
        var quality: SetQuality?
        var isDone: Bool
        /// What this set number was last time, pre-formatted: `"47kg × 12"`.
        /// Empty when the movement is new — a Lock Screen has no room to say
        /// "no data" politely and neither does a set row.
        var previous: String?
        /// A record claimed on this set — the REAL engine since P3 E4.
        ///
        /// `PrEngine.detectSessionPrs` against baselines built by
        /// `PrRecorder.baselines`, which is the same function `closeSession`
        /// uses to write `personal_records`. That identity is the point: a live
        /// badge computed from a different bar is a badge that fires on a set
        /// the close then refuses to file, and gold means "never beaten"
        /// everywhere else in the app.
        var isRecord: Bool

        /// The remembered rating was DROPPED because this row's work is harder
        /// than the set it was seeded from. Distinct from `rpe == nil`, which
        /// is simply an unrated set.
        ///
        /// STAGED for the set row's "rate this" pip (wave U2). Nothing draws it
        /// in this build.
        var rpeStale: Bool

        /// This row opens on a progression bump: `.ready` pre-filled the
        /// suggested load at the rep floor.
        ///
        /// STAGED for the row's progression chip (wave U2). Nothing draws it in
        /// this build.
        var progressed: Bool

        init(
            id: String = newOnyxID(),
            weightKg: Double? = nil, reps: Int? = nil, rpe: Double? = nil,
            kind: SetKind = .normal, quality: SetQuality? = nil, isDone: Bool = false,
            previous: String? = nil, isRecord: Bool = false,
            rpeStale: Bool = false, progressed: Bool = false
        ) {
            self.id = id
            self.weightKg = weightKg
            self.reps = reps
            self.rpe = rpe
            self.kind = kind
            self.quality = quality
            self.isDone = isDone
            self.previous = previous
            self.isRecord = isRecord
            self.rpeStale = rpeStale
            self.progressed = progressed
        }

        /// Tonnage this row contributes. A ghost contributes nothing; a warm-up
        /// does, because the weight was still moved.
        var volumeKg: Double {
            guard kind != .ghost, isDone, let weightKg, let reps else { return 0 }
            return weightKg * Double(reps)
        }

        var estimated1RM: Double? {
            guard let weightKg, let reps else { return nil }
            // `Epley` returns nil for an unloaded set rather than 0 — reading it
            // back with `??` instead of a nil check is how "1RM 0" printed for
            // months in the web app.
            return Epley.oneRepMax(weight: weightKg, reps: Double(reps))
        }
    }

    @MainActor
    @Observable
    final class ExerciseState: Identifiable {
        let plan: ProgramExercise
        var rows: [SetRow]
        var note: String

        /// `nonisolated` because `Identifiable` is not: `ForEach` reads `id`
        /// while diffing, outside any actor, and a main-actor-isolated `id`
        /// makes the conformance itself a data race the compiler refuses.
        /// Safe here because `plan` is a `let` — the identity of an exercise
        /// cannot change, which is what makes it an identity.
        nonisolated var id: String { plan.id }
        nonisolated var name: String { plan.name }

        init(plan: ProgramExercise, rows: [SetRow], note: String = "") {
            self.plan = plan
            self.rows = rows
            self.note = note
        }

        /// PHYSICAL sets performed — warm-ups INCLUDED, ghosts excluded.
        ///
        /// Warm-ups count here and essentially nowhere else, because the
        /// question the muscle sheet asks is different: two warm-up sets of leg
        /// press are two sets of leg press as far as the quads are concerned.
        /// It is also the number Hevy prints, and Hevy counts them.
        var physicalSets: Int {
            rows.filter { $0.isDone && $0.kind != .ghost }.count
        }

        /// WORKING sets — what the program prescribed and what the header counts.
        var workingSets: Int {
            rows.filter { $0.isDone && $0.kind != .ghost && $0.kind != .warmup }.count
        }

        var volumeKg: Double { rows.reduce(0) { $0 + $1.volumeKg } }
        var isComplete: Bool { !rows.isEmpty && rows.allSatisfy(\.isDone) }
    }

    // MARK: - State

    private(set) var day: ProgramDay
    var phase: ProgramPhase {
        didSet {
            guard phase != oldValue else { return }
            // ── THE SEED IS PHASE-SCOPED, SO IT IS REBUILT TOO ──────────────
            // `SessionSeedBuilder.build` walks `day.exercises(for: phase)`, so
            // a lift the OTHER phase drops has no seed entry at all. Switching
            // cut → bulk brings the wrist curl and the hip adduction back, and
            // without this they would open on `wk1Kg` with a blank Previous —
            // the July-number problem this wave exists to remove, for exactly
            // the subset of lifts a phase switch introduces.
            let opened = Self.loadSeed(store: store, day: day, phase: phase, userId: userId)
            seed = opened.seed
            progressionAlerts = opened.alerts
            rebuildForPhase()
        }
    }
    private(set) var exercises: [ExerciseState] = []
    /// When the session began.
    ///
    /// `var`, because the timer sheet can correct it (`setStart`, `setElapsed`)
    /// — a deck opened twenty minutes before the first set otherwise reports
    /// twenty minutes of training that did not happen. Never rebased around a
    /// pause: `Era.forDate`, the PR date and every "when did you train" reader
    /// take this field.
    private(set) var startedAt: Date

    /// When the current rest period ends. `nil` means no timer is running —
    /// which is not the same as a timer at zero, and the bar renders the two
    /// differently.
    private(set) var restEndsAt: Date?
    private(set) var restDuration: TimeInterval = 0
    /// Which exercise started the rest, so the bar can name it.
    private(set) var restingExercise: String?

    // ── The seed ────────────────────────────────────────────────────────────
    //
    // What the deck OPENS with, and where each number came from. Built once —
    // in `init`, from the store when there is one — because a deck that
    // re-derives its own proposal on every phase switch would move numbers the
    // user has already read. `SessionSeedBuilder` with an empty history is the
    // program's cold start, which is exactly the preview's behaviour, so there
    // is one path rather than two.
    private(set) var seed: SessionSeed

    /// Lifts that have earned a load bump today. Published to
    /// `AppEnvironment.progressionAlerts` by whoever opens the logger
    /// (decision 10 — in-app only).
    ///
    /// STAGED: the banner, the tab card's chip and the row chip are Track U's
    /// (waves U1 and U2). Nothing in this build reads it yet.
    private(set) var progressionAlerts: [ProgressionQueue.Alert] = []

    // ── The live PR bar ─────────────────────────────────────────────────────
    //
    // Built at `attach`, from the same function that writes the ledger on
    // close, and NOT rebuilt while the session runs: the bar a set is measured
    // against is the history that existed before this workout started. Folding
    // this session's own sets into it as they land is how every set becomes a
    // record against itself.
    private var baselines: PrBaselines = .empty

    /// Distinct axis-records claimed so far — the Live Activity's count.
    private(set) var prsThisSession = 0

    /// The records themselves, newest first — `LivePrProviding`, which the Live
    /// Stats "Records" card draws. Filled by the same pass that lights the
    /// badges, so the card and the badge can never disagree.
    private(set) var livePrs: [LivePrRecord] = []

    // ── The session clock ───────────────────────────────────────────────────

    /// When the CURRENT pause began, or nil while running.
    ///
    /// A pause is an EVENT in the log, not just a flag on this object: it has
    /// to survive the app being killed mid-workout and it has to merge with the
    /// watch's. This is the in-memory read of it — `PauseControlling.isPaused`
    /// is `pausedAt != nil`, and the timer reads `elapsed(at:)` rather than
    /// asking the store per tick.
    private(set) var pausedAt: Date?

    /// Seconds banked by pauses that have CLOSED.
    private(set) var pausedTotal: TimeInterval = 0

    private let store: AppDatabase?
    /// The `workout_sessions` row this device is writing into, once one exists.
    /// Readable because the finish sheet's "View summary" pushes
    /// `SessionDetailView(sessionId:)` at it — and `nil` is the honest answer
    /// while nothing has been logged, which is what hides that button.
    private(set) var sessionId: String?
    private let userId: String

    // MARK: - Derived

    var totalVolumeKg: Double { exercises.reduce(0) { $0 + $1.volumeKg } }
    var completedSets: Int { exercises.reduce(0) { $0 + $1.workingSets } }
    var plannedSets: Int { day.plannedSets(for: phase) }
    /// Records claimed so far — AXES, not rows.
    ///
    /// ── WHY NOT `rows.filter(\.isRecord).count`, WHICH IS WHAT IT WAS ───────
    /// One set can win two axes at once (a heaviest load that is also a best
    /// e1RM), and two sets can win one axis between them. `pr_count` on the
    /// session, the trophy chips and the web all count DISTINCT axis-records —
    /// `PrEngine.detectSessionPrs(…).prCount` — so counting rows here made the
    /// finish sheet, the Live Activity and the ledger disagree about the same
    /// workout by one or two the moment a set won on two axes.
    var recordCount: Int { prsThisSession }
    var physicalSets: Int { exercises.reduce(0) { $0 + $1.physicalSets } }

    /// Weighted set counts per landmark, for the distribution sheet.
    var muscleSets: [LandmarkMuscle: Double] {
        MuscleCredit.weightedSets(
            exercises.map { .init(physicalSets: $0.physicalSets, movers: $0.plan.movers) }
        )
    }

    /// Cumulative tonnage after each completed set, oldest first — the shape the
    /// Live Activity's sparkline draws.
    ///
    /// Capped at 12 points: ActivityKit budgets updates by payload size as well
    /// as by frequency, and a chart that grew without bound would cost more the
    /// longer the session ran, which is exactly backwards.
    var volumeCurve: [Double] {
        var running = 0.0
        var points: [Double] = []
        for exercise in exercises {
            for row in exercise.rows where row.isDone {
                running += row.volumeKg
                points.append(running)
            }
        }
        guard points.count > 1 else { return [] }
        return points.count <= 12 ? points : Array(points.suffix(12))
    }

    /// The set you are standing in front of: the first one not yet ticked.
    var currentSet: (exercise: ExerciseState, row: SetRow, ordinal: Int, total: Int)? {
        for exercise in exercises {
            if let index = exercise.rows.firstIndex(where: { !$0.isDone }) {
                return (exercise, exercise.rows[index], index + 1, exercise.rows.count)
            }
        }
        return nil
    }

    // MARK: - Init

    init(
        day: ProgramDay,
        phase: ProgramPhase,
        store: AppDatabase? = nil,
        userId: String = "preview",
        startedAt: Date = Date()
    ) {
        self.day = day
        self.phase = phase
        self.store = store
        self.userId = userId
        self.startedAt = startedAt
        let opened = Self.loadSeed(store: store, day: day, phase: phase, userId: userId)
        self.seed = opened.seed
        self.progressionAlerts = opened.alerts
        rebuildForPhase()
    }

    /// The seed, or the program's cold start when there is no store.
    ///
    /// Synchronous, like `attach`'s own reads: it is one query over one day
    /// key's sessions and their sets, and a deck that draws the plan first and
    /// the real loads a frame later is a deck that moves under the reader's
    /// thumb. A store failure falls back to the cold start rather than taking
    /// the screen down — the same trade `attach` makes.
    private static func loadSeed(
        store: AppDatabase?, day: ProgramDay, phase: ProgramPhase, userId: String
    ) -> SeededDeck {
        let cold = SeededDeck(
            seed: SessionSeedBuilder.build(
                dayKey: day.key, today: LogicalDay.today(), phase: phase, sessions: [], sets: []
            ),
            alerts: []
        )
        guard let store else { return cold }
        return (try? store.sessionSeed(dayKey: day.key, userId: userId, phase: phase)) ?? cold
    }

    // MARK: - Deck

    /// Build (or rebuild) the deck for the active phase.
    ///
    /// Rows already logged are PRESERVED across a phase switch. Cutting removes
    /// prescribed sets, and silently deleting work you have already done to
    /// honour a prescription would be the store losing a set to enforce a UI
    /// rule — the same mistake `ingest` is explicitly written not to make.
    private func rebuildForPhase() {
        let existing = Dictionary(uniqueKeysWithValues: exercises.map { ($0.id, $0) })
        // Iterating the FULL deck rather than `day.exercises(for: phase)` is
        // what lets a dropped lift survive below — the filtered list does not
        // contain it to be rescued.
        exercises = day.exercises.compactMap { plan in
            let prescribed = plan.sets(for: phase)
            guard let previous = existing[plan.id] else {
                guard prescribed > 0 else { return nil }
                return ExerciseState(plan: plan, rows: seedRows(plan, count: prescribed))
            }

            // ── WARM-UPS ARE NOT PART OF THE PRESCRIPTION ───────────────
            // `prescribed` counts WORKING sets, and since P3 E4 the deck also
            // carries last session's warm-ups. Measuring against a `logged`
            // that includes them makes a phase switch DELETE working rows you
            // have not done yet: two ticked warm-ups and one working set read
            // as three against a prescription of two, so the branch below
            // collapses the deck to the ticked rows and the two sets still to
            // do are gone with no way back but `addSet`.
            let working = previous.rows.filter { $0.kind != .warmup }
            let logged = working.filter(\.isDone)
            // A lift this phase DROPS (`cutSets: 0` — the wrist curl, the hip
            // adduction) keeps its place if it already carries work. Switching
            // to a cut mid-session must not take sets you have done off the
            // screen to satisfy a prescription: the events are still in the log
            // and a screen that disagrees with the log is worse than a screen
            // showing a lift the plan no longer asks for. A ticked WARM-UP is
            // work done too, which is why the guard reads every row.
            guard prescribed > 0 || previous.rows.contains(where: \.isDone) else { return nil }

            if logged.count >= prescribed {
                previous.rows = previous.rows.filter(\.isDone)
            } else {
                // Trim the SURPLUS blanks, keeping the rows where they are.
                // Rebuilding as `logged + blanks` sorts the ticked rows to the
                // top, so a session where set 2 was skipped and set 3 logged
                // reorders itself under the reader on a phase switch.
                let blanks = working.filter { !$0.isDone }
                let wanted = prescribed - logged.count
                let keep = Set(blanks.prefix(wanted).map(\.id))
                // A warm-up row survives whatever the prescription says — it
                // was never counted against it.
                previous.rows = previous.rows.filter { $0.isDone || $0.kind == .warmup || keep.contains($0.id) }
                    + seedRows(plan, count: max(0, wanted - blanks.count), warmups: false)
            }
            return previous
        }
    }

    /// The seeded rows for one movement.
    ///
    /// ── THIS USED TO BE `wk1Kg`, AND THAT WAS THE BUG ───────────────────────
    /// Every row opened on the program's week-1 load with the literal string
    /// `"<wk1Kg>kg × <floor>"` in the Previous column. After six months of
    /// training that is not a seed and it is not a previous set; it is a number
    /// with the shape of one, and it read as arbitrary data because it was.
    /// `SessionSeed` answers with the last session logged on this routine day —
    /// matched by NAME, so a web-logged session counts — the stored template, or
    /// the cold start, and it says which.
    ///
    /// `count` is the number of WORKING rows wanted, which is the prescription
    /// for the phase. Warm-ups carried from last time ride on top of it and are
    /// requested only when the whole deck is being built: a phase switch that
    /// asks for two more rows is asking for two more working sets.
    private func seedRows(_ plan: ProgramExercise, count: Int, warmups: Bool = true) -> [SetRow] {
        let seeded = seed.exercises.first { ExerciseAliases.canonicalName($0.name) == ExerciseAliases.canonicalName(plan.name) }
        let rows = seeded?.rows ?? []
        let working = rows.filter { $0.kind == .normal }
        var out: [SetRow] = warmups ? rows.filter { $0.kind == .warmup }.map(Self.setRow) : []
        for i in 0..<max(0, count) {
            // A count above what the seed produced (a phase switch to bulk)
            // repeats its last row rather than falling back to `wk1Kg`: the
            // load you are handling is a better proposal than the one from July.
            if i < working.count {
                out.append(Self.setRow(working[i]))
            } else if let last = working.last {
                // Past what the seed produced: the last known LOAD at the rep
                // FLOOR, which is what `SessionSeedBuilder.workingRows` does for
                // the same case. Copying the last row verbatim would carry its
                // reps too, and the two sides would answer differently.
                var carried = Self.setRow(last)
                carried.reps = plan.repWindow?.floor ?? carried.reps
                out.append(carried)
            } else {
                out.append(SetRow(weightKg: plan.wk1Kg))
            }
        }
        return out
    }

    /// One seeded row, as the deck holds it.
    private static func setRow(_ row: SeedRow) -> SetRow {
        SetRow(
            weightKg: row.weightKg,
            reps: row.reps,
            rpe: row.rpe,
            kind: row.kind == .warmup ? .warmup : .normal,
            previous: row.previous,
            rpeStale: row.rpeStale,
            progressed: row.progressed
        )
    }

    /// What this exercise's rows are seeded FROM, for the deck's own label.
    /// Nil when nothing was logged — the cold start says nothing rather than
    /// naming a date that does not exist.
    func seededFrom(_ exercise: ExerciseState) -> String? {
        seed.exercises
            .first { ExerciseAliases.canonicalName($0.name) == ExerciseAliases.canonicalName(exercise.name) }?
            .seededFrom
    }

    // MARK: - Editing

    func addSet(to exercise: ExerciseState) {
        // The new row inherits the last one's load, which is what the next set
        // almost always is. Reps are NOT inherited: on double progression the
        // rep count is the thing you are trying to change.
        let last = exercise.rows.last
        exercise.rows.append(SetRow(
            weightKg: last?.weightKg ?? exercise.plan.wk1Kg,
            kind: last?.kind == .warmup ? .normal : (last?.kind ?? .normal),
            // The set beyond the prescription has no seeded previous — history
            // does not contain a set number that has never been programmed.
            previous: seededPrevious(exercise.plan, workingIndex: exercise.rows.filter { $0.kind != .warmup }.count)
        ))
    }

    /// Copy a set, immediately below itself.
    ///
    /// Load, reps, effort and KIND all carry over; `isDone` and `isRecord` do
    /// not. A duplicate that arrived already ticked would be a set the store
    /// has an event for that nobody performed — and the whole point of the
    /// gesture is the next set, which has not happened yet.
    func duplicate(_ row: SetRow, in exercise: ExerciseState) {
        guard let index = exercise.rows.firstIndex(where: { $0.id == row.id }) else { return }
        exercise.rows.insert(
            SetRow(
                weightKg: row.weightKg, reps: row.reps, rpe: row.rpe,
                kind: row.kind, quality: row.quality, isDone: false, previous: row.previous
            ),
            at: index + 1
        )
        // Everything below just moved down one, and `set_index` is derived from
        // the live array position. `SetEventFold` tolerates a collision by
        // ordering the pair on ARRIVAL, so leaving them stale reorders the
        // ledger relative to the screen — and `restoreLoggedSets` rebuilds in
        // that order on the next launch.
        restampFrom(index + 1, in: exercise)
    }

    /// Re-write the stored `set_index` of every logged row from `index` down.
    private func restampFrom(_ index: Int, in exercise: ExerciseState) {
        guard store != nil, sessionId != nil else { return }
        for row in exercise.rows[min(index, exercise.rows.count)...] where row.isDone {
            amendInStore(row, in: exercise)
        }
    }

    func removeSet(_ row: SetRow, from exercise: ExerciseState) {
        guard let index = exercise.rows.firstIndex(where: { $0.id == row.id }) else { return }
        let wasDone = row.isDone
        if wasDone { voidInStore(row) }
        exercise.rows.remove(at: index)
        restampFrom(index, in: exercise)
        // Deleting a ticked set can PROMOTE a later one: a record is judged
        // against everything before it in the session, so removing the set that
        // was superseding it hands the axis back.
        if wasDone { refreshLivePrs() }
    }

    func setKind(_ kind: SetKind, on row: SetRow, in exercise: ExerciseState) {
        row.kind = kind
        if row.isDone {
            amendInStore(row, in: exercise)
            // A warm-up and a ghost set no bar and win no record, so the badge
            // has to clear — and the set that was standing behind this one may
            // now win the axis it was losing.
            refreshLivePrs()
        }
    }

    /// Passing the value the set already carries WITHDRAWS it — the same rule
    /// the RPE ladder follows, and for the same reason: a claim about your form
    /// that you cannot take back is a claim you stop making.
    func setQuality(_ quality: SetQuality?, on row: SetRow, in exercise: ExerciseState) {
        row.quality = row.quality == quality ? nil : quality
        if row.isDone { amendInStore(row, in: exercise) }
    }

    /// Tick or untick a set.
    ///
    /// Ticking is the moment the set becomes a fact, so it is the moment the
    /// event is appended, the rest timer starts and the Live Activity updates.
    /// Unticking appends a tombstone rather than deleting anything.
    @discardableResult
    func toggleDone(_ row: SetRow, in exercise: ExerciseState) -> Bool {
        if row.isDone {
            row.isDone = false
            row.isRecord = false
            voidInStore(row)
            refreshLivePrs()
            return false
        }
        // A set with no reps has not happened. Ticking it would put a zero into
        // the tonnage and a zero into the history.
        guard let reps = row.reps, reps > 0 else { return false }
        row.isDone = true
        appendInStore(row, in: exercise)
        refreshLivePrs()
        startRest(for: exercise)
        return true
    }

    func commitEdit(_ row: SetRow, in exercise: ExerciseState) {
        guard row.isDone else { return }
        amendInStore(row, in: exercise)
        refreshLivePrs()
    }

    /// The Previous column for one WORKING set of a movement.
    ///
    /// ── THE ORDINAL IS AMONG WORKING SETS, NOT AMONG ROWS ───────────────────
    /// The seed's working rows are numbered 0…n by working ordinal, and the
    /// deck's rows are not: since the seed carries last session's warm-ups, a
    /// row index counts them too. Passing one for the other shifts every label
    /// by the warm-up count — a warm-up row claiming working set 1's history,
    /// and working set 1 showing set 3's.
    ///
    /// Past the prescription there is nothing to show: history does not contain
    /// a set number that has never been programmed.
    private func seededPrevious(_ plan: ProgramExercise, workingIndex: Int) -> String? {
        let working = seed.exercises
            .first { ExerciseAliases.canonicalName($0.name) == ExerciseAliases.canonicalName(plan.name) }?
            .rows.filter { $0.kind == .normal } ?? []
        guard workingIndex >= 0, workingIndex < working.count else { return nil }
        return working[workingIndex].previous
    }

    // MARK: - Live records

    /// Re-detect every record claimed by the sets ticked so far.
    ///
    /// ── WHY THE WHOLE SESSION, ON EVERY TICK ────────────────────────────────
    /// A record is not a property of one set. Two sets at 62.5 × 12 are one
    /// record, and the SECOND does not claim it — `PrEngine.detectSessionPrs`
    /// decides that by walking the session in order and folding each winner
    /// into the index as it goes. Asking "does this row beat the bar" one row
    /// at a time cannot answer it, and would light both. A session is a few
    /// dozen sets; running the engine over all of them is cheaper than the
    /// haptic it triggers.
    ///
    /// The candidates are keyed exactly as `snapshot` writes them, so the live
    /// answer and the ledger written by `closeSession` are the same engine over
    /// the same keys against the same bar.
    private func refreshLivePrs() {
        var candidates: [PrCandidateSet] = []
        var origin: [SetRow] = []
        for exercise in exercises {
            let name = ExerciseAliases.canonicalName(exercise.name)
            let key = Self.exerciseId(exercise.name)
            // ── THE LEDGER'S FLOOR, NOT THIS SESSION'S PHASE ────────────
            // `PrRecorder.baselines` and `PrRecorder.record` both call
            // `Ceilings.repWindow(for:dayKey:)` and take its `.cut` default, so
            // passing `phase` here would gate the e1RM axis by a different
            // window than the close path uses. Leg Press is 8–12 on a bulk and
            // 12–15 on a cut: a bulk set of 140 × 10 would light gold live
            // (floor 8, eligible) and file nothing on close (floor 12, not
            // eligible). Matching `record` exactly is the requirement.
            let floor = Ceilings.repWindow(for: name, dayKey: day.key)?.floor
            for (i, row) in exercise.rows.enumerated() where row.isDone {
                candidates.append(PrCandidateSet(
                    key: key,
                    weightKg: row.weightKg ?? 0,
                    reps: Double(row.reps ?? 0),
                    setType: row.kind.rawValue,
                    timed: TimedExercise.isTimed(name),
                    repFloor: floor,
                    date: LogicalDay.today(),
                    exerciseName: name,
                    setNumber: i + 1
                ))
                origin.append(row)
            }
        }
        guard !candidates.isEmpty else {
            prsThisSession = 0
            livePrs = []
            return
        }
        let result = PrEngine.detectSessionPrs(candidates, baselines)
        var records: [LivePrRecord] = []
        for (i, detected) in result.perSet.enumerated() where i < origin.count {
            origin[i].isRecord = !detected.axes.isEmpty
            // ONE ENTRY PER AXIS, not per set: a single set can take the weight
            // record and the e1RM record at once, and a card that collapsed
            // them would say "1 PR" where the ledger written at close says two.
            for axis in detected.axes {
                guard let mark = detected.records[axis] else { continue }
                records.append(LivePrRecord(
                    id: "\(candidates[i].key)|\(candidates[i].setNumber ?? i + 1)|\(axis.rawValue)",
                    exercise: candidates[i].exerciseName ?? candidates[i].key,
                    setLabel: "Set \(candidates[i].setNumber ?? i + 1)",
                    axis: axis,
                    mark: mark
                ))
            }
        }
        // Newest first — the deck is walked in session order.
        livePrs = records.reversed()
        prsThisSession = result.prCount
    }

    // MARK: - Rest

    func startRest(for exercise: ExerciseState) {
        guard let seconds = exercise.plan.restSec else { return }
        restDuration = TimeInterval(seconds)
        restEndsAt = Date().addingTimeInterval(restDuration)
        restingExercise = exercise.name
    }

    func adjustRest(by seconds: TimeInterval) {
        guard let end = restEndsAt else { return }
        let next = end.addingTimeInterval(seconds)
        // Pulling the timer below now ENDS it rather than showing a negative
        // countdown that keeps counting.
        restEndsAt = next > Date() ? next : nil
        restDuration = max(0, restDuration + seconds)
        if restEndsAt == nil { restingExercise = nil }
    }

    func stopRest() {
        restEndsAt = nil
        restingExercise = nil
    }

    // MARK: - The session clock

    /// Stop the clock.
    ///
    /// ── WHY THIS APPENDS AN EVENT RATHER THAN SETTING A FLAG ────────────────
    /// A pause has to survive the app being killed mid-workout — iOS jetsams a
    /// backgrounded app without warning, and a flag in memory is gone with it
    /// while the wall clock keeps running. It also has to merge with the
    /// watch's, which is the whole argument `SetEvent` makes for the set log.
    /// So it is the same log, with its own two kinds, and `pausedSeconds` folds
    /// them. Nothing leaves the device: what the server gets is `duration_min`.
    ///
    /// `startedAt` is never rewritten. The session still began when it began;
    /// what changes is how much of the clock since then counts. Rebasing the
    /// start would be the shorter patch and it would lie to `Era.forDate`, to
    /// the PR date and to every reader of "when did you train".
    /// ── THE LOG IS WRITTEN FIRST, AND THE STATE FOLLOWS IT ─────────────────
    /// Both of these used to flip the flag and then try to write, which is two
    /// failures in one shape. `record` claims the pencil and REFUSES when the
    /// watch holds it (`EventStore.claimPencil`), so a refused pause left the
    /// screen stopped and the log running — and a refused RESUME left an open
    /// pause in the log forever, so the session came back paused and
    /// `closeSession` subtracted the whole interval. The visible state is now
    /// whatever the log accepted.
    ///
    /// And it needs a SESSION. `attach` only looks one up; the row is created
    /// by the first append (`ensureSession`). Pausing during your warm-up,
    /// before ticking anything, therefore wrote no event at all — the minutes
    /// went straight back into `duration_min`, which is the bug this whole
    /// mechanism exists to remove.
    func pause() { pause(at: Date()) }

    func pause(at now: Date) {
        guard pausedAt == nil else { return }
        guard let store else { pausedAt = now; return }
        do {
            guard let sessionId = try ensureSession() else { return }
            try store.pauseSession(sessionId)
            pausedAt = now
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }

    func resume() { resume(at: Date()) }

    func resume(at now: Date) {
        guard let since = pausedAt else { return }
        func bank() {
            // Banked from the local stamp rather than re-read: the store's own
            // answer is the same arithmetic over the two events this pair just
            // wrote, and a read per tap is a read for nothing.
            pausedTotal += max(0, now.timeIntervalSince(since))
            pausedAt = nil
        }
        guard let store, let sessionId else { bank(); return }
        do {
            try store.resumeSession(sessionId)
            bank()
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }

    /// Correct the start instant. `PauseControlling`.
    ///
    /// Clamped exactly as `LoggerClock` clamps it — a start that would put the
    /// clock in the future reads as "just started" rather than counting down —
    /// and against `pausedAt ?? now`, the same instant `elapsed` anchors on, so
    /// correcting the start DURING a pause cannot produce a negative elapsed
    /// that `max(0, …)` then renders as a confident 0:00.
    ///
    /// It reaches the store, which is the difference between this and the stub:
    /// `closeSession` derives `duration_min` from `started_at`, so a correction
    /// that lived only in memory would leave the timer saying 62 minutes and
    /// the stored session 82.
    func setStart(_ date: Date) {
        startedAt = min(date, (pausedAt ?? Date()).addingTimeInterval(-pausedTotal))
        persistStart()
    }

    /// Move `startedAt` so that `elapsed` reads `seconds`. The pause ledger is
    /// deliberately untouched — banking the difference there would make "edit
    /// elapsed" also edit how long you had rested, and `duration_min` would
    /// come out right for a reason nobody could find.
    func setElapsed(_ seconds: TimeInterval) {
        let anchor = pausedAt ?? Date()
        startedAt = anchor.addingTimeInterval(-(max(0, seconds) + pausedTotal))
        persistStart()
    }

    private func persistStart() {
        guard let store, let sessionId else { return }
        do {
            try store.setSessionStart(id: sessionId, startedAt: startedAt)
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }

    // MARK: - Finishing

    /// Stamp the session finished.
    ///
    /// Returns `false` when there was nothing to finish — no store, or not a
    /// single set logged. The caller uses that to avoid claiming a workout
    /// happened because a screen was opened.
    @discardableResult
    func finish(sessionRpe: Double? = nil) -> Bool {
        guard let store, let sessionId, completedSets > 0 else {
            // Not an error when there is no store (previews) — but a session
            // with nothing in it, or one whose row was never created, must not
            // be reported as finished. The caller keeps the sheet up and this
            // is what it shows.
            if store != nil, completedSets == 0 {
                storeError = "Nothing logged yet — tick a working set before finishing."
            }
            return false
        }
        do {
            // The rest the LAST movement worked prescribes — the long-idle
            // guard's credit for the gap between the last set and the button.
            let restTarget = exercises
                .last { $0.rows.contains(where: \.isDone) }?
                .plan.restSec
                .map(Double.init)
            try store.closeSession(id: sessionId, sessionRpe: sessionRpe, restTargetSec: restTarget)
            storeError = nil
            return true
        } catch {
            storeError = String(describing: error)
            return false
        }
    }

    /// Throw the session away — this workout did not happen.
    ///
    /// The common case costs nothing and touches nothing: `attach` looks a
    /// session up but never creates one, and `ensureSession` mints the row on
    /// the FIRST APPEND, so a logger opened by accident has no row, no events
    /// and no outbox items to clean up. `sessionId == nil` is exactly that
    /// state, and cancelling out of it is just leaving.
    ///
    /// Once a set has been logged there IS something to discard, and it is
    /// discarded rather than closed — see `AppDatabase.discardSession` for why
    /// an empty-but-finished session row is the worse outcome.
    @discardableResult
    func cancel() -> Bool {
        guard let store, let sessionId else { return true }
        do {
            try store.discardSession(id: sessionId)
            self.sessionId = nil
            // The deck goes back to its prescription. Leaving the ticks on
            // screen after the events behind them are gone is the projection
            // and the log disagreeing, which is the one thing this layer exists
            // to prevent.
            for exercise in exercises {
                for row in exercise.rows {
                    row.isDone = false
                    row.isRecord = false
                }
            }
            // `recordCount` is `prsThisSession` now, not a scan of the rows, so
            // clearing the badges is not enough — the header and the Lock
            // Screen would keep reporting records on an empty deck.
            prsThisSession = 0
            livePrs = []
            // The clock too: a discarded session's pause belongs to nothing.
            pausedAt = nil
            pausedTotal = 0
            storeError = nil
            return true
        } catch {
            storeError = String(describing: error)
            return false
        }
    }

    // MARK: - Session metadata

    /// What the store holds about this session, re-read rather than cached.
    ///
    /// Average heart rate and active energy are filled by `syncSessionMetrics`
    /// from the watch's own `HKWorkout` — which can arrive a day late — so the
    /// honest thing for the finish sheet to show is whatever is on disk at the
    /// moment it is drawn, and "—" when nothing is yet.
    var sessionRow: WorkoutSession? {
        guard let store, let sessionId else { return nil }
        return try? store.session(id: sessionId)
    }

    /// The two figures you can supply when the watch did not.
    ///
    /// Stamped MEASURED rather than estimated, so the next Health sync does not
    /// replace what you typed with what the phone inferred — see
    /// `AppDatabase.setSessionMetrics`.
    func setMetrics(avgBpm: Int? = nil, calories: Int? = nil) {
        guard let store, let sessionId else { return }
        do {
            try store.setSessionMetrics(id: sessionId, avgBpm: avgBpm, caloriesBurned: calories)
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }

    // MARK: - The store

    /// Make sure a session row exists, and remember its id.
    ///
    /// `set_events.session_id` has a foreign key to `workout_sessions`, so the
    /// row has to exist before the first append — and it is looked up by day
    /// key rather than created blindly, so relaunching mid-workout rejoins the
    /// session instead of starting a second one beside it.
    func attach() {
        guard let store, sessionId == nil else { return }
        do {
            // LOOK UP ONLY. Creating here leaves an empty session row behind
            // every time the tab is opened and closed without a set being
            // logged — and an empty session is indistinguishable, later, from a
            // workout somebody abandoned. The row is created by the first
            // append instead, in `ensureSession`.
            // ── `sessionId` IS ASSIGNED LAST, AND THAT IS THE POINT ─────────
            // `attach`'s own guard is `sessionId == nil`, so a read that threw
            // AFTER the id was assigned left the model owning a session with an
            // empty deck and no second chance to restore it — and re-ticking
            // set 1 would then append a FRESH set id at an index the log
            // already holds, which is a duplicated set in the projection and in
            // the upload. Everything is read into locals first.
            let live = try store.liveSession(dayKey: day.key, date: LogicalDay.today())?.id
            // The bar, built ONCE and from the same function that writes the
            // ledger on close (`PrRecorder.baselines`). Excluding this session
            // is what stops every set being measured against itself.
            let bar = try store.livePrBaselines(
                exerciseIds: exercises.map { Self.exerciseId($0.name) },
                excluding: live,
                dayKey: day.key
            )
            // Rejoining a session that was paused when the app was killed: the
            // log knows, and the wall clock has kept running.
            let paused = try live.map { (try store.isPaused(sessionId: $0), try store.pausedSeconds(sessionId: $0)) }

            sessionId = live
            baselines = bar
            if let paused {
                // The store's total already includes the interval still open at
                // this instant, so the local `pausedAt` is re-anchored to NOW
                // rather than to when the pause began — otherwise the same
                // minutes are counted in both.
                pausedAt = paused.0 ? Date() : nil
                pausedTotal = paused.1
            }
            try restoreLoggedSets()
            refreshLivePrs()
        } catch {
            // A store failure must not take the screen down with it: the deck
            // is still correct and still usable, and the events it could not
            // write are the ones the outbox exists to retry. Surfacing it as a
            // crash would lose the workout to protect the database.
            storeError = String(describing: error)
        }
    }

    /// Non-fatal store trouble, shown in the header rather than thrown.
    private(set) var storeError: String?

    /// Fold what is already logged back onto the deck.
    ///
    /// Matching is by `(exercise_id, set_index)`. Sets past the prescription
    /// become extra rows, which is exactly what they are.
    private func restoreLoggedSets() throws {
        guard let store, let sessionId else { return }
        let logged = try store.sets(sessionId: sessionId)
        guard !logged.isEmpty else { return }

        for exercise in exercises {
            let mine = logged.filter { $0.exerciseId == Self.exerciseId(exercise.name) }
            guard !mine.isEmpty else { continue }
            var rows: [SetRow] = mine.map { set in
                SetRow(
                    id: set.id,
                    weightKg: set.weightKg,
                    reps: set.reps,
                    rpe: set.rpe,
                    kind: SetKind(rawValue: set.setType) ?? .normal,
                    quality: set.quality.flatMap(SetQuality.init(rawValue:)),
                    isDone: true,
                    // A logged set's Previous is the same seed the blank row
                    // would have shown — what this set number was LAST time,
                    // not what it is now.
                    // A restored warm-up shows nothing: `seededPrevious` is
                    // about working sets, and a warm-up wearing set 1's history
                    // is worse than a blank column.
                    previous: set.setType == "warmup" ? nil : seededPrevious(
                        exercise.plan,
                        workingIndex: mine.prefix(while: { $0.id != set.id })
                            .filter { $0.setType != "warmup" }.count
                    ),
                    isRecord: false
                )
            }
            // Keep whatever blanks the prescription still asks for beyond what
            // was logged. Warm-ups are not re-offered: a restored session
            // already holds the ones that were performed.
            let remaining = max(0, exercise.rows.count - rows.count)
            rows.append(contentsOf: seedRows(exercise.plan, count: remaining, warmups: false))
            exercise.rows = rows
        }
    }

    /// The catalogue id for a movement.
    ///
    /// A slug of the name, because `workout_sets.exercise_id` lost its foreign
    /// key in `v4` precisely so a set logged against an exercise this device has
    /// not synced cannot make the projection reject a fact. When the exercise
    /// catalogue syncs (Wave 4) this becomes a real lookup; the slug is stable
    /// in the meantime and nothing downstream reads it yet.
    ///
    /// The `helix5-` prefix survived the Onyx rename on purpose — it is a key
    /// written into local set rows, not a brand. See `ExerciseSlug.id`, which
    /// must stay byte-identical to this.
    static func exerciseId(_ name: String) -> String {
        "helix5-" + name.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private func snapshot(_ row: SetRow, in exercise: ExerciseState) -> SetSnapshot {
        SetSnapshot(
            exerciseId: Self.exerciseId(exercise.name),
            setIndex: (exercise.rows.firstIndex { $0.id == row.id } ?? 0) + 1,
            // A missing load is 0 kg — a real bodyweight set — and a missing rep
            // count cannot reach here, because `toggleDone` refuses to tick one.
            weightKg: row.weightKg ?? 0,
            reps: row.reps ?? 0,
            setType: row.kind.rawValue,
            est1rmKg: row.estimated1RM,
            rpe: row.rpe,
            quality: row.quality?.rawValue
        )
    }

    /// The session row this device is writing into, created on demand.
    ///
    /// Called from the append path and nowhere else, so a session exists exactly
    /// when a set does.
    private func ensureSession() throws -> String? {
        guard let store else { return nil }
        if let sessionId { return sessionId }
        let session = try store.openSession(
            userId: userId,
            dayKey: day.key,
            // The logical calendar day is the DEVICE's, never the server's —
            // `/api/today` takes the date as a parameter for exactly this reason.
            date: LogicalDay.today(),
            startedAt: startedAt
        )
        sessionId = session.id
        return session.id
    }

    private func appendInStore(_ row: SetRow, in exercise: ExerciseState) {
        guard store != nil else { return }
        do {
            guard let sessionId = try ensureSession() else { return }
            try store?.appendSet(sessionId: sessionId, setId: row.id, snapshot(row, in: exercise))
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }

    private func amendInStore(_ row: SetRow, in exercise: ExerciseState) {
        guard let store, let sessionId else { return }
        let next = snapshot(row, in: exercise)
        do {
            try store.amendSet(sessionId: sessionId, setId: row.id, SetPatch(
                setIndex: next.setIndex, weightKg: next.weightKg, reps: next.reps,
                setType: next.setType, est1rmKg: next.est1rmKg, rpe: next.rpe,
                // The sentinel, not nil: `nil` in a patch means UNCHANGED, so
                // withdrawing a quality would otherwise be the one edit the
                // amend could not express. See `SetPatch.clearedQuality`.
                quality: next.quality ?? SetPatch.clearedQuality
            ))
            storeError = nil
        } catch EventStoreError.emptyPatch {
            // Nothing actually changed. Not an error, and not worth a row in a
            // log that is never compacted.
        } catch {
            storeError = String(describing: error)
        }
    }

    private func voidInStore(_ row: SetRow) {
        guard let store, let sessionId else { return }
        do {
            try store.voidSet(sessionId: sessionId, setId: row.id)
            storeError = nil
        } catch {
            storeError = String(describing: error)
        }
    }
}

// MARK: - Formatting

/// The two number formats this screen repeats, in one place.
enum OnyxFormat {
    /// `47`, `49.5`, `13.75` — never `49.50`, never `13.8`.
    ///
    /// Loads on cable stacks and micro-plates are genuinely 13.75 kg, and
    /// rounding one to a single decimal in the UI while storing the true value
    /// is how a load you can read stops matching the load you can search for.
    static func kg(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSNumber) ?? "\(value)"
    }

    /// `1 074` — grouped, because a five-digit tonnage is unreadable without it.
    static func volume(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value < 100 ? 1 : 0
        return formatter.string(from: value as NSNumber) ?? "\(value)"
    }

    /// `8`, `8.5`, `10`. CR-10, and its own function.
    ///
    /// It used to call `kg(_:)`, which produced the right characters for the
    /// wrong reason: an RPE is a point on a ten-point scale in half steps, and a
    /// load is a mass with two decimals of micro-plate precision. Sharing one
    /// formatter means the next change to how ONYX prints a load — grouping,
    /// a third decimal — silently changes how it prints an effort rating.
    static func rpe(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    /// Weighted set counts print at most one decimal: assistance is credited in
    /// halves, so `1.5` is a real value and `1.50` is noise.
    static func sets(_ value: Double) -> String {
        value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}
