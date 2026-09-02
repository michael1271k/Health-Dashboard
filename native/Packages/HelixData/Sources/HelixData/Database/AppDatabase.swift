import Foundation
import GRDB

/// The local SQLite store — **the app's only read path**.
///
/// ── THE RULE ────────────────────────────────────────────────────────────────
/// Views read from here and from nowhere else. Nothing in the UI awaits a
/// network call to draw. Sync writes into this store in the background, and
/// `ValueObservation` pushes the change into the views. That is what makes the
/// app instant offline and, more to the point, instant *online* — the "loading"
/// state that a remote-first app spends its life in simply does not exist.
///
/// It is also what replaces roughly 500 lines of the web app: the react-query
/// persister with its 96 KB per-query cap and 1.5 MB budget, the `buster: 'v22'`
/// cache-version string, the JSON-safety walk that strips Maps and Sets before
/// serialising, and the 24 `localStorage` keys. None of that is architecture; it
/// is all working around the browser not having a database.
public final class AppDatabase: Sendable {
    public let writer: any DatabaseWriter

    public init(_ writer: any DatabaseWriter) throws {
        self.writer = writer
        try Self.migrator.migrate(writer)
    }

    /// The on-disk store, in Application Support.
    ///
    /// `.completeFileProtection` would make the file unreadable while the device
    /// is locked, which breaks background work; `.completeUnlessOpen` keeps an
    /// already-open handle usable after lock, which is what a background sync
    /// needs. The database holds training logs, not credentials — the session
    /// token lives in the Keychain and nowhere near this file.
    public static func onDisk(folderURL: URL) throws -> AppDatabase {
        try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
        let url = folderURL.appendingPathComponent("helix.sqlite")

        var config = Configuration()
        config.foreignKeysEnabled = true
        #if DEBUG
        // Every statement, in the console, during development. The single most
        // useful thing when a query returns fewer rows than it should.
        config.prepareDatabase { db in
            db.trace { print("[SQL] \($0)") }
        }
        #endif

        let pool = try DatabasePool(path: url.path, configuration: config)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUnlessOpen],
            ofItemAtPath: url.path
        )
        return try AppDatabase(pool)
    }

    /// An in-memory store, for tests.
    public static func inMemory() throws -> AppDatabase {
        var config = Configuration()
        config.foreignKeysEnabled = true
        return try AppDatabase(DatabaseQueue(configuration: config))
    }

    // MARK: - Migrations

    /// ── MIGRATIONS ARE APPEND-ONLY, ALWAYS ──────────────────────────────────
    /// Never edit a registered migration; add another. An edited migration runs
    /// on a fresh install and not on yours, so the two diverge silently and the
    /// only symptom is a query that works on one device.
    static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        #if DEBUG
        // In development a schema change wipes and rebuilds rather than
        // requiring a new migration for every experiment. Never in release.
        migrator.eraseDatabaseOnSchemaChange = true
        #endif

        migrator.registerMigration("v1.logger") { db in
            try db.create(table: "exercises") { t in
                t.primaryKey("id", .text)
                t.column("name", .text).notNull()
                t.column("primary_muscle", .text)
                t.column("secondary_muscles", .text)
                t.column("equipment", .text)
                t.column("is_unilateral", .boolean)
                t.column("is_bodyweight", .boolean)
            }

            try db.create(table: "workout_sessions") { t in
                t.primaryKey("id", .text)
                t.column("user_id", .text).notNull()
                t.column("day_key", .text)
                t.column("date", .text).notNull().indexed()
                t.column("started_at", .datetime)
                t.column("ended_at", .datetime)
                t.column("duration_min", .double)
                t.column("session_rpe", .double)
                t.column("notes", .text)
                t.column("is_pending_sync", .boolean).notNull().defaults(to: false)
            }

            try db.create(table: "workout_sets") { t in
                t.primaryKey("id", .text)
                // Spelled out rather than `belongsTo`, which derives a camelCase
                // `sessionId` column. Every column here must match the Postgres
                // name exactly — see `columnNamesMatchPostgres` in the tests.
                t.column("session_id", .text).notNull()
                    .references("workout_sessions", onDelete: .cascade)
                t.column("exercise_id", .text).notNull()
                    .references("exercises", onDelete: .restrict)
                t.column("set_index", .integer).notNull()
                // NOT NULL with no default: a set without a load is 0 kg, which
                // is a real bodyweight set. A NULL here would mean "unknown",
                // and nothing in the domain knows what to do with that.
                t.column("weight_kg", .double).notNull()
                t.column("reps", .integer).notNull()
                t.column("set_type", .text).notNull().defaults(to: "normal")
                t.column("side", .text)
                t.column("pair_id", .text)
                t.column("est_1rm_kg", .double)
                t.column("is_pending_sync", .boolean).notNull().defaults(to: false)
            }
            try db.create(
                index: "idx_sets_session_order",
                on: "workout_sets",
                columns: ["session_id", "set_index"]
            )

            try db.create(table: "outbox") { t in
                t.primaryKey("id", .text)
                t.column("kind", .text).notNull()
                t.column("payload", .blob).notNull()
                // The whole point of the queue: a retry must not double-apply.
                t.column("idempotency_key", .text).notNull().unique()
                t.column("created_at", .datetime).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                t.column("last_error", .text)
                t.column("status", .text).notNull().defaults(to: "pending")
            }
            try db.create(
                index: "idx_outbox_ready",
                on: "outbox",
                columns: ["status", "created_at"]
            )
        }

        return migrator
    }
}

