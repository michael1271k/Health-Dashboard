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
        /// The session clock stopped. Not about a set at all — see `Kind`.
        case pause
        /// The session clock started again.
        case resume

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
            case .pause: self = .pause
            case .resume: self = .resume
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
            case .pause:
                try container.encode(Kind.pause, forKey: .kind)
            case .resume:
                try container.encode(Kind.resume, forKey: .kind)
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
        /// The session clock stopped, and started again.
        ///
        /// ── WHY THE CLOCK IS IN THE SAME LOG AS THE SETS ────────────────────
        /// A pause is a fact about a session, produced by one of two devices,
        /// that has to survive the app being killed and has to merge without a
        /// last-writer-wins fight — which is the whole of the argument at the
        /// top of this file. Giving it its own table would be a second merge
        /// rule for the same problem, and `set_events` is local-only, so
        /// nothing about it reaches a schema the server has an opinion on.
        ///
        /// These carry NO payload and no set. `setId` holds the SESSION's id —
        /// a value no real set can collide with (set ids are `newOnyxID()`) —
        /// so the column stays NOT NULL and the fold can recognise them without
        /// decoding a blob. `SetEventFold` skips them, and `EventStore.commit`
        /// keeps them out of the outbox: `duration_min` is what reaches the
        /// server, not the clock that produced it.
        case pause
        case resume

        /// True for the two kinds that are about the session's clock rather
        /// than about a set.
        public var isClock: Bool { self == .pause || self == .resume }

        // ── ADDING A KIND IS A ONE-WAY DOOR, AND THIS ONE WAS TAKEN ─────────
        // `Body.init(from:)` decodes this enum and switches on it with no
        // fallback, so a build that predates a kind cannot decode a row that
        // carries it — and `reproject` runs inside `commit`'s transaction, so
        // the failure is not "one row is skipped", it is "no further set can be
        // logged into that session at all".
        //
        // That is fine going forward (this build reads every kind it can write)
        // and it is a real hazard BACKWARD: rolling the app back past P3 E4
        // leaves any session that was ever paused unloggable until the store is
        // reset. The alternative — a tolerant decoder — cannot help, because
        // the build that needs the tolerance is the one already shipped. The
        // next kind added here should come with a `Kind` fallback FIRST, in a
        // release before the one that writes it.
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
        case .pause: .pause
        case .resume: .resume
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
        id: String = newOnyxID(),
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
        case quality
        case exerciseOrder = "exercise_order"
        case durationSec = "duration_sec"
        case incline
        case distanceKm = "distance_km"
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
    /// How the set WENT — one of the six keys in `SetQuality`, or nil.
    ///
    /// A second axis, not a sixth `setType`. "Warm-up" and "form broke" are
    /// both true of the same set, so they cannot share a control — and folding
    /// technique into `set_type` would give every consumer of "is this a working
    /// set" an opinion about form, which none of them should have. It changes no
    /// arithmetic anywhere: a momentum-assisted set still counts its tonnage,
    /// because it happened.
    ///
    /// Same story as `rpe`: Postgres has held the column all along, the local
    /// store gains it in `v14`.
    public var quality: String?
    /// The MOVEMENT's position in the deck, dense from 0 — see
    /// `WorkoutSet.exerciseOrder`.
    ///
    /// ── ADDING A FIELD HERE IS SAFE; ADDING A `Kind` IS NOT ─────────────────
    /// `Body.init(from:)` switches on `Kind` with no fallback, which is why the
    /// enum is a one-way door. This is not that: an extra optional key on the
    /// payload decodes to `nil` on a build that has never heard of it, and is
    /// ignored on the way back in. Exactly the trade `v7.setRpe` and
    /// `v14.setQuality` made, and neither loses a set in either direction.
    ///
    /// **`nil` on a set logged before this build**, and on any set nobody could
    /// place — a reorder that changed nothing writes nothing.
    public var exerciseOrder: Int?
    /// The cardio axes — seconds under load, incline percent, kilometres.
    ///
    /// Three MORE optional keys on the same payload, for the same reason and
    /// with the same guarantee as `exerciseOrder` above: a build that has never
    /// heard of them decodes `nil` and re-encodes without them, and no set is
    /// lost in either direction. No new `Kind` — that is the one-way door.
    ///
    /// They are here rather than only on `WorkoutSet` because the projection is
    /// a FOLD: `seedEventLog` turns a pulled session's rows into `.append`
    /// events and `reproject` rebuilds the rows from them, so an axis the
    /// snapshot cannot carry is an axis the first edit of that session erases —
    /// and then pushes back over the server's copy as null.
    public var durationSec: Int?
    public var incline: Double?
    public var distanceKm: Double?

    public init(
        exerciseId: String,
        setIndex: Int,
        weightKg: Double,
        reps: Int,
        setType: String = "normal",
        side: String? = nil,
        pairId: String? = nil,
        est1rmKg: Double? = nil,
        rpe: Double? = nil,
        quality: String? = nil,
        exerciseOrder: Int? = nil,
        durationSec: Int? = nil,
        incline: Double? = nil,
        distanceKm: Double? = nil
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
        self.quality = quality
        self.exerciseOrder = exerciseOrder
        self.durationSec = durationSec
        self.incline = incline
        self.distanceKm = distanceKm
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
        case quality
        case exerciseOrder = "exercise_order"
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
    /// The technique note, or `SetPatch.clearedQuality` to take it back off.
    ///
    /// ── THE ONE FIELD HERE THAT CAN BE CLEARED, AND WHY ─────────────────────
    /// Every other field in this type reads `nil` as UNCHANGED and has no way
    /// to say "back to null" — which is right for `side` and `pairId`, where
    /// clearing means two rows becoming one and belongs in a void-and-append.
    /// Quality is not like that. Tapping the chosen chip withdraws it, exactly
    /// as tapping the lit RPE pip does, and a claim about your form that you
    /// cannot take back is a claim you stop making at all.
    ///
    /// So the empty string is the sentinel for "cleared". A sentinel rather
    /// than a `String??`, because a double optional does not survive
    /// `encodeIfPresent` round-tripping in a way anyone reading this file later
    /// would trust, and "" is not a legal quality — the database's CHECK holds
    /// six keys and none of them is empty.
    public var quality: String?
    /// The movement's new deck position — what a drag writes onto every set of
    /// every movement the drag shifted.
    ///
    /// `nil` is UNCHANGED here, like every field but `quality`, and it is the
    /// right reading: an order can be corrected but it cannot be un-known, and
    /// nothing in either client has a gesture for "forget where this came".
    public var exerciseOrder: Int?

    /// Pass as `quality` to take an existing note off a set.
    public static let clearedQuality = ""

    public init(
        setIndex: Int? = nil,
        weightKg: Double? = nil,
        reps: Int? = nil,
        setType: String? = nil,
        side: String? = nil,
        pairId: String? = nil,
        est1rmKg: Double? = nil,
        rpe: Double? = nil,
        quality: String? = nil,
        exerciseOrder: Int? = nil
    ) {
        self.setIndex = setIndex
        self.weightKg = weightKg
        self.reps = reps
        self.setType = setType
        self.side = side
        self.pairId = pairId
        self.est1rmKg = est1rmKg
        self.rpe = rpe
        self.quality = quality
        self.exerciseOrder = exerciseOrder
    }

    /// True when the patch would change nothing. Used to reject empty amends
    /// before they become permanent noise in the log.
    public var isEmpty: Bool {
        setIndex == nil && weightKg == nil && reps == nil && setType == nil
            && side == nil && pairId == nil && est1rmKg == nil && rpe == nil
            && quality == nil && exerciseOrder == nil
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
        if let quality { next.quality = quality == Self.clearedQuality ? nil : quality }
        if let exerciseOrder { next.exerciseOrder = exerciseOrder }
        return next
    }
}
