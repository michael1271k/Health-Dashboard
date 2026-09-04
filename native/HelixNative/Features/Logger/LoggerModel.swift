import Foundation
import Observation
import HelixCore
import HelixData

/// The live session, as the logger sees it.
///
/// ── WHY THERE IS A MODEL AT ALL AND NOT JUST A `ValueObservation` ───────────
/// Half of what the logger draws is not in the database and never will be. A
/// planned-but-unlogged set is a row in the PROGRAM: it has a rep window, a
/// rest target and a seed load, and it exists so you know what to walk up to
/// the machine and do. `workout_sets` only ever holds work that HAPPENED.
///
/// So the screen is the deck (from `Program.helix5`) with the log folded onto
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
final class LoggerModel: Identifiable {

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
    nonisolated let id = UUID().uuidString

    // MARK: - Rows

    /// How a set counts. `ghost` is work you marked as NOT done and it counts
    /// for nothing, anywhere — which is the one thing that separates it from a
    /// warm-up, which counts everywhere the body is asked about.
    enum SetKind: String, CaseIterable, Sendable {
        case normal, warmup, failure, dropset, ghost

        var badge: String? {
            switch self {
            case .normal:  nil
            case .warmup:  "W"
            case .failure: "F"
            case .dropset: "D"
            case .ghost:   "—"
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
        var isDone: Bool
        /// What this set number was last time, pre-formatted: `"47kg × 12"`.
        /// Empty when the movement is new — a Lock Screen has no room to say
        /// "no data" politely and neither does a set row.
        var previous: String?
        /// A record claimed on this set.
        ///
        /// The rule behind it is a SEED rule, not the real one: `prEngine.ts`
        /// (600 loc, per-set tonnage collapsing L/R pairs, a reps axis only
        /// when weight is 0, baselines carrying set_type and side) is a Wave 4
        /// port. Until then a set beats the program's own `wk1Kg` seed, which is
        /// what that field documents itself as being for. It is a real signal
        /// and it is not the ledger — nothing here writes `personal_records`.
        var isRecord: Bool

        init(
            id: String = UUID().uuidString,
            weightKg: Double? = nil, reps: Int? = nil, rpe: Double? = nil,
            kind: SetKind = .normal, isDone: Bool = false,
            previous: String? = nil, isRecord: Bool = false
        ) {
            self.id = id
            self.weightKg = weightKg
            self.reps = reps
            self.rpe = rpe
            self.kind = kind
            self.isDone = isDone
            self.previous = previous
            self.isRecord = isRecord
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
        didSet { if phase != oldValue { rebuildForPhase() } }
    }
    private(set) var exercises: [ExerciseState] = []
    let startedAt: Date

    /// When the current rest period ends. `nil` means no timer is running —
    /// which is not the same as a timer at zero, and the bar renders the two
    /// differently.
    private(set) var restEndsAt: Date?
    private(set) var restDuration: TimeInterval = 0
    /// Which exercise started the rest, so the bar can name it.
    private(set) var restingExercise: String?

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
    var recordCount: Int {
        exercises.reduce(0) { $0 + $1.rows.filter { $0.isDone && $0.isRecord }.count }
    }
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
        rebuildForPhase()
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

            let logged = previous.rows.filter(\.isDone)
            // A lift this phase DROPS (`cutSets: 0` — the wrist curl, the hip
            // adduction) keeps its place if it already carries work. Switching
            // to a cut mid-session must not take sets you have done off the
            // screen to satisfy a prescription: the events are still in the log
            // and a screen that disagrees with the log is worse than a screen
            // showing a lift the plan no longer asks for.
            guard prescribed > 0 || !logged.isEmpty else { return nil }

            if logged.count >= prescribed {
                previous.rows = logged
            } else {
                // Trim the SURPLUS blanks, keeping the rows where they are.
                // Rebuilding as `logged + blanks` sorts the ticked rows to the
                // top, so a session where set 2 was skipped and set 3 logged
                // reorders itself under the reader on a phase switch.
                let blanks = previous.rows.filter { !$0.isDone }
                let wanted = prescribed - logged.count
                let keep = Set(blanks.prefix(wanted).map(\.id))
                previous.rows = previous.rows.filter { $0.isDone || keep.contains($0.id) }
                    + seedRows(plan, count: max(0, wanted - blanks.count))
            }
            return previous
        }
    }

