import Foundation

/// A single, immutable fact about a set.
///
/// ── WHY SETS ARE EVENTS AND NOT ROWS ────────────────────────────────────────
/// The Watch is becoming a logging client, which means two devices can both be
/// editing one live session while either of them is offline. Two writers that
/// both UPDATE a row and reconcile later will drop one of the writes, and they
/// will do it silently: the row is well-formed afterwards, so nothing detects
/// it and the set is simply gone from the training history.
///
/// A log cannot do that. Every device appends its own facts, the log is merged
/// by union, and the set list on screen is a *fold* over it (`foldSets`). The
/// worst failure available to this design is a set reappearing that you meant
/// to delete — visible on screen, fixable in one tap. For a training log that is
/// the correct direction to fail in.
///
/// Events are never mutated and never deleted. An edit appends an `.amend`; a
/// deletion appends a `.void` tombstone.
public struct SetEvent: Codable, Identifiable, Sendable, Equatable {

    /// What this event does to the set it names.
    ///
    /// The payload is *inside* the case, so an `.append` cannot be constructed
    /// without a complete set and a `.void` cannot carry one at all. The
    /// alternative — a `kind` string beside an optional payload — makes both of
    /// those illegal states representable and then relies on every call site to
    /// avoid them.
    public enum Body: Codable, Sendable, Equatable {
        /// The set came into existence, with everything about it.
        case append(SetSnapshot)
        /// Some fields of an existing set changed. Fields left `nil` are
        /// untouched — see `SetPatch` for what that cannot express.
        case amend(SetPatch)
        /// The set was deleted. Terminal: nothing resurrects a voided set.
        case void

        // ── THE WIRE SHAPE IS OURS, NOT THE COMPILER'S ──────────────────────
        // Synthesised `Codable` on an enum with associated values emits
        // `{"append":{"_0":{...}}}` — a private encoding keyed by declaration
        // order. Rename a case or reorder an associated value and every row
        // already on disk fails to decode. These rows outlive the build that
        // wrote them, and on a phone-plus-watch system one side routinely runs
        // an older build, so the format has to be something we control.
        private enum CodingKeys: String, CodingKey {
            case kind
            case payload
        }

        public init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            let kind = try container.decode(Kind.self, forKey: .kind)
            switch kind {
            case .append: self = .append(try container.decode(SetSnapshot.self, forKey: .payload))
            case .amend: self = .amend(try container.decode(SetPatch.self, forKey: .payload))
            case .void: self = .void
            }
        }

        public func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .append(let snapshot):
                try container.encode(Kind.append, forKey: .kind)
                try container.encode(snapshot, forKey: .payload)
            case .amend(let patch):
                try container.encode(Kind.amend, forKey: .kind)
                try container.encode(patch, forKey: .payload)
            case .void:
                try container.encode(Kind.void, forKey: .kind)
            }
        }
    }

    /// A stable, short discriminator for the persisted row.
    ///
    /// `Body` is what the code reasons about; this is what SQL can index and
    /// filter on without decoding a blob for every row.
    public enum Kind: String, Codable, Sendable, CaseIterable {
        case append
        case amend
        case void
    }

    /// This event's own identity. Two devices never generate the same one, so
    /// the union of two logs is just a union — no de-duplication pass, and a
    /// replayed delivery is idempotent by construction.
    public let id: String

    public let sessionId: String

    /// The set this event is *about*. `.append` brings it into being; `.amend`
    /// and `.void` refer back to it. Not the event's own id — many events share
    /// one `setId` over the life of a set.
    public let setId: String

    /// Which device produced this. Also the deterministic tiebreaker in the
    /// total order, so both devices fold an identical log into an identical
    /// list.
    public let deviceId: String

    /// A **Lamport clock**, not a timestamp.
    ///
    /// Wall clocks are the obvious choice and the wrong one: a watch and a phone
    /// disagree by seconds, and NTP can step either of them backwards. Ordering
    /// by wall time therefore lets a set that was logged second sort first, and
    /// the two devices can disagree about which. A Lamport clock only ever
    /// advances — locally on each event, and to `max(local, seen) + 1` whenever
    /// a remote event arrives — so it encodes causality exactly and never needs
    /// the two devices' clocks to agree about anything.
    public let seq: Int64

    /// Wall-clock time. **For display only.** Never sort by this.
    public let createdAt: Date

    public let body: Body

    public var kind: Kind {
        switch body {
        case .append: .append
        case .amend: .amend
        case .void: .void
        }
    }

    public enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case setId = "set_id"
        case deviceId = "device_id"
        case seq
        case createdAt = "created_at"
        case body
    }

    public init(
        id: String = newHelixID(),
        sessionId: String,
        setId: String,
        deviceId: String,
        seq: Int64,
        createdAt: Date = Date(),
        body: Body
    ) {
        self.id = id
        self.sessionId = sessionId
        self.setId = setId
        self.deviceId = deviceId
        self.seq = seq
        self.createdAt = createdAt
        self.body = body
    }
}

// MARK: - Payloads

