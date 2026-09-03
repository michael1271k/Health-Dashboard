import Foundation
import GRDB

/// The WRITE half of the mirror.
///
/// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
/// The drainer knows how to push a workout: sessions and sets have bespoke
/// translation because their local shape genuinely differs from Postgres
/// (`set_index` ↔ `set_number`, a `date` column the server does not have). Every
/// OTHER table the app writes — a day's HealthKit metrics, a macro row, a
/// preference, a score — is already stored locally under the server's own column
/// names by the generated mirror. There is nothing to translate.
///
/// So there is nothing to hand-write either. One outbox kind carries a table
/// name and a row id; the generated catalogue knows which Swift type that name
/// means; the row is read at drain time and upserted as-is. Adding a table to
/// the push path is a line in `native/schema/supabase.json`, not a new file.
///
/// ── AND WHY THE PAYLOAD IS AN ID, NOT THE ROW ───────────────────────────────
/// Same rule `enqueueSessionUpsert` already follows. A queued copy of a row is
/// a snapshot that goes stale the moment the user edits the day again, and then
/// two queued items race to be last. Carrying the id means the drainer always
/// sends what the store currently holds, several edits collapse into one upload,
/// and a replay writes byte-identical values.
public struct RowRef: Codable, Sendable, Equatable {
    public var table: String
    public var id: String
    /// Columns to send as an explicit `null` when the row no longer has them.
    ///
    /// The upsert is a MERGE (see `pushRow`): a `nil` column is omitted from
    /// the body, so clearing a value locally leaves the server's copy standing.
    /// Naming the column here is how a clear reaches the server — an exception
    /// day un-marked, a water override handed back to HealthKit. Only a column
    /// that is ABSENT from the body at drain time is nulled, so a value typed
    /// back in after the clear is sent as itself. Decoded as empty when absent,
    /// so an item queued by an earlier build still drains.
    public var nulls: [String]

    public init(table: String, id: String, nulls: [String] = []) {
        self.table = table
        self.id = id
        self.nulls = nulls
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        table = try container.decode(String.self, forKey: .table)
        id = try container.decode(String.self, forKey: .id)
        nulls = try container.decodeIfPresent([String].self, forKey: .nulls) ?? []
    }
}

/// A row to DELETE, named by the columns PostgREST filters on.
///
/// A dictionary rather than an id because a delete has no body: the server is
/// told `?user_id=eq.…&date=eq.…&item_key=eq.…`, and only the writer knows
/// which columns make the row unique. For an `id`-keyed table that is
/// `["id": …]`.
public struct RowDeleteRef: Codable, Sendable, Equatable {
    public var table: String
    public var key: [String: String]

    public init(table: String, key: [String: String]) {
        self.table = table
        self.key = key
    }
}

/// What can go wrong queuing a delete that is not a database error.
public enum RowPushError: Error, Equatable {
    /// `enqueueRowDelete` was handed a key missing one of the table's
    /// primary-key columns. Thrown rather than guessed: a delete addressed by
    /// half a key is a delete of the wrong rows.
    case incompleteKey(table: String, missing: String)
    /// A delete with no filter is `DELETE` of every row the policy lets this
    /// user see. Never sent, whatever queued it.
    case emptyKey(table: String)
}

/// PostgREST, for one already-shaped row.
///
/// A protocol so the queue's rules are testable without a network — the same
/// reason `SyncRemote` and `MirrorRemote` are protocols.
public protocol MirrorPushRemote: Sendable {
    /// `POST /rest/v1/<table>` with `Prefer: resolution=merge-duplicates`.
    /// `nulls` names columns to send as an explicit `null` when the encoded row
    /// omits them — see `RowRef.nulls`.
    func upsertRow<T: Encodable & Sendable>(
        _ row: T, table: String, conflict: String, nulls: [String]
    ) async throws

    /// `DELETE /rest/v1/<table>?<column>=eq.<value>…`, one filter per key
    /// column. A delete of a row the server never had is a no-op, which is what
    /// makes a replay safe.
    func deleteRow(table: String, key: [String: String]) async throws
}

