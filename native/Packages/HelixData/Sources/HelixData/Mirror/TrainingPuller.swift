import Foundation
import GRDB

/// The three tables the mirror cannot generate, pulled by hand.
///
/// ── WHY THESE THREE ARE DIFFERENT ───────────────────────────────────────────
/// `workout_sessions`, `workout_sets` and `exercises` already exist locally, in
/// shapes the logger owns and that do not match Postgres: `set_index` is
/// `set_number` on the server, `workout_sessions.date` has no server column at
/// all, and the local `exercises` row invents five fields Postgres has never
/// heard of. Mirroring them beside the existing tables under a second name
/// would give the app two answers to "what did I lift on Sunday".
///
/// So they are pulled through `SyncTranslation`, into the tables that are
/// already there.
///
/// ── AND WHY THE SETS PULL REFUSES SOME SESSIONS ─────────────────────────────
/// `workout_sets` is a PROJECTION of `set_events`, rebuilt by the fold inside
/// every append. Writing pulled rows into it for a session this device has
/// events for would be erased by the next `reproject` — and, worse, would look
/// like it had worked until then.
///
/// A session with no local events is a session this device did not log: the
/// web app's history, or another device's workout before the log existed. For
/// those the server IS the record and the pulled rows are the only rows there
/// will ever be. `reproject` never touches them, because it only ever runs for
/// a session that has events.
public actor TrainingPuller {

    private let database: AppDatabase
    private let remote: any MirrorRemote
    private let userId: String
    private let windowDays: Int?

    public init(database: AppDatabase, remote: any MirrorRemote, userId: String, windowDays: Int? = 90) {
        self.database = database
        self.remote = remote
        self.userId = userId
        self.windowDays = windowDays
    }

    /// Pull sessions changed since the cursor, then their sets, then the
    /// exercise catalogue.
    @discardableResult
    public func refresh(now: Date = Date()) async throws -> MirrorReport {
        var report = MirrorReport()

        let cursor = try database.mirrorCursor(table: "workout_sessions")
        let request = MirrorRequest(
            table: "workout_sessions",
            userId: userId,
            since: cursor.map { ("updated_at", ISO8601.string($0)) }
        )
        let remoteSessions: [RemoteSessionRow] = try await remote.select(RemoteSessionRow.self, request: request)
        let newest = try database.applyPulledSessions(remoteSessions)
        report.tables += 1
        report.rows += remoteSessions.count
        report.rowsByTable["workout_sessions"] = remoteSessions.count

        // Sets come with their parents. They carry neither an `updated_at` nor a
        // date of their own, so "the sets of the sessions that changed" is the
        // only delta available — and it is the right one, because a set edit
        // bumps its session's `updated_at` through the same trigger.
        let sessionIds = remoteSessions.map(\.id)
        if !sessionIds.isEmpty {
            let sets: [RemoteSetRow] = try await remote.selectIn(
                RemoteSetRow.self, table: "workout_sets", column: "session_id", values: sessionIds
            )
            let landed = try database.applyPulledSets(sets)
            report.rows += landed
            report.tables += 1
            report.rowsByTable["workout_sets"] = landed
        }

        // The catalogue is 60 rows and changes when a movement is added, which
        // is a few times a year. A cursor for that is bookkeeping nobody reads.
        let exercises: [RemoteExerciseRow] = try await remote.select(
            RemoteExerciseRow.self,
            request: MirrorRequest(table: "exercises", userId: userId, since: nil)
        )
        let catalogue = try database.applyPulledExercises(exercises)
        report.rows += catalogue
        report.tables += 1
        report.rowsByTable["exercises"] = catalogue

        // Last, and only on success: a cursor moved before the sets landed
        // would skip them forever on the next pull.
        try database.setMirrorCursor(table: "workout_sessions", to: newest, at: now)
        return report
    }
}

/// `public.exercises`, reduced to the two columns the local table shares with it.
public struct RemoteExerciseRow: Codable, Sendable, Equatable {
    public var id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

// MARK: - Landing the rows

extension AppDatabase {

