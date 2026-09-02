import Foundation

/// The fold: a log of `SetEvent`s becomes the set list the user sees.
///
/// ── THIS FILE TOUCHES NO DATABASE ───────────────────────────────────────────
/// No GRDB import, no I/O, no clock. Give it events, get sets. That is what
/// makes the merge rule — the single most dangerous piece of logic in a
/// two-writer system — testable in microseconds without a store, a device or a
/// network, and it is why the tests for it can enumerate the awkward orderings
/// exhaustively instead of hoping.
///
/// The rules, in full:
///
/// 1. **Total order is `(seq, deviceId, id)`, never wall time.** `seq` is a
///    Lamport clock so it encodes causality; `deviceId` breaks a genuine tie
///    between two devices that acted concurrently; `id` breaks the impossible
///    tie and exists only so the function is total. Every device folding the
///    same log gets the same list — that is the property the whole design rests
///    on.
/// 2. **`append` is idempotent.** A second append for a `setId` already present
///    is ignored, so a re-delivered event cannot duplicate a set.
/// 3. **`void` is terminal, and it wins even when it arrives first.** A void for
///    a `setId` not yet seen is remembered, and a later `append` for that id is
///    suppressed. Without this, a partially-synced log resurrects deleted sets
///    the moment the missing half arrives.
/// 4. **An `amend` for an unseen set is buffered, not dropped.** It applies in
///    arrival order the moment its `append` shows up. Dropping it would lose an
///    edit permanently for no reason other than delivery order.
/// 5. **Surviving sets are ordered by `setIndex`, then by first appearance.**
///    Two devices can both claim index 4; the fold does not renumber them,
///    because renumbering silently rewrites what the user typed. It shows both,
///    stably ordered, and lets the user fix it.
public enum SetEventFold {

    /// Fold a session's events into its current sets.
    ///
    /// - Parameters:
    ///   - events: any order, any degree of duplication.
    ///   - sessionId: stamped onto the produced rows.
    ///   - isPendingSync: stamped onto the produced rows; the projection knows
    ///     whether these facts have reached the server, the fold does not.
    public static func sets(
        from events: [SetEvent],
        sessionId: String,
        isPendingSync: Bool = false
    ) -> [WorkoutSet] {
        // Rule 1. Sorting up front is what lets the rest of this be a single
        // pass with no lookahead.
        let ordered = events.sorted { lhs, rhs in
            if lhs.seq != rhs.seq { return lhs.seq < rhs.seq }
            if lhs.deviceId != rhs.deviceId { return lhs.deviceId < rhs.deviceId }
            return lhs.id < rhs.id
        }

        var snapshots: [String: SetSnapshot] = [:]
        /// Rule 5's "first appearance": insertion order, independent of setIndex.
        var arrival: [String: Int] = [:]
        var nextArrival = 0
        /// Rule 3. Membership here outranks everything, forever.
        var voided: Set<String> = []
        /// Rule 4. Amends waiting for the append they describe.
        var orphanedAmends: [String: [SetPatch]] = [:]

        for event in ordered {
            let setId = event.setId

            switch event.body {
            case .append(let snapshot):
                // Rule 3 before rule 2: a tombstone beats a late arrival.
                guard !voided.contains(setId) else { continue }
                // Rule 2.
                guard snapshots[setId] == nil else { continue }

                var state = snapshot
                // Rule 4: drain anything that arrived early, in order.
                if let waiting = orphanedAmends.removeValue(forKey: setId) {
                    for patch in waiting { state = patch.applied(to: state) }
                }
                snapshots[setId] = state
                arrival[setId] = nextArrival
                nextArrival += 1

            case .amend(let patch):
                guard !voided.contains(setId) else { continue }
                if let current = snapshots[setId] {
                    snapshots[setId] = patch.applied(to: current)
                } else {
                    orphanedAmends[setId, default: []].append(patch)
                }

            case .void:
                voided.insert(setId)
                snapshots.removeValue(forKey: setId)
                arrival.removeValue(forKey: setId)
                // A buffered amend for a set that turned out to be deleted is
                // not an error; it is just no longer about anything.
                orphanedAmends.removeValue(forKey: setId)
            }
        }

        // Rule 5.
        return snapshots
            .map { (setId, snapshot) in (setId, snapshot, arrival[setId] ?? 0) }
            .sorted { lhs, rhs in
                if lhs.1.setIndex != rhs.1.setIndex { return lhs.1.setIndex < rhs.1.setIndex }
                return lhs.2 < rhs.2
            }
            .map { setId, snapshot, _ in
                WorkoutSet(
                    id: setId,
                    sessionId: sessionId,
                    exerciseId: snapshot.exerciseId,
                    setIndex: snapshot.setIndex,
                    weightKg: snapshot.weightKg,
                    reps: snapshot.reps,
                    setType: snapshot.setType,
                    side: snapshot.side,
                    pairId: snapshot.pairId,
                    est1rmKg: snapshot.est1rmKg,
                    isPendingSync: isPendingSync
                )
            }
    }
}

// The Lamport clock deliberately has no Swift type.
//
// There was a `LamportClock` struct here. It was never called: `AppDatabase`
// implements tick/observe in SQL so the stamp and the event it stamps land in
// one transaction, and a second implementation in Swift is exactly what
// `reproject`'s own comment argues against — two plausible copies of one rule,
// drifting apart the first time either is touched. Four tests were covering a
// struct that production never ran. See `AppDatabase.tickClock`.