public extension MirrorPushRemote {
    /// Read the local row and send it. `false` when it is no longer there.
    ///
    /// Called only by the generated catalogue, which supplies `T`.
    ///
    /// ── MERGE SEMANTICS ARE DELIBERATE ──────────────────────────────────────
    /// Swift's synthesised `encode(to:)` uses `encodeIfPresent` for optionals,
    /// so a `nil` column is OMITTED from the body rather than sent as null —
    /// which makes the upsert a MERGE of the columns this device knows about.
    /// That is exactly what `ingestDailyLog` documented as its own contract on
    /// the web ("only provided keys, preserving AI-completed advanced fields"),
    /// and it is what keeps a HealthKit push from blanking a hand-entered
    /// InBody reading it knows nothing about.
    ///
    /// The cost is that clearing a value locally does not clear it server-side
    /// — unless the writer names the column in `RowRef.nulls`, which is the one
    /// deliberate exception to the merge and is what Wave 4's clears use.
    func pushRow<T: MirrorRow>(
        _ type: T.Type, from database: AppDatabase, table: String, conflict: String, ref: RowRef
    ) async throws -> Bool {
        guard let row = try database.mirrorRow(T.self, id: ref.id) else { return false }
        try await upsertRow(row, table: table, conflict: conflict, nulls: ref.nulls)
        return true
    }
}

// MARK: - Reading and queuing

public extension AppDatabase {

    /// The `updated_at` a row this device INVENTS is created with.
    ///
    /// ── A LOCAL WRITE MUST NOT MOVE THE DELTA CURSOR ────────────────────────
    /// `MirrorPuller` sets each cursor to `max(updated_at)` read back out of the
    /// LOCAL table, and the next pull asks the server for everything at or after
    /// it. A locally-invented row stamped with the device clock therefore
    /// contributes to that maximum — and on a phone running three minutes fast
    /// it drags the cursor three minutes into the future, where every server row
    /// written in that window is stepped over and never pulled again.
    ///
    /// That is the same failure the server-side `BEFORE UPDATE` trigger exists
    /// to prevent, arriving through the back door. So a row this device creates
    /// carries the earliest possible timestamp instead: it cannot raise the
    /// maximum, the cursor keeps meaning "the newest thing the SERVER told me",
    /// and the true value arrives on the next pull — the push bumps the server's
    /// own `updated_at`, which is by definition after the cursor.
    ///
    /// An EXISTING row keeps whatever it already had, for the same reason. Only
    /// the server assigns this column a meaningful value.
    static var localWriteTimestamp: Date { .distantPast }
}

public extension AppDatabase {

    /// The separator inside a composite row id.
    ///
    /// ASCII 31, UNIT SEPARATOR — the character the encoding has had since 1963
    /// for exactly this. `|` and `:` are both real content here: an exercise key
    /// carries punctuation and a `day_key` is already colon-shaped, so either
    /// would eventually split one id in the wrong place and push the wrong row.
    static let rowKeySeparator = "\u{1F}"

    /// The id of a row whose primary key is several columns.
    ///
    /// Values in the table's own primary-key ORDER — the order is what the
    /// lookup zips back together, so a caller that passes phase before plan
    /// silently addresses nothing.
    static func rowID(_ parts: [String]) -> String {
        parts.joined(separator: rowKeySeparator)
    }

    /// One mirrored row by primary key, composite or not.
    ///
    /// ── TEN OF THE TWENTY-SIX MIRRORED TABLES HAVE COMPOSITE KEYS ───────────
    /// `plan_phase_goals`, `plan_phase_volume`, `target_profiles`,
    /// `daily_targets`, `supplement_log`, `supplement_dose_overrides`,
    /// `personal_records`, `routine_templates`, `program_day_layout` and
    /// `schedule_overrides` are all keyed locally on the natural key the
    /// catalogue upserts on, because a mirrored row must be findable by the same
    /// key the server resolves it by.
    ///
    /// `filter(key:)` with a single value is not merely wrong for those: GRDB
    /// answers it with `GRDBPrecondition(primaryKey.columns.count == 1)`, which
    /// is a `precondition` — a CRASH, in release too, on the drain path. Nothing
    /// had tripped it because every table written so far (`daily_logs`,
    /// `daily_metrics`, `daily_scores`, `user_goals`) happens to be keyed on
    /// `id`. Wave 3 is the first wave that writes a composite one.
    ///
    /// So the primary key is read from the schema rather than assumed, and a
    /// composite id is split back into its columns. A row id whose part count
    /// does not match the table is `nil` — the same answer as a row that is gone,
    /// which the caller already handles as "queued for something deleted".
    func mirrorRow<T: MirrorRow>(_ type: T.Type, id: String) throws -> T? {
        try writer.read { db in
            let columns = try db.primaryKey(T.databaseTableName).columns
            guard columns.count > 1 else { return try T.filter(key: id).fetchOne(db) }

            let parts = id.components(separatedBy: Self.rowKeySeparator)
            guard parts.count == columns.count else { return nil }
            let key = Dictionary(uniqueKeysWithValues: zip(columns, parts.map { $0 as (any DatabaseValueConvertible)? }))
            return try T.filter(key: key).fetchOne(db)
        }
    }

