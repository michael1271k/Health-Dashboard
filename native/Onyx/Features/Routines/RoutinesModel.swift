import Foundation
import Observation
import OnyxCore
import OnyxData

/// The routine builder's state: one program's days, and the writes that change
/// them.
///
/// ── IT COMMITS AS IT GOES ───────────────────────────────────────────────────
/// No global Save. Every mutation writes its day and queues it, the way the
/// Levers and Weekly-set-volume screens already work, because a routine is a
/// list of prescriptions and every intermediate state of it is a valid routine.
/// A modal editor with a Save button would also have to answer what happens to
/// an abandoned edit, and the honest answer — "it is thrown away" — is worse for
/// the person who backgrounded the app halfway through typing a rest interval.
///
/// A session already open is unaffected: `LoggerModel` takes its `ProgramDay` at
/// construction and holds it, so editing tomorrow's deck cannot move the sets
/// under someone mid-workout.
///
/// ── THE `exerciseId` IS RESOLVED ON EVERY WRITE ─────────────────────────────
/// D3: the payload carries the catalogue uuid so the logger stamps it on each
/// set without a lookup. `RoutinePayload.resolving` fills in what it can and
/// names what it cannot, and the editor shows that list — a movement the
/// catalogue cannot place still saves, and still logs, through the legacy slug.
@MainActor
@Observable
final class RoutinesModel {

    private let database: AppDatabase
    private let userId: String

    let programId: String
    let programLabel: String

    private(set) var days: [RoutineDay] = []
    private(set) var catalogue: [Exercise] = []
    /// Movements in this program that no catalogue row answers for. Shown once,
    /// at the top, rather than as a badge on every day.
    private(set) var unresolved: [String] = []
    var failure: String?

    /// The accents a new day is given, in order.
    ///
    /// ponytail: auto-assigned by position, no colour picker. The accent tints
    /// the day's cell in the week grid and nothing else; a swatch row is easy to
    /// add to `RoutineDayEditor` the first time someone asks to choose.
    static let accents = [0xE0703C, 0x3D7AB8, 0x6B78F0, 0x4CAF87, 0xC97A45, 0x8A6BC1, 0xD1566F]

    init(database: AppDatabase, userId: String, programId: String, programLabel: String) {
        self.database = database
        self.userId = userId
        self.programId = programId
        self.programLabel = programLabel
    }

    func load() {
        do {
            days = try database.routineDays(userId: userId, programId: programId)
            catalogue = try database.exercises()
            let index = ExerciseIndex(
                catalogue.map { RemoteExercise(id: $0.id, name: $0.name, slug: $0.slug) }
            )
            unresolved = Array(Set(days.flatMap { $0.payload.resolving(index).unresolved })).sorted()
            failure = nil
        } catch {
            failure = "Could not read your routine. \(error.localizedDescription)"
        }
    }

    // MARK: - Days

    func addDay() {
        let index = days.count
        let label = "Day \(index + 1)"
        let day = RoutineDay(
            programId: programId,
            dayKey: uniqueKey(from: label),
            label: label,
            // Monday-first, wrapping. A seventh day lands back on Monday, which
            // is a real thing people do and not worth forbidding.
            weekday: (index + 1) % 7,
            accent: Self.accents[index % Self.accents.count],
            sort: index,
            payload: RoutinePayload(exercises: [])
        )
        write(day)
    }

    /// A copy of a day, movements and all.
    ///
    /// The whole point of the gesture: an Upper B that starts as a copy of
    /// Upper A and then diverges is how most splits are actually written, and
    /// retyping eight movements to get there is what makes people not bother.
    func duplicate(_ day: RoutineDay) {
        var copy = day
        copy.label = "\(day.label) copy"
        copy.dayKey = uniqueKey(from: copy.label)
        copy.sort = days.count
        copy.weekday = (day.weekday + 1) % 7
        write(copy)
    }

    func delete(_ day: RoutineDay) {
        do {
            try database.deleteRoutineDay(userId: userId, programId: programId, dayKey: day.dayKey)
            load()
        } catch {
            failure = "Could not delete that day. \(error.localizedDescription)"
        }
    }

    /// Reorder, then renumber `sort` densely from zero.
    ///
    /// Every day is rewritten, not only the moved one: `sort` is the deck's
    /// order and a sparse or duplicated sequence resolves by `weekday` then
    /// `dayKey` next time it is read, which silently un-does the move.
    func move(from source: IndexSet, to destination: Int) {
        var reordered = days
        reordered.move(fromOffsets: source, toOffset: destination)
        for index in reordered.indices { reordered[index].sort = index }
        do {
            try database.saveRoutineDays(userId: userId, reordered)
            load()
        } catch {
            failure = "Could not reorder. \(error.localizedDescription)"
        }
    }

