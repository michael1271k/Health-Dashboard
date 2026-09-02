import Foundation
import GRDB

/// GRDB conformance for `SetEvent`, kept out of the pure file.
///
/// `SetEvent.swift` imports Foundation and nothing else, so the merge rule stays
/// testable with no database in sight. Persistence is a separate concern and
/// lives here.
///
/// The `body` enum has associated values, so it is stored as one JSON blob
/// rather than being spread across nullable columns. `kind` is written beside it
/// as a plain string so SQL can filter and index without decoding every blob.
extension SetEvent: FetchableRecord, PersistableRecord {
    public static var databaseTableName: String { "set_events" }

    public enum Columns {
        public static let id = Column("id")
        public static let sessionId = Column("session_id")
        public static let setId = Column("set_id")
        public static let deviceId = Column("device_id")
        public static let seq = Column("seq")
        public static let kind = Column("kind")
        public static let body = Column("body")
        public static let createdAt = Column("created_at")
        public static let isSynced = Column("is_synced")
    }

    public init(row: Row) throws {
        let blob: Data = row["body"]
        self.init(
            id: row["id"],
            sessionId: row["session_id"],
            setId: row["set_id"],
            deviceId: row["device_id"],
            seq: row["seq"],
            createdAt: row["created_at"],
            body: try JSONDecoder().decode(Body.self, from: blob)
        )
    }

    public func encode(to container: inout PersistenceContainer) throws {
        container["id"] = id
        container["session_id"] = sessionId
        container["set_id"] = setId
        container["device_id"] = deviceId
        container["seq"] = seq
        container["kind"] = kind.rawValue
        container["body"] = try JSONEncoder().encode(body)
        container["created_at"] = createdAt
        // `is_synced` is deliberately absent. It is this device's bookkeeping —
        // whether the fact has reached the server — not something the fact
        // itself knows, so it is not on the value type. Omitting it here lets
        // the column default apply on insert and, more importantly, means
        // re-saving an event can never silently reset a row back to unsynced.
    }
}