    /// Server sessions → the local `workout_sessions` table.
    ///
    /// Returns the newest `updated_at` seen, which becomes the cursor.
    @discardableResult
    func applyPulledSessions(_ rows: [RemoteSessionRow]) throws -> Date? {
        guard !rows.isEmpty else { return nil }
        return try writer.write { db in
            var newest: Date?
            for row in rows {
                let existing = try WorkoutSession.fetchOne(db, key: row.id)
                var session = WorkoutSession(
                    id: row.id,
                    userId: row.userId,
                    dayKey: row.dayKey,
                    // The column that does not exist server-side, derived here
                    // and nowhere else. The device's calendar, never the
                    // server's — a session logged at 21:30 UTC on a Wednesday
                    // in Jerusalem belongs to Thursday.
                    date: SyncTranslation.sessionDate(for: row.startedAt),
                    startedAt: row.startedAt,
                    endedAt: row.endedAt,
                    durationMin: row.durationMin.map(Double.init),
                    sessionRpe: row.sessionRpe,
                    notes: row.notes,
                    // It came FROM the server, so by definition it is not
                    // waiting to go TO it — unless this device still has queued
                    // events for it, in which case the flag is not ours to
                    // clear and the existing value stands.
                    isPendingSync: existing?.isPendingSync ?? false
                )
                if existing?.isPendingSync == true { session.isPendingSync = true }
                try session.save(db)
                if let at = row.updatedAt, newest == nil || at > newest! { newest = at }
            }
            return newest
        }
    }

    /// Server sets → the local projection, for sessions this device never logged.
    @discardableResult
    func applyPulledSets(_ rows: [RemoteSetRow]) throws -> Int {
        guard !rows.isEmpty else { return 0 }
        return try writer.write { db in
            var written = 0
            var bySession: [String: [RemoteSetRow]] = [:]
            for row in rows { bySession[row.sessionId, default: []].append(row) }

            for (sessionId, sessionRows) in bySession {
                // THE GUARD. A session with events is a session whose sets are
                // a fold over them; pulled rows would be deleted by the very
                // next append and the two would disagree in between.
                let hasEvents = try Int.fetchOne(
                    db, sql: "SELECT count(*) FROM set_events WHERE session_id = ?", arguments: [sessionId]
                ) ?? 0
                guard hasEvents == 0 else { continue }

                // Replace the session's sets wholesale. Safe here and ONLY here:
                // these rows are not local facts, the pull returned all of them
                // for this session, and a set deleted on the server has to be
                // able to disappear locally.
                try db.execute(
                    sql: "DELETE FROM workout_sets WHERE session_id = ?", arguments: [sessionId]
                )
                for (order, row) in sessionRows.sorted(by: { $0.setNumber < $1.setNumber }).enumerated() {
                    try WorkoutSet(
                        id: row.id,
                        sessionId: row.sessionId,
                        exerciseId: row.exerciseId,
                        // The rename, inverted.
                        setIndex: row.setNumber,
                        weightKg: row.weightKg,
                        reps: row.reps,
                        setType: row.setType,
                        side: SyncTranslation.localSide(row.side),
                        pairId: row.pairId,
                        est1rmKg: row.est1rmKg,
                        rpe: row.rpe,
                        isPendingSync: false,
                        foldOrder: order
                    ).save(db)
                    written += 1
                }
            }
            return written
        }
    }

    /// Server catalogue → the local `exercises` table.
    ///
    /// Only `id` and `name`: the two columns the two schemas share. The local
    /// table's other five fields are the logger's own and are left alone, which
    /// is why this is a targeted UPDATE-or-INSERT rather than a `save` of a
    /// freshly built row — the latter would blank them on every pull.
    @discardableResult
    func applyPulledExercises(_ rows: [RemoteExerciseRow]) throws -> Int {
        guard !rows.isEmpty else { return 0 }
        return try writer.write { db in
            for row in rows {
                try db.execute(
                    sql: """
                        INSERT INTO exercises (id, name) VALUES (?, ?)
                        ON CONFLICT(id) DO UPDATE SET name = excluded.name
                        """,
                    arguments: [row.id, row.name]
                )
            }
            return rows.count
        }
    }
}