    private func seedRows(_ plan: ProgramExercise, count: Int) -> [SetRow] {
        (0..<max(0, count)).map { _ in
            SetRow(weightKg: plan.wk1Kg, previous: Self.previousLabel(plan))
        }
    }

    /// The seed load, formatted the way the row prints it.
    ///
    /// `wk1Kg` documents itself as the value that seeds progressive-overload
    /// memory, so until the sync lands and real history arrives this IS the
    /// previous column. `nil` renders as nothing rather than as a dash.
    private static func previousLabel(_ plan: ProgramExercise) -> String? {
        guard let kg = plan.wk1Kg, let window = plan.repWindow else { return nil }
        return "\(HelixFormat.kg(kg))kg × \(window.floor)"
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
            previous: Self.previousLabel(exercise.plan)
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
                kind: row.kind, isDone: false, previous: row.previous
            ),
            at: index + 1
        )
    }

    func removeSet(_ row: SetRow, from exercise: ExerciseState) {
        if row.isDone { voidInStore(row) }
        exercise.rows.removeAll { $0.id == row.id }
    }

    func setKind(_ kind: SetKind, on row: SetRow, in exercise: ExerciseState) {
        row.kind = kind
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
            return false
        }
        // A set with no reps has not happened. Ticking it would put a zero into
        // the tonnage and a zero into the history.
        guard let reps = row.reps, reps > 0 else { return false }
        row.isDone = true
        row.isRecord = beatsTheSeed(row, plan: exercise.plan)
        appendInStore(row, in: exercise)
        startRest(for: exercise)
        return true
    }

    func commitEdit(_ row: SetRow, in exercise: ExerciseState) {
        guard row.isDone else { return }
        row.isRecord = beatsTheSeed(row, plan: exercise.plan)
        amendInStore(row, in: exercise)
    }

    /// The placeholder record rule — see `SetRow.isRecord`.
    private func beatsTheSeed(_ row: SetRow, plan: ProgramExercise) -> Bool {
        guard row.kind == .normal || row.kind == .failure else { return false }
        guard let estimate = row.estimated1RM else { return false }
        guard let seedLoad = plan.wk1Kg, let window = plan.repWindow,
              let seed = Epley.oneRepMax(weight: seedLoad, reps: Double(window.floor))
        else { return false }
        return estimate > seed
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

    // MARK: - Finishing

    /// Stamp the session finished.
    ///
    /// Returns `false` when there was nothing to finish — no store, or not a
    /// single set logged. The caller uses that to avoid claiming a workout
    /// happened because a screen was opened.
    @discardableResult
    func finish(sessionRpe: Double? = nil) -> Bool {
        guard let store, let sessionId, completedSets > 0 else { return false }
        do {
            try store.closeSession(id: sessionId, sessionRpe: sessionRpe)
            storeError = nil
            return true
        } catch {
            storeError = String(describing: error)
            return false
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
            sessionId = try store.liveSession(dayKey: day.key, date: LogicalDay.today())?.id
            try restoreLoggedSets()
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
                    isDone: true,
                    previous: Self.previousLabel(exercise.plan),
                    isRecord: false
                )
            }
            for row in rows { row.isRecord = beatsTheSeed(row, plan: exercise.plan) }
            // Keep whatever blanks the prescription still asks for beyond what
            // was logged.
            let remaining = max(0, exercise.rows.count - rows.count)
            rows.append(contentsOf: seedRows(exercise.plan, count: remaining))
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
            rpe: row.rpe
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
                setType: next.setType, est1rmKg: next.est1rmKg, rpe: next.rpe
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
enum HelixFormat {
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
    /// formatter means the next change to how HELIX prints a load — grouping,
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