/// Everything about a set, at the moment it was logged.
///
/// Mirrors `WorkoutSet` minus the identity and sync columns, which the event
/// header already carries. Field-for-field with Postgres, so the projection is
/// an assignment rather than a translation.
public struct SetSnapshot: Codable, Sendable, Equatable {
    public enum CodingKeys: String, CodingKey {
        case exerciseId = "exercise_id"
        case setIndex = "set_index"
        case weightKg = "weight_kg"
        case reps
        case setType = "set_type"
        case side
        case pairId = "pair_id"
        case est1rmKg = "est_1rm_kg"
        case rpe
    }

    public var exerciseId: String
    public var setIndex: Int
    /// Kilograms. **Zero is a real, valid load** — a bodyweight set. Never
    /// coerce it to nil and never filter it out; `Epley.oneRepMax` is the thing
    /// that decides an unloaded set has no 1RM, and it says so by returning nil.
    public var weightKg: Double
    public var reps: Int
    /// `normal` | `warmup` | `failure` | `dropset` | `ghost`.
    public var setType: String
    /// `left` | `right` on a unilateral movement, else nil.
    public var side: String?
    /// The two sides of one split set share this.
    public var pairId: String?
    public var est1rmKg: Double?
    /// Rated Perceived Exertion, CR-10, in half-point steps.
    ///
    /// **`nil` is not zero.** An unrated set is a set nobody judged, and the
    /// progression rule ("increase load only when ALL work sets hit the ceiling
    /// at RPE <= 8.5") has to be able to tell that apart from a set rated easy,
    /// or an unrated session reads as a session you sailed through.
    ///
    /// Postgres has carried `workout_sets.rpe` all along; the local store did
    /// not, which is why it is added in `v7` rather than in `v1`.
    public var rpe: Double?

    public init(
        exerciseId: String,
        setIndex: Int,
        weightKg: Double,
        reps: Int,
        setType: String = "normal",
        side: String? = nil,
        pairId: String? = nil,
        est1rmKg: Double? = nil,
        rpe: Double? = nil
    ) {
        self.exerciseId = exerciseId
        self.setIndex = setIndex
        self.weightKg = weightKg
        self.reps = reps
        self.setType = setType
        self.side = side
        self.pairId = pairId
        self.est1rmKg = est1rmKg
        self.rpe = rpe
    }
}

/// A partial change to an existing set. `nil` means **unchanged**.
///
/// ── WHAT THIS DELIBERATELY CANNOT EXPRESS ───────────────────────────────────
/// It cannot set a nullable field back to null. `side: nil` means "leave the
/// side alone", never "clear the side", and there is no second flag to say
/// otherwise.
///
/// That is a real limitation and it is the right one here. Clearing `side` or
/// `pairId` means un-splitting a unilateral set, which is not an edit to one
/// set — it is two rows becoming one, with a different `setIndex` and a
/// different set count. Expressing it as a patch would produce a half-split set
/// that no other part of the system has a name for. Void the pair and append the
/// replacement instead: two events, one honest history.
public struct SetPatch: Codable, Sendable, Equatable {
    public enum CodingKeys: String, CodingKey {
        case setIndex = "set_index"
        case weightKg = "weight_kg"
        case reps
        case setType = "set_type"
        case side
        case pairId = "pair_id"
        case est1rmKg = "est_1rm_kg"
        case rpe
    }

    public var setIndex: Int?
    public var weightKg: Double?
    public var reps: Int?
    public var setType: String?
    public var side: String?
    public var pairId: String?
    public var est1rmKg: Double?
    /// Like every other field here, `nil` means UNCHANGED — it cannot clear a
    /// rating back to unrated. Rating a set is a one-way door in this patch
    /// type, for the same reason `side` is: void and re-append is the honest
    /// way to say "that never happened".
    public var rpe: Double?

    public init(
        setIndex: Int? = nil,
        weightKg: Double? = nil,
        reps: Int? = nil,
        setType: String? = nil,
        side: String? = nil,
        pairId: String? = nil,
        est1rmKg: Double? = nil,
        rpe: Double? = nil
    ) {
        self.setIndex = setIndex
        self.weightKg = weightKg
        self.reps = reps
        self.setType = setType
        self.side = side
        self.pairId = pairId
        self.est1rmKg = est1rmKg
        self.rpe = rpe
    }

    /// True when the patch would change nothing. Used to reject empty amends
    /// before they become permanent noise in the log.
    public var isEmpty: Bool {
        setIndex == nil && weightKg == nil && reps == nil && setType == nil
            && side == nil && pairId == nil && est1rmKg == nil && rpe == nil
    }

    /// Apply to a snapshot, leaving `nil` fields alone.
    public func applied(to snapshot: SetSnapshot) -> SetSnapshot {
        var next = snapshot
        if let setIndex { next.setIndex = setIndex }
        if let weightKg { next.weightKg = weightKg }
        if let reps { next.reps = reps }
        if let setType { next.setType = setType }
        if let side { next.side = side }
        if let pairId { next.pairId = pairId }
        if let est1rmKg { next.est1rmKg = est1rmKg }
        if let rpe { next.rpe = rpe }
        return next
    }
}
