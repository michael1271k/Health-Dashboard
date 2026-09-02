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
    /// Deliberately not `public`.
    ///
    /// A caller holding the writer can insert straight into `workout_sets`. It
    /// compiles, it looks right, and the next append deletes it — `reproject`
    /// rebuilds the table from the log. Exposing it would make the whole
    /// event-sourcing discipline a convention with no enforcement, on the one
    /// property every new target reaches for first. `@testable import` gives
    /// the tests what they need without it.
    let writer: any DatabaseWriter

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
    ///
    /// `deviceId` is injectable so a test can play two devices against each
    /// other with a predictable fold tiebreak. In the app it is always nil and
    /// the store generates one on first use.
    public static func inMemory(deviceId: String? = nil) throws -> AppDatabase {
        var config = Configuration()
        config.foreignKeysEnabled = true
        let db = try AppDatabase(DatabaseQueue(configuration: config))
        if let deviceId {
            try db.writer.write { conn in
                try conn.execute(
                    sql: "INSERT INTO device_state (row_id, device_id, lamport) VALUES ('local', ?, 0)",
                    arguments: [deviceId]
                )
            }
        }
        return db
    }

    // MARK: - Migrations

    /// ── MIGRATIONS ARE APPEND-ONLY, ALWAYS ──────────────────────────────────
    /// Never edit a registered migration; add another. An edited migration runs
    /// on a fresh install and not on yours, so the two diverge silently and the
    /// only symptom is a query that works on one device.
    static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        #if DEBUG && targetEnvironment(simulator)
        // In the simulator a schema change wipes and rebuilds rather than
        // requiring a new migration for every experiment.
        //
        // ── SIMULATOR, NOT `DEBUG` ──────────────────────────────────────────
        // This project signs with a free Apple team, so the build running on
        // the phone IS a Debug build. Gated on `DEBUG` alone, adding a column
        // would wipe SQLite on the device — including the `outbox`, whose own
        // doc comment says finishing a workout is the one action that must
        // never be lost. It would take every unsynced set with it, silently.
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

        // ── v2 ──────────────────────────────────────────────────────────────
        // Sets stop being rows you edit and become a log you append to. See
        // `SetEvent` for why: two devices editing one live session cannot both
        // UPDATE a row without one of the writes vanishing silently.
        //
        // `workout_sets` survives untouched, but its meaning changes: from here
        // on it is a **projection** of `set_events`, rebuilt by the fold inside
        // the same transaction as every append. Views keep reading it, so the
        // `ValueObservation` in `observeSets` needs no change at all.
        migrator.registerMigration("v2.setEvents") { db in
            try db.create(table: "set_events") { t in
                t.primaryKey("id", .text)
                t.column("session_id", .text).notNull()
                    .references("workout_sessions", onDelete: .cascade)
                // NOT a foreign key to `workout_sets`. The event log is the
                // source of truth and the sets table is derived from it, so the
                // dependency runs the other way — and an amend may legitimately
                // arrive before the append that creates the row it names.
                t.column("set_id", .text).notNull()
                t.column("device_id", .text).notNull()
                // The Lamport value. Indexed with device_id because that pair is
                // exactly the sort key the fold uses.
                t.column("seq", .integer).notNull()
                t.column("kind", .text).notNull()
                t.column("body", .blob).notNull()
                t.column("created_at", .datetime).notNull()
                t.column("is_synced", .boolean).notNull().defaults(to: false)
            }
            try db.create(
                index: "idx_events_session_order",
                on: "set_events",
                columns: ["session_id", "seq", "device_id"]
            )
            try db.create(
                index: "idx_events_set",
                on: "set_events",
                columns: ["set_id"]
            )

            // One row, always. This device's identity and its logical clock.
            //
            // The clock lives in the database rather than in memory because it
            // must survive the app being killed: a counter that resets to zero
            // on relaunch would stamp new events *below* ones already written
            // and reorder the session under the user.
            try db.create(table: "device_state") { t in
                t.primaryKey("row_id", .text)
                t.column("device_id", .text).notNull()
                t.column("lamport", .integer).notNull().defaults(to: 0)
            }
        }

        // ── v3 ──────────────────────────────────────────────────────────────
        // The pencil: which device is currently the writer for a live session.
        // See `LiveSessionOwner` — this is a user-experience mechanism, not a
        // correctness one. The log already tolerates two writers; this stops the
        // phone and the watch from both offering a keyboard for the same set.
        migrator.registerMigration("v3.livePencil") { db in
            try db.create(table: "live_sessions") { t in
                t.primaryKey("session_id", .text)
                    .references("workout_sessions", onDelete: .cascade)
                t.column("owner_device_id", .text).notNull()
                t.column("owner_since", .datetime).notNull()
                // Lamport-stamped from the same clock as the events, so a
                // contested claim resolves by the same total order the fold uses.
                t.column("claim_seq", .integer).notNull()
            }
        }

        // ── v4 ──────────────────────────────────────────────────────────────
        // Three corrections, all found by review before any real data existed.
        migrator.registerMigration("v4.projectionCannotVetoTheLog") { db in
            // (a) `workout_sets.exercise_id` had a foreign key to `exercises`.
            //     That let a DERIVED table reject a fact: a set logged on the
            //     watch against an exercise this device has not synced would
            //     fail the projection insert, roll back the transaction, and
            //     take the whole ingest batch with it. The log is the source of
            //     truth and nothing downstream of it may refuse it.
            //
            // (b) `fold_order` carries the fold's arrival tiebreak. Without it
            //     `ORDER BY set_index` relied on rowid order matching insertion
            //     order — true today, but unspecified, and the one case the
            //     fold deliberately allows (two devices claiming the same
            //     set_index) is exactly where it would diverge between phone
            //     and watch.
            try db.create(table: "workout_sets_new") { t in
                t.primaryKey("id", .text)
                t.column("session_id", .text).notNull()
                    .references("workout_sessions", onDelete: .cascade)
                t.column("exercise_id", .text).notNull()
                t.column("set_index", .integer).notNull()
                t.column("weight_kg", .double).notNull()
                t.column("reps", .integer).notNull()
                t.column("set_type", .text).notNull().defaults(to: "normal")
                t.column("side", .text)
                t.column("pair_id", .text)
                t.column("est_1rm_kg", .double)
                t.column("is_pending_sync", .boolean).notNull().defaults(to: false)
                t.column("fold_order", .integer).notNull().defaults(to: 0)
            }
            try db.execute(sql: """
                INSERT INTO workout_sets_new
                    (id, session_id, exercise_id, set_index, weight_kg, reps,
                     set_type, side, pair_id, est_1rm_kg, is_pending_sync, fold_order)
                SELECT id, session_id, exercise_id, set_index, weight_kg, reps,
                       set_type, side, pair_id, est_1rm_kg, is_pending_sync, 0
                FROM workout_sets
                """)
            try db.drop(table: "workout_sets")
            try db.rename(table: "workout_sets_new", to: "workout_sets")
            try db.create(
                index: "idx_sets_session_order",
                on: "workout_sets",
                columns: ["session_id", "set_index", "fold_order"]
            )

            // (c) `idx_events_set` indexed `set_id` alone and no query used it —
            //     write cost on every append for nothing.
            try db.drop(index: "idx_events_set")
        }

        // ── v5 ──────────────────────────────────────────────────────────────
        // A claim now records whether it was a deliberate takeover or the
        // implicit one that happens when a device starts logging. Without the
        // distinction, `ingestOwnership` applied any superseding claim — so a
        // watch whose Lamport clock had run ahead could silently take the
        // pencil off a phone mid-set, purely by starting to log while out of
        // range. See `LiveSessionOwner.ingestOwnership`.
        migrator.registerMigration("v5.explicitTakeover") { db in
            try db.alter(table: "live_sessions") { t in
                t.add(column: "is_takeover", .boolean).notNull().defaults(to: false)
            }
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
                // `fold_order` is the fold's arrival tiebreak, carried into the
                // table so two devices render a duplicated set_index in the
                // same order. Sorting on set_index alone leaned on rowid order,
                // which SQLite does not promise.
                .order(Column("set_index"), Column("fold_order"))
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
    /// The queue, oldest first. Read-only — it does NOT reserve anything, so two
    /// workers calling this both get the same rows. Use `claimOutbox` to drain.
    ///
    /// Ordered by `rowid`, not `created_at`. `SetEvent` spends a dozen lines
    /// explaining that wall clocks step backwards under NTP and must never be
    /// sorted by, and then this queue — which decides the order facts reach the
    /// server — was sorting by `Date()`. `rowid` is insertion order and cannot
    /// invert among rows that both still exist.
    public func pendingOutbox(limit: Int = 50) throws -> [OutboxItem] {
        try writer.read { db in
            try OutboxItem
                .filter(Column("status") != OutboxItem.Status.inFlight.rawValue)
                .order(Column("rowid"))
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Reserve a batch for one worker, marking it `inFlight` in the same
    /// transaction as the read.
    ///
    /// `inFlight` existed as an enum case and a filter, and nothing ever set it
    /// — so the "two workers cannot pick up the same write" the old comment
    /// promised was not implemented. A foreground flush and a background task
    /// firing together both got the same 50 rows and both uploaded them.
    public func claimOutbox(limit: Int = 50) throws -> [OutboxItem] {
        try writer.write { db in
            let batch = try OutboxItem
                .filter(Column("status") != OutboxItem.Status.inFlight.rawValue)
                .order(Column("rowid"))
                .limit(limit)
                .fetchAll(db)
            for var item in batch {
                item.status = .inFlight
                try item.update(db)
            }
            return batch
        }
    }

    /// Return abandoned reservations to the queue.
    ///
    /// Call at launch. A process killed mid-flight — which iOS does routinely —
    /// leaves rows marked `inFlight` with no worker, and without this sweep they
    /// are stranded forever: excluded from every future batch, never retried,
    /// never surfaced.
    @discardableResult
    public func resetInFlight() throws -> Int {
        try writer.write { db in
            try db.execute(
                sql: "UPDATE outbox SET status = 'pending' WHERE status = 'in_flight'"
            )
            return db.changesCount
        }
    }

    /// The server accepted it. Clear the pending flag on whatever it described.
    ///
    /// For a set event that means marking the event synced and rebuilding the
    /// session's projection, so `is_pending_sync` on the affected sets stops
    /// being true and the "queued" badge disappears from the UI on its own —
    /// the `ValueObservation` on `workout_sets` sees the rewrite and pushes it.
    public func outboxSucceeded(_ id: String) throws {
        try writer.write { db in
            guard let item = try OutboxItem.fetchOne(db, key: id) else { return }

            if item.kind.hasPrefix("set_event.") {
                let parts = item.idempotencyKey.split(separator: ":", maxSplits: 1)
                guard parts.count == 2 else { throw EventStoreError.unresolvableAck(item.idempotencyKey) }
                let eventId = String(parts[1])

                guard let sessionId = try String.fetchOne(
                    db,
                    sql: "SELECT session_id FROM set_events WHERE id = ?",
                    arguments: [eventId]
                ) else {
                    // The ack names an event this store does not have. Deleting
                    // the queue row anyway would strand the set: `is_synced`
                    // stays 0, the projection keeps reporting it pending, and
                    // nothing is left in the queue to ever clear it — a
                    // permanent "queued" badge on a set that is on the server.
                    throw EventStoreError.unresolvableAck(item.idempotencyKey)
                }

                try db.execute(
                    sql: "UPDATE set_events SET is_synced = 1 WHERE id = ?",
                    arguments: [eventId]
                )
                try Self.reproject(sessionId: sessionId, in: db)
            }

            _ = try OutboxItem.deleteOne(db, key: id)
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
