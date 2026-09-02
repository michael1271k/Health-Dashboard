import Foundation
import GRDB

// MARK: - Device identity and the logical clock

extension AppDatabase {

    /// This install's device id, created on first use and stable thereafter.
    ///
    /// Deliberately **not** `identifierForVendor`: that value changes when the
    /// last app from a vendor is deleted and reinstalled, and it is unavailable
    /// early in launch. A device id that can change would split one device's
    /// history into two participants in the merge, and the fold's tiebreak would
    /// start giving different answers on either side of a reinstall.
    public func deviceId() throws -> String {
        try writer.write { db in try Self.deviceId(db) }
    }

    static func deviceId(_ db: Database) throws -> String {
        if let existing = try String.fetchOne(
            db, sql: "SELECT device_id FROM device_state WHERE row_id = 'local'"
        ) {
            return existing
        }
        let fresh = newHelixID()
        try db.execute(
            sql: "INSERT INTO device_state (row_id, device_id, lamport) VALUES ('local', ?, 0)",
            arguments: [fresh]
        )
        return fresh
    }

    /// Stamp a locally-produced event: advance the clock and hand back the value.
    ///
    /// Runs inside the caller's transaction on purpose. If the clock advanced
    /// and the event that used the value failed to insert, the next event would
    /// skip a number — harmless — but if the event inserted and the clock did
    /// not advance, two events would share a stamp and the merge would have to
    /// guess. Same transaction, so neither can happen.
    static func tickClock(_ db: Database) throws -> Int64 {
        _ = try deviceId(db)   // ensures the row exists
        try db.execute(sql: "UPDATE device_state SET lamport = lamport + 1 WHERE row_id = 'local'")
        guard let stamp = try Int64.fetchOne(
            db, sql: "SELECT lamport FROM device_state WHERE row_id = 'local'"
        ) else {
            // Defaulting to 1 here would hand out a stamp that has almost
            // certainly been used already, silently collapsing two causally
            // ordered events onto the fold's tiebreak. A missing device_state
            // row is not a recoverable condition; it is a corrupt store.
            throw EventStoreError.clockUnavailable
        }
        return stamp
    }

    /// Take account of an event produced elsewhere. Never decreases.
    static func observeClock(_ db: Database, _ remote: Int64) throws {
        _ = try deviceId(db)
        try db.execute(
            sql: "UPDATE device_state SET lamport = MAX(lamport, ?) WHERE row_id = 'local'",
            arguments: [remote]
        )
    }

    /// The current Lamport value. Test and diagnostic use.
    public func clockValue() throws -> Int64 {
        try writer.read { db in
            try Int64.fetchOne(db, sql: "SELECT lamport FROM device_state WHERE row_id = 'local'") ?? 0
        }
    }
}

// MARK: - Writing sets

extension AppDatabase {

    /// Log a set.
    ///
    /// Everything below funnels through `record`, so there is exactly one code
    /// path that appends a fact, enqueues its sync and rebuilds the projection —
    /// and it does all three in one transaction. A set that exists on the phone
    /// but never reaches the queue is training history lost with no symptom, so
    /// the two cannot be allowed to come apart.
    @discardableResult
    public func appendSet(
        sessionId: String,
        setId: String = newHelixID(),
        _ snapshot: SetSnapshot
    ) throws -> SetEvent {
        try record(sessionId: sessionId, setId: setId, body: .append(snapshot))
    }

    /// Change some fields of a set already logged.
    ///
    /// An empty patch is rejected rather than written: an event that changes
    /// nothing is permanent noise in a log that is never compacted.
    @discardableResult
    public func amendSet(
        sessionId: String,
        setId: String,
        _ patch: SetPatch
    ) throws -> SetEvent {
        guard !patch.isEmpty else { throw EventStoreError.emptyPatch }
        return try record(sessionId: sessionId, setId: setId, body: .amend(patch))
    }

    /// Delete a set — by appending a tombstone, never by deleting anything.
    ///
    /// The event that created the set stays in the log. That is the point: the
    /// other device may not have heard about the deletion yet, and when its
    /// append finally arrives the tombstone is what stops the set coming back.
    @discardableResult
    public func voidSet(sessionId: String, setId: String) throws -> SetEvent {
        try record(sessionId: sessionId, setId: setId, body: .void)
    }

    private func record(
        sessionId: String,
        setId: String,
        body: SetEvent.Body
    ) throws -> SetEvent {
        try writer.write { db in
            // Starting to log claims the pencil; logging while another device
            // holds it is refused. `ingest` is deliberately NOT guarded — a
            // remote event is a fact that already happened, and refusing it
            // would lose a set to enforce a UI rule.
            try Self.claimPencil(db, sessionId: sessionId, force: false)

            let device = try Self.deviceId(db)
            let event = SetEvent(
                sessionId: sessionId,
                setId: setId,
                deviceId: device,
                seq: try Self.tickClock(db),
                body: body
            )
            try Self.commit(event, in: db)
            return event
        }
    }

    /// Insert one event, queue it, and rebuild the session's projection.
    /// Assumes it is already inside a write transaction.
    static func commit(_ event: SetEvent, in db: Database) throws {
        try event.insert(db)

        var item = OutboxItem(
            kind: "set_event.\(event.kind.rawValue)",
            payload: try HelixJSON.encoder.encode(event),
            // Events are immutable and uniquely identified, so the key is the
            // event itself. That makes a retry a true no-op — unlike the
            // row-upsert scheme it replaces, where a retry had to guess whether
            // the payload it held was still the current one.
            idempotencyKey: "set_event:\(event.id)"
        )
        try item.insert(db)

        try reproject(sessionId: event.sessionId, in: db)
    }

