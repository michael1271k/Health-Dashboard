import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The record FLOOR — what an asserted record book supplies to detection.
//
// `workout_sets` is not a complete history (four months of Notion-era sessions
// carry no sets), so a baseline built from the logged rows alone calls "the
// heaviest thing Onyx has seen" the all-time best and flags a return to an old
// load as a record. A floor is the missing bar.
//
// ── THE BOOK IS ROWS NOW (W2) ────────────────────────────────────────────────
// `PrTruth.book` was the founder's Hevy-era bests compiled into the package,
// and `floor(for:)` netted them against a snapshot of what Onyx's own history
// had reached by 2026-08-10. That netted excess is materialised: it lives in
// `personal_records` as rows with `session_id IS NULL` — a record with no
// session behind it is, by definition, one asserted rather than earned — and
// the store builds a `PrFloor` per exercise from those rows
// (`PrRecorder.floors`). Detection consumes the floor exactly as before; what
// changed is that a second account has its own, or none.
//
// A floor row is REPLACED the moment a logged set beats it (the recorder
// upserts on the natural key with the session that did), and it is never
// retracted by a replay: `PrRecorder.replay` reads the floors first and
// deletes only rows a session wrote.
// ─────────────────────────────────────────────────────────────────────────────

/// A bar to raise on one axis. Only axes the logged history cannot already reach appear.
public struct PrFloor: Codable, Equatable, Sendable {
    public var weight: Double?
    public var e1rm: Double?
    /// Per-set tonnage.
    public var volume: Double?
    /// Always nil — session totals are never floored.
    public var sessionVolume: Double?
    /// Reps at zero load.
    public var reps: Double?
    /// Hold duration in seconds.
    public var seconds: Double?

    public init(
        weight: Double? = nil, e1rm: Double? = nil, volume: Double? = nil,
        sessionVolume: Double? = nil, reps: Double? = nil, seconds: Double? = nil
    ) {
        self.weight = weight; self.e1rm = e1rm; self.volume = volume
        self.sessionVolume = sessionVolume; self.reps = reps; self.seconds = seconds
    }

    /// Nothing to raise.
    public var isEmpty: Bool { self == PrFloor() }

    /// One session-less ledger row folded in. `reps` covers both the unloaded
    /// rep record and a timed hold's duration, which share the axis; `timed`
    /// says which this exercise is.
    public mutating func absorb(axis: PrAxis, value: Double, timed: Bool) {
        switch axis {
        case .weight: weight = Swift.max(weight ?? 0, value)
        case .e1rm: e1rm = Swift.max(e1rm ?? 0, value)
        case .volume: volume = Swift.max(volume ?? 0, value)
        case .reps:
            if timed { seconds = Swift.max(seconds ?? 0, value) } else { reps = Swift.max(reps ?? 0, value) }
        }
    }

    /// The floor's value on an axis, for a reader keyed by axis name.
    public func value(axis: String) -> Double? {
        switch axis {
        case "weight": return weight
        case "e1rm": return e1rm
        case "volume": return volume
        case "reps": return seconds ?? reps
        default: return nil
        }
    }
}
