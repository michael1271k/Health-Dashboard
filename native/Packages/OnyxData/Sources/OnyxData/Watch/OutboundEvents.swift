import Foundation
import GRDB

extension AppDatabase {

    /// This device's own events above `seq`, oldest first — what the link owes
    /// the other wrist.
    ///
    /// ── WHY IT FILTERS ON `device_id` ───────────────────────────────────────
    /// The log holds events from BOTH devices: `ingest` inserts what arrives
    /// from the watch beside what this phone wrote. Sending all of them back
    /// would return the watch its own facts on every commit — harmless, because
    /// `ingest` de-duplicates by event id and re-queues nothing, but it is a
    /// `transferUserInfo` per commit carrying data the recipient already has,
    /// and on a queue with a finite depth that is not free.
    ///
    /// ── AND WHY THE CURSOR IS `seq` AND NOT A TIMESTAMP ─────────────────────
    /// Within ONE device the Lamport clock is strictly increasing and gap-free
    /// (`tickClock` runs inside the same transaction as the insert), so it is a
    /// total order over exactly the rows this query selects. The objection that
    /// makes `seq` unusable as the SERVER's cursor — two devices both emit 41 —
    /// does not apply here, because the `device_id` filter has already reduced
    /// this to a single device's own sequence.
    ///
    /// Clock events are included: a pause is a fact the other device's session
    /// timer needs, and unlike the server (which wants `duration_min`, not the
    /// clock that produced it) the other wrist is running the same fold.
    public func localEvents(after seq: Int64, limit: Int = 200) throws -> [SetEvent] {
        try writer.read { db in
            let device = try Self.deviceId(db)
            return try SetEvent
                .filter(SetEvent.Columns.deviceId == device && SetEvent.Columns.seq > seq)
                .order(SetEvent.Columns.seq, SetEvent.Columns.id)
                .limit(limit)
                .fetchAll(db)
        }
    }
}