    /// Accept events produced by another device.
    ///
    /// Used by the Watch link and by the pull side of Supabase sync. Three
    /// things have to happen and all three are here:
    ///
    /// 1. Duplicates are ignored — the same event can legitimately arrive twice,
    ///    over two transports.
    /// 2. The local clock takes account of what it has seen, so this device's
    ///    next event stamps strictly above anything it is replying to.
    /// 3. Remote events are **not** queued for upload. They came from elsewhere;
    ///    echoing them back is how a sync loop starts.
    public func ingest(_ events: [SetEvent]) throws {
        guard !events.isEmpty else { return }
        try writer.write { db in
            var touched: Set<String> = []
            for event in events.map(\.normalisedIdentity) {
                try Self.observeClock(db, event.seq)
                let known = try SetEvent
                    .filter(SetEvent.Columns.id == event.id)
                    .fetchCount(db) > 0
                if known { continue }
                // Already synced by definition: it reached us from the network.
                try event.insert(db)
                try db.execute(
                    sql: "UPDATE set_events SET is_synced = 1 WHERE id = ?",
                    arguments: [event.id]
                )
                touched.insert(event.sessionId)
            }
            for sessionId in touched {
                try Self.reproject(sessionId: sessionId, in: db)
            }
        }
    }

    /// A session's log, in fold order.
    public func setEvents(sessionId: String) throws -> [SetEvent] {
        try writer.read { db in
            try SetEvent
                .filter(SetEvent.Columns.sessionId == sessionId)
                .order(SetEvent.Columns.seq, SetEvent.Columns.deviceId, SetEvent.Columns.id)
                .fetchAll(db)
        }
    }

    /// Live-updating log for a session — the Watch mirror reads this.
    public func observeSetEvents(sessionId: String) -> ValueObservation<ValueReducers.Fetch<[SetEvent]>> {
        ValueObservation.tracking { db in
            try SetEvent
                .filter(SetEvent.Columns.sessionId == sessionId)
                .order(SetEvent.Columns.seq, SetEvent.Columns.deviceId, SetEvent.Columns.id)
                .fetchAll(db)
        }
    }
}

// MARK: - The projection

extension AppDatabase {

    /// Rebuild `workout_sets` for one session from its log.
    ///
    /// ── WHY REBUILD RATHER THAN PATCH ───────────────────────────────────────
    /// Applying each event incrementally to the table would be faster and would
    /// be a second implementation of the merge rule — one in `SetEventFold` and
    /// one here, both plausible, drifting apart the first time either is
    /// touched. That is the failure the atlas generator exists to prevent, and
    /// it is worth far more than the microseconds. A session is tens of rows;
    /// the fold runs in microseconds; there is exactly one merge rule.
    ///
    /// `is_pending_sync` is true for a set with any event still unsynced, which
    /// is the honest answer to "has the server seen this set?"
    static func reproject(sessionId: String, in db: Database) throws {
        let events = try SetEvent
            .filter(SetEvent.Columns.sessionId == sessionId)
            .fetchAll(db)

        let unsyncedSetIds = Set(
            try String.fetchAll(
                db,
                sql: "SELECT DISTINCT set_id FROM set_events WHERE session_id = ? AND is_synced = 0",
                arguments: [sessionId]
            )
        )

        try db.execute(
            sql: "DELETE FROM workout_sets WHERE session_id = ?",
            arguments: [sessionId]
        )

        for (order, var set) in SetEventFold.sets(from: events, sessionId: sessionId).enumerated() {
            set.isPendingSync = unsyncedSetIds.contains(set.id)
            // The fold's own position, carried into the table so `observeSets`
            // can reproduce its order rather than leaning on rowid.
            set.foldOrder = order
            try set.insert(db)
        }
    }

    /// Rebuild every session's projection. For a migration or a repair, not for
    /// the hot path.
    public func reprojectAll() throws {
        try writer.write { db in
            let ids = try String.fetchAll(db, sql: "SELECT DISTINCT session_id FROM set_events")
            for id in ids { try Self.reproject(sessionId: id, in: db) }
        }
    }
}

// MARK: - Errors

public enum EventStoreError: Error, Equatable, Sendable {
    /// An amend that changes nothing. Rejected so the log stays meaningful.
    case emptyPatch
    /// `device_state` is missing or unreadable. The store cannot stamp an event
    /// without it, and guessing a stamp reorders history.
    case clockUnavailable
    /// An outbox acknowledgement whose event this store cannot resolve. Deleting
    /// the queue row anyway would strand the set as permanently "pending".
    case unresolvableAck(String)
    /// Another device holds the pencil for this session.
    case notSessionOwner(owner: String)
}


// MARK: - Identity normalisation

extension SetEvent {
    /// Lowercase the ids, at the one boundary where a foreign id enters.
    ///
    /// Postgres renders `uuid` lowercase and `UUID().uuidString` is uppercase,
    /// so an event that has been to the server and back arrives under a
    /// different string. `ingest`'s de-duplication is a case-sensitive compare,
    /// so without this the event inserts a second time, the fold sees two
    /// appends with different `setId`s, and the set appears twice — with a
    /// tombstone for one casing failing to suppress the other.
    var normalisedIdentity: SetEvent {
        SetEvent(
            id: id.lowercased(),
            sessionId: sessionId.lowercased(),
            setId: setId.lowercased(),
            deviceId: deviceId,
            seq: seq,
            createdAt: createdAt,
            body: body
        )
    }
}