    /// Queue a mirrored row for upload.
    ///
    /// Idempotency key is `row:<table>:<id>` and the insert REPLACES any item
    /// already holding it, so editing a day five times before the phone finds a
    /// signal is one upload rather than five. The key is unique in the schema,
    /// so accumulating would throw anyway — but the reason to collapse is that
    /// five identical writes are five round trips that all do the same thing.
    func enqueueRowUpsert(table: String, id: String, nulls: [String] = []) throws {
        try writer.write { db in try Self.enqueueRowUpsert(table: table, id: id, nulls: nulls, in: db) }
    }

    /// The same, inside a transaction the caller already owns.
    ///
    /// Every ingest write uses this form: the row and the intent to upload it
    /// must land together or not at all. A row written outside the transaction
    /// that queues it is a row that exists on the phone and will never reach the
    /// server if the process dies in between — the failure the outbox exists to
    /// make impossible.
    ///
    /// ── CLEARS ACCUMULATE ACROSS THE COLLAPSE ───────────────────────────────
    /// Replacing the queued item is what makes five edits one upload, but a
    /// clear is a fact about the row's history, not about the latest edit: if
    /// the exception flag was cleared and then the calories were nudged before a
    /// signal, the second item must still carry the first one's null or the
    /// server keeps the flag. So the `nulls` are UNIONED with the item being
    /// replaced, and `pushRow` only nulls what the row is actually missing.
    ///
    /// A pending delete of the same row is dropped: the row exists again.
    static func enqueueRowUpsert(table: String, id: String, nulls: [String] = [], in db: Database) throws {
        let key = "row:\(table):\(id)"
        var cleared = Set(nulls)
        if let previous = try OutboxItem.filter(Column("idempotency_key") == key).fetchOne(db),
           let ref = try? HelixJSON.decoder.decode(RowRef.self, from: previous.payload) {
            cleared.formUnion(ref.nulls)
        }
        try db.execute(
            sql: "DELETE FROM outbox WHERE idempotency_key IN (?, ?)",
            arguments: [key, Self.deleteKey(table, id)]
        )
        var item = OutboxItem(
            kind: SyncKind.rowUpsert,
            payload: try HelixJSON.encoder.encode(RowRef(table: table, id: id, nulls: cleared.sorted())),
            idempotencyKey: key
        )
        try item.insert(db)
    }

    /// Queue a DELETE of a mirrored row, inside the caller's transaction.
    ///
    /// `key` is column → value for EVERY primary-key column of the local table,
    /// which is also what the server is filtered on. The caller deletes the
    /// local row in the same transaction; this queues the server's half.
    ///
    /// A pending upsert of the same row is dropped: a queue that deleted a row
    /// and then re-created it from a stale item behind the delete would undo
    /// the user's gesture on the next drain. Re-creating the row afterwards
    /// (`enqueueRowUpsert`) drops the delete in turn, so the queue never holds
    /// both opinions about one row.
    static func enqueueRowDelete(table: String, key: [String: String], in db: Database) throws {
        let id = try rowID(table: table, key: key, in: db)
        try db.execute(
            sql: "DELETE FROM outbox WHERE idempotency_key IN (?, ?)",
            arguments: ["row:\(table):\(id)", Self.deleteKey(table, id)]
        )
        var item = OutboxItem(
            kind: SyncKind.rowDelete,
            payload: try HelixJSON.encoder.encode(RowDeleteRef(table: table, key: key)),
            idempotencyKey: Self.deleteKey(table, id)
        )
        try item.insert(db)
    }

    /// The outbox id of a row addressed by column → value.
    ///
    /// Reads the primary-key column ORDER from the schema, so a writer can name
    /// the columns in any order and still produce the id `mirrorRow` will split
    /// back correctly. Throws rather than guesses when a key column is missing.
    static func rowID(table: String, key: [String: String], in db: Database) throws -> String {
        let columns = try db.primaryKey(table).columns
        return rowID(try columns.map { column in
            guard let value = key[column] else {
                throw RowPushError.incompleteKey(table: table, missing: column)
            }
            return value
        })
    }

    private static func deleteKey(_ table: String, _ id: String) -> String { "rowdel:\(table):\(id)" }
}
