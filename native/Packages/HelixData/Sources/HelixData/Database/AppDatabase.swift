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

    /// A connection that must not migrate — the widget extension's read-only
    /// pool. Only the app owns the schema; an extension that ran the migrator
    /// against a file the app has open would race it on the one thing neither
    /// can recover from.
    init(unmigrated writer: any DatabaseWriter) {
        self.writer = writer
    }

    /// The App Group the app and the widget extension share the file through.
    public static let appGroupID = "group.app.helix.health"
    static let fileName = "helix.sqlite"

    public enum OpenError: Error, Equatable {
        /// `readOnly(folderURL:)` found no database — the app has not run yet.
        case missingDatabase(String)
    }

    /// Where the store lives: the App Group container, so the widget extension
    /// can read it, with the app's own Application Support folder as the
    /// fallback when there is no container (a free-team build has no App
    /// Groups). A store that predates the container is moved across ONCE,
    /// with its WAL and SHM — a pool opened on the sqlite alone would replay a
    /// stale checkpoint and the last unsynced sets would be gone.
    public static func sharedFolder() -> URL {
        let appSupport = URL.applicationSupportDirectory.appending(path: "Helix", directoryHint: .isDirectory)
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
        else { return appSupport }
        let shared = container.appending(path: "Helix", directoryHint: .isDirectory)
        moveStoreIfNeeded(from: appSupport, to: shared)
        return shared
    }

    static func moveStoreIfNeeded(from old: URL, to new: URL) {
        let fm = FileManager.default
        let oldStore = old.appendingPathComponent(fileName).path
        let newStore = new.appendingPathComponent(fileName).path
        guard fm.fileExists(atPath: oldStore), !fm.fileExists(atPath: newStore) else { return }
        try? fm.createDirectory(at: new, withIntermediateDirectories: true)
        for suffix in ["", "-wal", "-shm"] where fm.fileExists(atPath: oldStore + suffix) {
            try? fm.moveItem(atPath: oldStore + suffix, toPath: newStore + suffix)
        }
    }

    /// The on-disk store.
    ///
    /// `.completeUntilFirstUserAuthentication`, not `.completeUnlessOpen`: a
    /// widget timeline is computed while the phone is locked, by a process that
    /// did not have the file open beforehand, so "unless open" would hand the
    /// extension a file it cannot read at exactly the moment it runs. The
    /// database holds training logs, not credentials — the session token lives
    /// in the Keychain and nowhere near this file — so the first unlock after
    /// boot is protection enough.
    public static func onDisk(folderURL: URL) throws -> AppDatabase {
        try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
        let url = folderURL.appendingPathComponent(fileName)

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
        #if !os(macOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
        #endif
        return try AppDatabase(pool)
    }

    /// The widget extension's view of the store: read-only, never migrated,
    /// and absent until the app has run once. Throws `OpenError` for that last
    /// case so the extension can show "open HELIX" rather than an empty tile.
    public static func readOnly(folderURL: URL) throws -> AppDatabase {
        let url = folderURL.appendingPathComponent(fileName)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw OpenError.missingDatabase(url.path)
        }
        var config = Configuration()
        config.readonly = true
        config.foreignKeysEnabled = true
        return AppDatabase(unmigrated: try DatabasePool(path: url.path, configuration: config))
    }

    /// Fires after every committed write — an event append, a day edit, a
    /// mirror pull — so the app can ask WidgetKit to reload. Whole database,
    /// not a region: the widgets read nearly every table and the cost of a
    /// spurious reload is one snapshot build. Cancel the return value to stop.
    public func onCommit(_ handler: @escaping @Sendable () -> Void) -> AnyDatabaseCancellable {
        DatabaseRegionObservation(tracking: .fullDatabase)
            .start(in: writer, onError: { _ in }, onChange: { _ in handler() })
    }

    /// The one user this mirror holds. The widget extension has no auth
    /// session, so it asks the store whose data it is — `profiles` first, then
    /// any row that carries a `user_id`.
    public func knownUserId() throws -> String? {
        try writer.read { db in
            for table in ["profiles", "user_goals", "daily_logs"] {
                if let id = try String.fetchOne(db, sql: "SELECT user_id FROM \(table) LIMIT 1") { return id }
            }
            return nil
        }
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

        // ── v6 ── The Nutrition screen's read cache.
        //
        // Two tables that hold NOTHING this device produced. Every field arrives
        // from Postgres and Postgres stays the source of truth for all of it, so
        // both can be dropped and refetched without losing a fact. They are in
        // the same database as `set_events` only because a screen that reads
        // from two stores has two places to be stale.
        //
        // Note what is absent: no `is_pending_sync`, no outbox kind, no write
        // path at all. A read cache that can be written locally is a write path
        // with no conflict rule, which is the thing the event log exists to
        // avoid. Editing a macro is a Wave 3 item and it will go through the
        // same append-only route the logger does.
        migrator.registerMigration("v6.nutritionReadCache") { db in
            try db.create(table: "nutrition_days") { t in
                // The logical day, `yyyy-MM-dd`. Text, like every other date in
                // this store — SQLite has no date type, and a string that sorts
                // correctly is worth more here than an epoch nobody can read in
                // a query.
                t.primaryKey("date", .text)
                // Every macro is nullable. Nil is "never tracked", which is not
                // zero: a day with no intake recorded says nothing about
                // adherence, and defaulting it to 0 would grade an untracked
                // day as a perfect deficit.
                t.column("calories", .double)
                t.column("protein_g", .double)
                t.column("carbs_g", .double)
                t.column("fat_g", .double)
                t.column("phase", .text)
                t.column("steps", .double)
                t.column("active_cal", .double)
                t.column("water_ml", .double)
                t.column("nutrition_exception", .text)
                // NOT NULL with a default, matching Postgres, where this column
                // is `boolean NOT NULL`. The flag is a statement about
                // confidence and "unknown" is not one of its values.
                t.column("nutrition_estimated", .boolean).notNull().defaults(to: false)
            }

            try db.create(table: "user_goals") { t in
                t.primaryKey("user_id", .text)
                // All nullable, as in Postgres. A missing calorie goal renders
                // the bar ungraded rather than graded against a guess — see the
                // `1955` incident in `useNutritionGoals`, where local state
                // seeded with a literal nobody chose was worse than no goal.
                t.column("calorie_goal", .integer)
                t.column("protein_goal_g", .integer)
                t.column("carbs_goal_g", .integer)
                t.column("fat_goal_g", .integer)
                t.column("water_goal_ml", .integer)
                t.column("steps_goal", .integer)
                t.column("goal_preset", .text)
            }
        }

        // ── v7 ── RPE lands in the projection.
        //
        // `workout_sets.rpe` has existed in Postgres since the beginning and
        // was simply never carried locally — the logger could store how heavy
        // a set was and not how hard it felt, which is half of the double
        // progression rule ("all work sets at the ceiling at RPE <= 8.5").
        //
        // Nullable, with no default. An unrated set must stay distinguishable
        // from a set rated zero; defaulting it would grade an untracked session
        // as effortless, which is the same class of mistake as defaulting a
        // missing calorie goal.
        //
        // `SetSnapshot` gains the field at the same time. That is a wire-format
        // change and it is a SAFE one in this direction only: a new build
        // decoding an old row sees the key absent and gets `nil`, which is the
        // correct answer for a set logged before ratings were stored. An old
        // build decoding a new row ignores the key. Neither loses a set.
        migrator.registerMigration("v7.setRpe") { db in
            try db.alter(table: "workout_sets") { t in
                t.add(column: "rpe", .double)
            }
        }

        // ── v8 ── The queue learns to wait.
        //
        // `outboxFailed` recorded `attempts` and `last_error` and nothing ever
        // read them, so a write the server will never accept — a CHECK
        // violation, an exercise that cannot be resolved — was retried at full
        // speed on every single drain, forever. On a phone that is radio time
        // and battery spent to earn the same 400.
        //
        // A timestamp rather than a counter-and-a-formula-at-read-time: the
        // drain query has to be able to skip an item with an index-friendly
        // comparison, and "when may this be tried again" is a fact about the
        // row, not something every reader should re-derive. NULL means "now" —
        // which is what every row queued before this migration means, and what
        // a fresh append means.
        migrator.registerMigration("v8.outboxBackoff") { db in
            try db.alter(table: "outbox") { t in
                t.add(column: "next_attempt_at", .datetime)
            }
        }

        // ── v9 ── The mirror. Twenty-six tables, generated, plus its cursors.
        //
        // ── AND THE TWO IT REPLACES ─────────────────────────────────────────
        // `v6.nutritionReadCache` created `nutrition_days` and `user_goals` for
        // one screen: a hand-joined view of three server tables, filled by four
        // hand-written queries in `NutritionSync`. The mirror pulls all three of
        // those tables — plus the other twenty-three — from a generated
        // catalogue, so keeping v6's pair would mean two pull paths writing
        // overlapping facts, and one of them would go stale the first time
        // nobody noticed.
        //
        // `user_goals` in particular COLLIDES: the mirror's version of that
        // table is the real one, all thirty-one columns of it, keyed on `id`
        // rather than on `user_id`. Only one of the two can exist.
        //
        // Dropping them loses nothing. Neither table ever held a fact this
        // device produced — v6's own comment says so — and both are refetched
        // on the first refresh.
        migrator.registerMigration("v9.mirror") { db in
            try db.drop(table: "nutrition_days")
            try db.drop(table: "user_goals")

            try Self.migrateMirrorV1(db)

            // How far each table has been pulled. One row per table, written
            // only by `setMirrorCursor`, which moves it forward and never back.
            try db.create(table: "sync_cursors") { t in
                t.primaryKey("table_name", .text)
                t.column("cursor_at", .datetime).notNull()
                t.column("pulled_at", .datetime).notNull()
            }
        }

        // When each table last synced, append-only. `sync_cursors` answers "how
        // far", this answers "when" — and keeps every answer, so the Settings
        // Sync Status section can show a history and a first-launch backfill
        // can be recognised by the table being empty for a user.
        migrator.registerMigration("v10.syncStatus") { db in
            try db.create(table: "sync_status") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("user_id", .text).notNull()
                t.column("table_name", .text).notNull()
                t.column("synced_at", .datetime).notNull()
                t.column("reason", .text).notNull()
                t.column("rows", .integer).notNull()
            }
            try db.create(index: "sync_status_user_table", on: "sync_status", columns: ["user_id", "table_name", "synced_at"])
        }

        // The four server columns the session wire row never carried. Measured
        // from an `HKWorkout` overlapping the session, or estimated (and
        // stamped as such) when there is none — see `SessionMetrics`. Nullable
        // like the server's; the two flags default false like the server's.
        migrator.registerMigration("v11.sessionMetrics") { db in
            try db.alter(table: "workout_sessions") { t in
                t.add(column: "avg_bpm", .integer)
                t.add(column: "calories_burned", .integer)
                t.add(column: "avg_bpm_estimated", .boolean).notNull().defaults(to: false)
                t.add(column: "calories_estimated", .boolean).notNull().defaults(to: false)
            }
        }

        // Every `user_id` in the store, spelled the way Postgres spells it.
        //
        // ── WHAT WAS IN THE STORE ───────────────────────────────────────────
        // `AppEnvironment.userIdString` returned `UUID.uuidString`, which is
        // uppercase; a Postgres `uuid` column renders lowercase. So a row this
        // device WROTE and the same row PULLED BACK carried different
        // `user_id` bytes, and SQLite compares TEXT byte for byte with no
        // collation on any of these columns. `Column("user_id") == userId`
        // therefore matched the handful of rows typed on this phone and none
        // of the hundreds synced to it. Six symptoms, one cause — see
        // `HelixJSON.canonicalUserID`.
        //
        // ── WHY DUPLICATES EXIST, AND ONLY IN SOME TABLES ───────────────────
        // A table keyed on `id` never doubled: the pull found the row by its
        // uuid and rewrote `user_id` in place. A table the device upserts by a
        // NATURAL key did: the lookup missed the pulled row, so the write
        // minted a second one under a fresh uuid, and now both spellings sit
        // there. `MirrorCatalogue.conflict` is that natural key — introspected
        // from the server's unique indexes, not guessed — so the collapse can
        // be driven off the catalogue instead of a hand list that would fall
        // behind the schema.
        //
        // ── WHICH TWIN SURVIVES ─────────────────────────────────────────────
        // The lowercase one, always, and not because it is newer. It is a
        // verbatim copy of a server row, and `sync_cursors` has already moved
        // past it: delete it and it does not come back until its `updated_at`
        // changes, which is permanent loss. The uppercase twin's content was
        // pushed to that same server row through the same conflict target, so
        // it is either already inside the survivor or still in the outbox and
        // about to be — nothing is lost, at worst something is late. Today's
        // score is the visible case, and `DailyScoreStore` recomputes it on
        // the next tick regardless.
        migrator.registerMigration("v12.lowercaseUserIds") { db in
            let naturalKeys = Dictionary(
                uniqueKeysWithValues: MirrorCatalogue.tables.map { ($0.name, $0.conflict.split(separator: ",").map(String.init)) }
            )
            let tables = try String.fetchAll(db, sql: """
                SELECT name FROM sqlite_master
                 WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'grdb_%'
                 ORDER BY name
                """)
            for table in tables {
                guard try db.columns(in: table).contains(where: { $0.name == "user_id" }) else { continue }
                let name = table.quotedDatabaseIdentifier

                if let key = naturalKeys[table], key.contains("user_id") {
                    // `IS` rather than `=` so a NULL key column matches a NULL
                    // one; every column here is NOT NULL today, and a
                    // regenerated catalogue may not be.
                    let rest = key.filter { $0 != "user_id" }
                        .map { "twin.\($0.quotedDatabaseIdentifier) IS \(name).\($0.quotedDatabaseIdentifier)" }
                    let match = (["twin.user_id = lower(\(name).user_id)"] + rest).joined(separator: " AND ")
                    try db.execute(sql: """
                        DELETE FROM \(name)
                         WHERE user_id <> lower(user_id)
                           AND EXISTS (SELECT 1 FROM \(name) AS twin WHERE \(match))
                        """)
                }

                try db.execute(sql: "UPDATE \(name) SET user_id = lower(user_id) WHERE user_id <> lower(user_id)")
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

    /// One session by id. The drainer's read: it pushes the row as it stands
    /// now, never a copy captured when the queue item was written.
    public func session(id: String) throws -> WorkoutSession? {
        try writer.read { db in try WorkoutSession.fetchOne(db, key: id) }
    }

    public func exercises() throws -> [Exercise] {
        try writer.read { db in
            try Exercise.order(Column("name")).fetchAll(db)
        }
    }

    /// The projected sets for a session, in the fold's own order.
    ///
    /// The non-observing twin of `observeSets`. The logger needs it exactly
    /// once — at attach, to fold what is already logged back onto the deck —
    /// and a `ValueObservation` for a single read is a subscription to cancel
    /// for no benefit.
    public func sets(sessionId: String) throws -> [WorkoutSet] {
        try writer.read { db in
            try WorkoutSet
                .filter(Column("session_id") == sessionId)
                .order(Column("set_index"), Column("fold_order"))
                .fetchAll(db)
        }
    }

    /// The session for a split that is still being logged, if there is one.
    ///
    /// ── UNFINISHED IS THE WHOLE PREDICATE ───────────────────────────────────
    /// `ended_at IS NULL`. Without it, opening the logger after finishing a
    /// morning Upper A rejoins THAT session, and an evening Upper A hours later
    /// is appended to the morning's row — two workouts silently merged into one,
    /// with a duration spanning the gap between them. Two-a-days are real, and
    /// so is finishing a session and going back in to correct a set.
    ///
    /// Keyed on `(date, day_key)` and never on the weekday: a swap moves a
    /// workout to another date, and a Wednesday "Delts & Arms" landed in the
    /// Upper A curve exactly that way.
    public func liveSession(dayKey: String, date: String) throws -> WorkoutSession? {
        try writer.read { db in
            try WorkoutSession
                .filter(Column("date") == date
                        && Column("day_key") == dayKey
                        && Column("ended_at") == nil)
                .order(Column("started_at"))
                .fetchOne(db)
        }
    }

    /// Find the unfinished session for a split, or open one.
    ///
    /// ── WHY IT IS LOOK-UP-OR-CREATE AND NOT CREATE ──────────────────────────
    /// `set_events.session_id` has a foreign key to `workout_sessions`, so a
    /// row must exist before the first append. A logger that created one on
    /// every launch would start a second session beside the one you are halfway
    /// through, and every set logged after the relaunch would be attributed to
    /// it — a split silently torn in two, with both halves well-formed.
    ///
    /// The caller should reach this on the FIRST WRITE and not on appearing.
    /// Called from `onAppear`, it leaves an empty session row behind every time
    /// the tab is opened and closed again.
    @discardableResult
    public func openSession(
        userId: String,
        dayKey: String,
        date: String,
        startedAt: Date = Date()
    ) throws -> WorkoutSession {
        if let live = try liveSession(dayKey: dayKey, date: date) { return live }
        return try writer.write { db in
            // Re-checked inside the transaction: the read above is not part of
            // it, and two writers (the phone and, at Wave 5, the watch) racing
            // on the same split would otherwise each create a row.
            if let live = try WorkoutSession
                .filter(Column("date") == date
                        && Column("day_key") == dayKey
                        && Column("ended_at") == nil)
                .order(Column("started_at"))
                .fetchOne(db) {
                return live
            }
            let session = WorkoutSession(
                id: newHelixID(), userId: userId, dayKey: dayKey, date: date,
                startedAt: startedAt, isPendingSync: true
            )
            try session.insert(db)
            return session
        }
    }

    /// Stamp a session finished, and queue the finished row for upload.
    ///
    /// `duration_min` is derived here rather than by the caller because a
    /// duration computed from a clock the row does not carry is a duration
    /// nobody can check.
    ///
    /// The enqueue is in the same transaction as the stamp, for the same reason
    /// `EventStore.commit` puts the append and its queue row in one: a session
    /// that is finished locally and absent from the queue is a workout that
    /// stops syncing with no symptom.
    @discardableResult
    public func closeSession(
        id: String,
        endedAt: Date = Date(),
        sessionRpe: Double? = nil
    ) throws -> WorkoutSession? {
        try writer.write { db in
            guard var session = try WorkoutSession.fetchOne(db, key: id) else { return nil }
            session.endedAt = endedAt
            if let startedAt = session.startedAt {
                session.durationMin = max(0, endedAt.timeIntervalSince(startedAt) / 60)
            }
            // `nil` leaves the existing rating alone rather than clearing it —
            // an unrated session is not a session rated zero, and the battery
            // falls back to its own default rather than treating it as easy.
            if let sessionRpe { session.sessionRpe = sessionRpe }
            try session.update(db)
            try Self.enqueueSessionUpsert(sessionId: id, in: db)
            return session
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
    ///
    /// `now` is injectable so a test can prove the backoff without sleeping.
    public func claimOutbox(limit: Int = 50, now: Date = Date()) throws -> [OutboxItem] {
        try writer.write { db in
            let batch = try OutboxItem
                .filter(Column("status") != OutboxItem.Status.inFlight.rawValue)
                // NULL means "now" — every row queued before v8, and every
                // fresh append. `Column(...) == nil` renders `IS NULL`, which
                // is the only comparison NULL answers truthfully.
                .filter(Column("next_attempt_at") == nil || Column("next_attempt_at") <= now)
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

    /// Return THESE reservations to the queue, if they are still reserved.
    ///
    /// The narrow twin of `resetInFlight`, for a drain to clean up after
    /// itself. Blanket-resetting at the end of a drain would also release rows
    /// a *concurrent* drain is still uploading — harmless for correctness,
    /// since every write here is idempotent, but it opens a window where the
    /// same batch is uploaded twice for no reason.
    ///
    /// The `status = 'in_flight'` guard is what makes it safe to call on every
    /// path: a row already acknowledged is gone, and a row already failed keeps
    /// its `failed` status and its backoff.
    @discardableResult
    public func returnToQueue(ids: [String]) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try writer.write { db in
            let placeholders = databaseQuestionMarks(count: ids.count)
            try db.execute(
                sql: """
                    UPDATE outbox SET status = 'pending'
                    WHERE status = 'in_flight' AND id IN (\(placeholders))
                    """,
                arguments: StatementArguments(ids)
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
    ///
    /// It does get slower, though. `SyncBackoff` decides when it may next be
    /// tried, from the attempt count this call just raised — computed here
    /// rather than by the caller so there is no path that records a failure and
    /// forgets to space out its retry.
    public func outboxFailed(_ id: String, error: String, now: Date = Date()) throws {
        try writer.write { db in
            guard var item = try OutboxItem.fetchOne(db, key: id) else { return }
            item.attempts += 1
            item.lastError = error
            item.status = .failed
            item.nextAttemptAt = now.addingTimeInterval(SyncBackoff.delay(attempts: item.attempts))
            try item.update(db)
        }
    }

    /// The server has this session row.
    ///
    /// `openSession` stamps `is_pending_sync` and, until the drainer existed,
    /// nothing ever cleared it — so every session the logger opened stayed
    /// flagged for the life of the install, whatever the server actually had.
    /// The sets clear themselves through `reproject`; the session row needs
    /// this, because it is not a projection of anything.
    public func markSessionSynced(id: String) throws {
        try writer.write { db in
            try db.execute(
                sql: "UPDATE workout_sessions SET is_pending_sync = 0 WHERE id = ?",
                arguments: [id]
            )
        }
    }

    /// Queue the session row itself for upload.
    ///
    /// ── WHY THIS IS NOT COVERED BY THE SET EVENTS ───────────────────────────
    /// Every append queues an item, and the drainer pushes the session row
    /// alongside the sets it names — so a session in progress reaches Postgres
    /// for free. Finishing one does not: `closeSession` writes `ended_at`,
    /// `duration_min` and `session_rpe` and there is no set event afterwards to
    /// carry them. Without this call the last thing every workout does never
    /// syncs, and the server keeps the session open forever.
    ///
    /// The payload is the session id and nothing else. The drainer reads the
    /// current row when it runs, so a queued item can never carry a stale copy
    /// of a session that was edited after it was queued.
    static func enqueueSessionUpsert(sessionId: String, in db: Database) throws {
        let key = "session:\(sessionId)"
        // Replace rather than accumulate. `idempotency_key` is UNIQUE, so a
        // second close (rating a session after finishing it) would throw; and
        // even without the constraint, N identical "push this session" items
        // are N round trips that all do the same thing.
        try db.execute(sql: "DELETE FROM outbox WHERE idempotency_key = ?", arguments: [key])
        var item = OutboxItem(
            kind: SyncKind.sessionUpsert,
            payload: try HelixJSON.encoder.encode(SessionRef(sessionId: sessionId)),
            idempotencyKey: key
        )
        try item.insert(db)
    }
}
