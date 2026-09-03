import Foundation
import GRDB

// MARK: - Reads

extension AppDatabase {

    /// Days in an inclusive date range, newest first — the order the history
    /// list draws and the order the seven-day rail reverses.
    public func nutritionDays(from: String, to: String) async throws -> [NutritionDay] {
        try await writer.read { db in
            try NutritionDay
                .filter(Column("date") >= from && Column("date") <= to)
                .order(Column("date").desc)
                .fetchAll(db)
        }
    }

    /// One day, or nil if it was never tracked.
    public func nutritionDay(on date: String) async throws -> NutritionDay? {
        try await writer.read { db in try NutritionDay.fetchOne(db, key: date) }
    }

    /// The stored goal row for a user.
    public func storedGoals(userId: String) async throws -> StoredGoals? {
        try await writer.read { db in try StoredGoals.fetchOne(db, key: userId) }
    }

    /// A live sequence of the days in a range.
    ///
    /// ── WHY THIS RETURNS AN `AsyncThrowingStream` AND NOT A `ValueObservation` ──
    /// `observeSets` returns `ValueObservation<ValueReducers.Fetch<[WorkoutSet]>>`,
    /// which names two GRDB types in a public signature and forces every caller
    /// to import GRDB to hold the result. The database is supposed to be an
    /// implementation detail of this package; a view that cannot name its own
    /// data source without importing SQLite's Swift wrapper is not one.
    ///
    /// A stream is also what SwiftUI actually wants: `for await days in stream`
    /// inside `.task`, cancelled automatically when the view goes away.
    public func nutritionDayStream(from: String, to: String) -> AsyncThrowingStream<[NutritionDay], any Error> {
        let observation = ValueObservation.tracking { db in
            try NutritionDay
                .filter(Column("date") >= from && Column("date") <= to)
                .order(Column("date").desc)
                .fetchAll(db)
        }
        return stream(observation)
    }

    /// A live sequence of one user's stored goals.
    public func storedGoalsStream(userId: String) -> AsyncThrowingStream<StoredGoals?, any Error> {
        let observation = ValueObservation.tracking { db in
            try StoredGoals.fetchOne(db, key: userId)
        }
        return stream(observation)
    }

    /// Bridge a `ValueObservation` into a stream, keeping GRDB out of the
    /// signature above.
    ///
    /// `.immediate` scheduling so the first value arrives synchronously on the
    /// current actor rather than one hop later. The difference is a frame of the
    /// empty state on every appearance, which reads as a flicker on a list that
    /// already has its data on disk — and having the data on disk is the entire
    /// reason this store exists.
    private func stream<T: Sendable>(
        _ observation: ValueObservation<ValueReducers.Fetch<T>>
    ) -> AsyncThrowingStream<T, any Error> {
        AsyncThrowingStream { continuation in
            let cancellable = observation.start(
                in: writer,
                scheduling: .immediate,
                onError: { continuation.finish(throwing: $0) },
                onChange: { continuation.yield($0) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }
}

// MARK: - Writes

extension AppDatabase {

    /// Replace a date range with what the server just said.
    ///
    /// ── DELETE-THEN-INSERT, NOT UPSERT, AND ONLY FOR A CACHE ────────────────
    /// An upsert leaves behind rows the server has since deleted — a day whose
    /// nutrition entry was removed would sit in the list forever, because
    /// nothing would ever arrive to overwrite it. Replacing the window makes the
    /// local range mean exactly "what the server has for these dates".
    ///
    /// This is safe here for one reason only: nothing in this table is a local
    /// fact. Do NOT copy this shape to `workout_sets` or `set_events`, where the
    /// local row is the record and a delete-then-insert against a partial fetch
    /// would drop a workout that had not synced yet.
    func replaceNutritionDays(_ days: [NutritionDay], from: String, to: String) async throws {
        try await writer.write { db in
            try NutritionDay
                .filter(Column("date") >= from && Column("date") <= to)
                .deleteAll(db)
            for day in days {
                try day.insert(db)
            }
        }
    }

    /// Store (or replace) the goal row.
    func saveStoredGoals(_ goals: StoredGoals) async throws {
        try await writer.write { db in
            try goals.save(db)
        }
    }
}