// MARK: - Reads

extension AppDatabase {
    /// Sessions for a day, newest first.
    public func sessions(on date: String) throws -> [WorkoutSession] {
        try writer.read { db in
            try WorkoutSession
                .filter(Column("date") == date)
                .order(Column("started_at").desc)
                .fetchAll(db)
        }
    }

    /// Live-updating sets for a session, in logged order.
    ///
    /// A `ValueObservation` rather than a fetch: the logger writes a set and the
    /// list redraws, with no refresh call, no invalidation key and no chance of
    /// the two disagreeing.
    public func observeSets(sessionId: String) -> ValueObservation<ValueReducers.Fetch<[WorkoutSet]>> {
        ValueObservation.tracking { db in
            try WorkoutSet
                .filter(Column("session_id") == sessionId)
                .order(Column("set_index"))
                .fetchAll(db)
        }
    }

    public func exercises() throws -> [Exercise] {
        try writer.read { db in
            try Exercise.order(Column("name")).fetchAll(db)
        }
    }
}

// MARK: - Writes

extension AppDatabase {
    /// Save a set and enqueue its sync in **one transaction**.
    ///
    /// Atomicity is the point. If the row landed but the queue entry did not,
    /// the set would exist on the phone and never on the server, and nothing
    /// would ever notice — the app would look correct while silently dropping
    /// training history.
    public func saveSet(_ set: WorkoutSet, enqueueAs kind: String = "set.upsert") throws {
        try writer.write { db in
            var stored = set
            stored.isPendingSync = true
            try stored.save(db)

            var item = OutboxItem(
                kind: kind,
                payload: try JSONEncoder().encode(stored),
                idempotencyKey: "\(kind):\(stored.id)"
            )
            // An edit to a set already queued replaces the queued payload rather
            // than adding a second write for the same row — last write wins, and
            // the unique index on `idempotency_key` is what enforces it.
            try item.upsert(db)
        }
    }

    /// The queue, oldest first. `inFlight` items are excluded so two workers
    /// cannot pick up the same write.
    public func pendingOutbox(limit: Int = 50) throws -> [OutboxItem] {
        try writer.read { db in
            try OutboxItem
                .filter(Column("status") != OutboxItem.Status.inFlight.rawValue)
                .order(Column("created_at"))
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// The server accepted it. Clear the pending flag on whatever it described.
    public func outboxSucceeded(_ id: String) throws {
        _ = try writer.write { db in
            try OutboxItem.deleteOne(db, key: id)
        }
    }

    /// The server did not accept it. Record why and let it be retried.
    ///
    /// The item is NOT dropped after N attempts. A workout that cannot sync is a
    /// workout you still did, and a queue that gives up is a queue that loses
    /// data quietly — the failure belongs in front of the user, not in a
    /// discarded row.
    public func outboxFailed(_ id: String, error: String) throws {
        try writer.write { db in
            guard var item = try OutboxItem.fetchOne(db, key: id) else { return }
            item.attempts += 1
            item.lastError = error
            item.status = .failed
            try item.update(db)
        }
    }
}
