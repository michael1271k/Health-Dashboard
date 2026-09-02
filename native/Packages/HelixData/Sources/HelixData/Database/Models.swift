import Foundation
import GRDB

/// The Wave 1 local schema — only what the Live Logger needs.
///
/// ── THESE MIRROR SUPABASE, THEY DO NOT REDEFINE IT ──────────────────────────
/// Supabase remains the schema-of-record. Column names here match the Postgres
/// ones exactly (snake_case, via `CodingKeys`) so a row can be decoded straight
/// from PostgREST and inserted locally without a translation layer in between —
/// a translation layer being one more place for `day_key` to quietly become
/// `dayKey` and then `splitDay`.
///
/// Every field that is nullable in Postgres is `Optional` here. Nothing is
/// defaulted to zero on the way in: the domain distinguishes "absent" from
/// "zero" in at least three places that have caused real bugs, and the store is
/// not the layer that gets to erase that distinction.

// MARK: - Exercise

public struct Exercise: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "exercises"

    public var id: String
    public var name: String
    public var primaryMuscle: String?
    public var secondaryMuscles: String?     // JSON array, stored as text
    public var equipment: String?
    public var isUnilateral: Bool?
    public var isBodyweight: Bool?

    public enum CodingKeys: String, CodingKey {
        case id
        case name
        case primaryMuscle = "primary_muscle"
        case secondaryMuscles = "secondary_muscles"
        case equipment
        case isUnilateral = "is_unilateral"
        case isBodyweight = "is_bodyweight"
    }

    public init(
        id: String, name: String, primaryMuscle: String? = nil,
        secondaryMuscles: String? = nil, equipment: String? = nil,
        isUnilateral: Bool? = nil, isBodyweight: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.primaryMuscle = primaryMuscle
        self.secondaryMuscles = secondaryMuscles
        self.equipment = equipment
        self.isUnilateral = isUnilateral
        self.isBodyweight = isBodyweight
    }
}

// MARK: - Workout session

public struct WorkoutSession: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "workout_sessions"

    public var id: String
    public var userId: String
    /// The logical calendar day this session is attributed to.
    ///
    /// NEVER infer the split from the weekday. A swap moves a workout to another
    /// date and the weekday stops meaning anything — a Wednesday "Delts & Arms"
    /// landed in the Upper A curve exactly this way.
    public var dayKey: String?
    public var date: String                  // ISO yyyy-MM-dd
    public var startedAt: Date?
    public var endedAt: Date?
    public var durationMin: Double?
    /// CR-10. Nil means "not rated", which is not the same as 0 — the battery
    /// falls back to its own default rather than treating it as an easy session.
    public var sessionRpe: Double?
    public var notes: String?
    /// Set locally the moment a session is committed; cleared when the outbox
    /// confirms the server accepted it.
    public var isPendingSync: Bool

    public enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case dayKey = "day_key"
        case date
        case startedAt = "started_at"
        case endedAt = "ended_at"
        case durationMin = "duration_min"
        case sessionRpe = "session_rpe"
        case notes
        case isPendingSync = "is_pending_sync"
    }

    public init(
        id: String, userId: String, dayKey: String? = nil, date: String,
        startedAt: Date? = nil, endedAt: Date? = nil, durationMin: Double? = nil,
        sessionRpe: Double? = nil, notes: String? = nil, isPendingSync: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.dayKey = dayKey
        self.date = date
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationMin = durationMin
        self.sessionRpe = sessionRpe
        self.notes = notes
        self.isPendingSync = isPendingSync
    }
}

// MARK: - Workout set

public struct WorkoutSet: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "workout_sets"

    public var id: String
    public var sessionId: String
    public var exerciseId: String
    public var setIndex: Int
    /// Kilograms. **Zero is a real, valid load** — a bodyweight set. It must
    /// never be coerced to nil or filtered out; `Epley.oneRepMax` is the thing
    /// that decides an unloaded set has no 1RM, and it decides that by returning
    /// nil, not by the set being absent.
    public var weightKg: Double
    public var reps: Int
    /// `normal` | `warmup` | `failure` | `dropset` | `ghost`.
    /// A ghost set counts for nothing, anywhere.
    public var setType: String
    /// `left` | `right` for a unilateral movement, else nil. Carried alongside
    /// `pairId` because the PR engine collapses an L/R pair into one per-set
    /// tonnage record and cannot do that without both.
    public var side: String?
    public var pairId: String?
    /// Stored rather than recomputed. The web app learned this the hard way:
    /// read the stored value with `||`, not `??`, because a stored 0 on an
    /// unloaded set is a legacy artefact and not an estimate.
    public var est1rmKg: Double?
    public var isPendingSync: Bool

    public enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case exerciseId = "exercise_id"
        case setIndex = "set_index"
        case weightKg = "weight_kg"
        case reps
        case setType = "set_type"
        case side
        case pairId = "pair_id"
        case est1rmKg = "est_1rm_kg"
        case isPendingSync = "is_pending_sync"
    }

    public init(
        id: String, sessionId: String, exerciseId: String, setIndex: Int,
        weightKg: Double, reps: Int, setType: String = "normal",
        side: String? = nil, pairId: String? = nil, est1rmKg: Double? = nil,
        isPendingSync: Bool = false
    ) {
        self.id = id
        self.sessionId = sessionId
        self.exerciseId = exerciseId
        self.setIndex = setIndex
        self.weightKg = weightKg
        self.reps = reps
        self.setType = setType
        self.side = side
        self.pairId = pairId
        self.est1rmKg = est1rmKg
        self.isPendingSync = isPendingSync
    }
}

// MARK: - Outbox

/// A write that must reach Supabase, durably queued until it does.
///
/// ── WHY AN OUTBOX AND NOT A RETRY IN THE VIEW MODEL ─────────────────────────
/// Finishing a workout is the one action in this app that must never be lost.
/// The web app arrived at the same shape — its react-query persister dehydrates
/// exactly one mutation, the session commit, keyed by an idempotent
/// `clientSessionId` — and it got there after the naive version failed on a
/// train. A queue in a table survives the process being killed; a retry loop in
/// memory does not, and iOS kills backgrounded apps routinely.
///
/// `idempotencyKey` is what makes a retry safe: the server may already have
/// applied a request whose response never arrived.
public struct OutboxItem: Codable, FetchableRecord, MutablePersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "outbox"

    public enum Status: String, Codable, Sendable {
        case pending
        case inFlight = "in_flight"
        case failed
    }

    public var id: String
    /// What this write is, e.g. `session.commit`. A string rather than an enum so
    /// an old queued item from a previous build still decodes after a new kind is
    /// added — a queue that fails to decode is a queue that loses the workout.
    public var kind: String
    public var payload: Data
    public var idempotencyKey: String
    public var createdAt: Date
    public var attempts: Int
    public var lastError: String?
    public var status: Status

    /// Snake_case like every other table here. The outbox is local-only, so the
    /// names are a free choice — but a store where some tables are snake_case
    /// and one is not is a store where you check before writing a query.
    public enum CodingKeys: String, CodingKey {
        case id
        case kind
        case payload
        case idempotencyKey = "idempotency_key"
        case createdAt = "created_at"
        case attempts
        case lastError = "last_error"
        case status
    }

    public init(
        id: String = UUID().uuidString,
        kind: String,
        payload: Data,
        idempotencyKey: String,
        createdAt: Date = Date(),
        attempts: Int = 0,
        lastError: String? = nil,
        status: Status = .pending
    ) {
        self.id = id
        self.kind = kind
        self.payload = payload
        self.idempotencyKey = idempotencyKey
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastError = lastError
        self.status = status
    }
}