    func rename(_ day: RoutineDay, to label: String) {
        var updated = day
        // The KEY never changes on a rename. It is what `workout_sessions.day_key`
        // stamped on every session already logged against this day, and changing
        // it would orphan every one of them.
        updated.label = label.trimmingCharacters(in: .whitespaces)
        write(updated)
    }

    func setWeekday(_ day: RoutineDay, _ weekday: Int) {
        var updated = day
        updated.weekday = weekday
        write(updated)
    }

    func setSub(_ day: RoutineDay, _ sub: String) {
        var updated = day
        let trimmed = sub.trimmingCharacters(in: .whitespaces)
        updated.sub = trimmed.isEmpty ? nil : trimmed
        write(updated)
    }

    // MARK: - Exercises inside a day

    func addExercise(_ name: String, to day: RoutineDay) {
        var updated = day
        updated.payload.exercises.append(
            RoutineExercise(
                name: name,
                // A starting prescription rather than blanks: three sets of
                // 8–12 with two minutes' rest is what most people would have
                // typed, and a row of empty fields is a row of decisions.
                sets: 3, reps: "8–12", restSec: 120,
                compound: MuscleMap.resolveMovers(name).secondary.isEmpty == false
            )
        )
        write(updated)
    }

    func updateExercise(_ exercise: RoutineExercise, at index: Int, in day: RoutineDay) {
        var updated = day
        guard updated.payload.exercises.indices.contains(index) else { return }
        updated.payload.exercises[index] = exercise
        write(updated)
    }

    func removeExercises(at offsets: IndexSet, in day: RoutineDay) {
        var updated = day
        updated.payload.exercises.remove(atOffsets: offsets)
        write(updated)
    }

    func moveExercises(from source: IndexSet, to destination: Int, in day: RoutineDay) {
        var updated = day
        updated.payload.exercises.move(fromOffsets: source, toOffset: destination)
        write(updated)
    }

    /// Every movement named across every day, counting a name once.
    /// `RoutineBuilderView` compares it against `unresolved` to tell "some are
    /// missing" from "there is no catalogue at all".
    var movementCount: Int {
        Set(days.flatMap { $0.payload.exercises.map(\.name) }).count
    }

    /// The day as it is now, by key — the editor holds a key, not a copy, so a
    /// write made on one screen is visible on the other.
    func day(_ key: String) -> RoutineDay? { days.first { $0.dayKey == key } }

    // MARK: - Catalogue

    /// Add a movement the catalogue does not have, and put it in the day.
    ///
    /// The create goes through `createExercise`, which refuses to make a second
    /// row for a name already present — so "add" on a name that exists resolves
    /// to the existing row rather than splitting its history.
    func createAndAdd(_ name: String, to day: RoutineDay) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        do {
            _ = try database.createExercise(userId: userId, name: trimmed)
            catalogue = try database.exercises()
            addExercise(trimmed, to: day)
        } catch {
            failure = "Could not add \(trimmed). \(error.localizedDescription)"
        }
    }

    // MARK: - The write

    private func write(_ day: RoutineDay) {
        do {
            var resolved = day
            let index = ExerciseIndex(
                catalogue.map { RemoteExercise(id: $0.id, name: $0.name, slug: $0.slug) }
            )
            resolved.payload = day.payload.resolving(index).payload
            try database.saveRoutineDay(userId: userId, resolved)
            load()
        } catch {
            failure = "Could not save that change. \(error.localizedDescription)"
        }
    }

    /// A key nothing in this program already uses.
    ///
    /// The key is a stable identity — `workout_sessions.day_key`, the schedule's
    /// overrides and the permanent layout all reference it — so a collision
    /// would merge two days' histories. The label may be anything; the key is
    /// slugged from it and then made unique with a counter.
    private func uniqueKey(from label: String) -> String {
        let base = label.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        let stem = base.isEmpty ? "day" : base
        let taken = Set(days.map(\.dayKey))
        guard taken.contains(stem) else { return stem }
        var n = 2
        while taken.contains("\(stem)_\(n)") { n += 1 }
        return "\(stem)_\(n)"
    }
}

extension RoutineExercise: @retroactive Identifiable {
    /// Stable WITHIN a day, which is all a `ForEach` over one day's list needs.
    /// The same movement can legitimately appear in two different days with two
    /// different set counts, and those are two different rows.
    public var id: String { name }
}
