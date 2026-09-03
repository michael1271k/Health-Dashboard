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

    public init(table: String, id: String) {
        self.table = table
        self.id = id
    }
}

/// PostgREST, for one already-shaped row.
///
/// A protocol so the queue's rules are testable without a network — the same
/// reason `SyncRemote` and `MirrorRemote` are protocols.
public protocol MirrorPushRemote: Sendable {
    /// `POST /rest/v1/<table>` with `Prefer: resolution=merge-duplicates`.
    func upsertRow<T: Encodable & Sendable>(
        _ row: T, table: String, conflict: String
    ) async throws
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
    /// The cost is that clearing a value locally does not clear it server-side.
    /// Nothing in the app clears a mirrored column today; when something does,
    /// it wants its own explicit-null row type, the way `RemoteSessionRow` has.
    func pushRow<T: MirrorRow>(
        _ type: T.Type, from database: AppDatabase, table: String, conflict: String, id: String
    ) async throws -> Bool {
        guard let row = try database.mirrorRow(T.self, id: id) else { return false }
        try await upsertRow(row, table: table, conflict: conflict)
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

    /// One mirrored row by primary key.
    func mirrorRow<T: MirrorRow>(_ type: T.Type, id: String) throws -> T? {
        try writer.read { db in try T.filter(key: id).fetchOne(db) }
    }

    /// Queue a mirrored row for upload.
    ///
    /// Idempotency key is `row:<table>:<id>` and the insert REPLACES any item
    /// already holding it, so editing a day five times before the phone finds a
    /// signal is one upload rather than five. The key is unique in the schema,
    /// so accumulating would throw anyway — but the reason to collapse is that
    /// five identical writes are five round trips that all do the same thing.
    func enqueueRowUpsert(table: String, id: String) throws {
        try writer.write { db in try Self.enqueueRowUpsert(table: table, id: id, in: db) }
    }

    /// The same, inside a transaction the caller already owns.
    ///
    /// Every ingest write uses this form: the row and the intent to upload it
    /// must land together or not at all. A row written outside the transaction
    /// that queues it is a row that exists on the phone and will never reach the
    /// server if the process dies in between — the failure the outbox exists to
    /// make impossible.
    static func enqueueRowUpsert(table: String, id: String, in db: Database) throws {
        let key = "row:\(table):\(id)"
        try db.execute(sql: "DELETE FROM outbox WHERE idempotency_key = ?", arguments: [key])
        var item = OutboxItem(
            kind: SyncKind.rowUpsert,
            payload: try HelixJSON.encoder.encode(RowRef(table: table, id: id)),
            idempotencyKey: key
        )
        try item.insert(db)
    }
}
