import Foundation
import Testing
@testable import OnyxData

/// The merge rule, exercised without a database.
///
/// These are the tests that matter most in the whole store. A fold that is
/// subtly wrong does not crash and does not look wrong — it quietly returns a
/// set list missing one set, on one device, after one particular delivery order.
private func event(
    _ kind: String,
    set setId: String,
    device: String = "phone",
    seq: Int64,
    id: String? = nil,
    snapshot: SetSnapshot? = nil,
    patch: SetPatch? = nil
) -> SetEvent {
    let body: SetEvent.Body = switch kind {
    case "append": .append(snapshot ?? SetSnapshot(exerciseId: "bench", setIndex: 1, weightKg: 60, reps: 8))
    case "amend": .amend(patch ?? SetPatch(reps: 10))
    default: .void
    }
    return SetEvent(
        id: id ?? "\(device)-\(seq)-\(kind)",
        sessionId: "s1",
        setId: setId,
        deviceId: device,
        seq: seq,
        body: body
    )
}

private func fold(_ events: [SetEvent]) -> [WorkoutSet] {
    SetEventFold.sets(from: events, sessionId: "s1")
}

@Suite("Set event fold")
struct SetEventFoldTests {

    @Test("an append produces the set it describes")
    func appendProducesSet() {
        let sets = fold([
            event("append", set: "a", seq: 1, snapshot: SetSnapshot(
                exerciseId: "squat", setIndex: 1, weightKg: 100, reps: 5
            ))
        ])
        #expect(sets.count == 1)
        #expect(sets[0].id == "a")
        #expect(sets[0].exerciseId == "squat")
        #expect(sets[0].weightKg == 100)
        #expect(sets[0].reps == 5)
        #expect(sets[0].sessionId == "s1")
    }

    // ── THE ONE THE BRIEF ASKED FOR ────────────────────────────────────────

    @Test("a void removes the set from the computed state")
    func voidRemovesSet() {
        let events = [
            event("append", set: "a", seq: 1),
            event("append", set: "b", seq: 2),
            event("void", set: "a", seq: 3),
        ]
        let sets = fold(events)
        #expect(sets.count == 1)
        #expect(sets.map(\.id) == ["b"])
        // And the log itself is untouched — the history of the deleted set
        // survives even though the set does not.
        #expect(events.count == 3)
    }

    @Test("a void is terminal — a later amend cannot resurrect the set")
    func voidIsTerminal() {
        let sets = fold([
            event("append", set: "a", seq: 1),
            event("void", set: "a", seq: 2),
            event("amend", set: "a", seq: 3, patch: SetPatch(reps: 12)),
        ])
        #expect(sets.isEmpty)
    }

    @Test("a void that arrives BEFORE its append still wins")
    func voidBeforeAppendWins() {
        // The partially-synced case: the phone deleted a set the watch logged,
        // and the void reaches this device first. When the append finally
        // lands, the set must stay deleted rather than springing back to life.
        let sets = fold([
            event("void", set: "a", device: "phone", seq: 5),
            event("append", set: "a", device: "watch", seq: 2),
        ])
        #expect(sets.isEmpty)
    }

    @Test("voiding twice is harmless")
    func doubleVoid() {
        let sets = fold([
            event("append", set: "a", seq: 1),
            event("void", set: "a", seq: 2),
            event("void", set: "a", seq: 3, id: "second-void"),
        ])
        #expect(sets.isEmpty)
    }

    // ── Idempotence: the property that makes retry safe ────────────────────

    @Test("a re-delivered append does not duplicate the set")
    func appendIsIdempotent() {
        let once = event("append", set: "a", seq: 1)
        #expect(fold([once, once]).count == 1)
    }

    @Test("folding a log twice gives the same answer")
    func foldIsDeterministic() {
        let events = [
            event("append", set: "a", device: "watch", seq: 1),
            event("append", set: "b", device: "phone", seq: 1),
            event("amend", set: "a", device: "phone", seq: 4, patch: SetPatch(weightKg: 70)),
            event("void", set: "b", device: "watch", seq: 3),
        ]
        #expect(fold(events) == fold(events))
    }

    @Test("shuffled delivery folds to the identical list")
    func orderIndependent() {
        let events = [
            event("append", set: "a", seq: 1, snapshot: SetSnapshot(
                exerciseId: "bench", setIndex: 1, weightKg: 60, reps: 8
            )),
            event("append", set: "b", seq: 2, snapshot: SetSnapshot(
                exerciseId: "bench", setIndex: 2, weightKg: 62.5, reps: 8
            )),
            event("amend", set: "a", seq: 3, patch: SetPatch(reps: 9)),
            event("void", set: "b", seq: 4),
        ]
        let expected = fold(events)
        #expect(expected.count == 1)
        #expect(expected[0].reps == 9)

        // Every permutation of a four-event log must agree. Delivery order is
        // not something this app gets to assume anything about.
        var permutations = 0
        for i in events.indices {
            for j in events.indices where j != i {
                for k in events.indices where k != i && k != j {
                    let l = events.indices.first { $0 != i && $0 != j && $0 != k }!
                    #expect(fold([events[i], events[j], events[k], events[l]]) == expected)
                    permutations += 1
                }
            }
        }
        #expect(permutations == 24)
    }

    // ── Amend ─────────────────────────────────────────────────────────────

    @Test("an amend changes only the fields it names")
    func amendIsPartial() {
        let sets = fold([
            event("append", set: "a", seq: 1, snapshot: SetSnapshot(
                exerciseId: "row", setIndex: 3, weightKg: 80, reps: 10,
                setType: "warmup", side: "left", pairId: "p1", est1rmKg: 106.7
            )),
            event("amend", set: "a", seq: 2, patch: SetPatch(reps: 12)),
        ])
        let s = try! #require(sets.first)
        #expect(s.reps == 12)
        #expect(s.weightKg == 80)
        #expect(s.setIndex == 3)
        #expect(s.setType == "warmup")
        #expect(s.side == "left")
        #expect(s.pairId == "p1")
        #expect(s.est1rmKg == 106.7)
    }

    @Test("amends apply in order, so the last one wins")
    func lastAmendWins() {
        let sets = fold([
            event("append", set: "a", seq: 1),
            event("amend", set: "a", seq: 2, patch: SetPatch(weightKg: 65)),
            event("amend", set: "a", seq: 3, patch: SetPatch(weightKg: 70)),
        ])
        #expect(sets.first?.weightKg == 70)
    }

    @Test("an amend for a set not yet seen is buffered, never dropped")
    func orphanAmendIsBuffered() {
        // Arrives before its append — a real ordering when two devices sync
        // through different paths.
        let sets = fold([
            event("amend", set: "a", device: "phone", seq: 9, patch: SetPatch(reps: 15)),
            event("append", set: "a", device: "watch", seq: 1),
        ])
        #expect(sets.count == 1)
        #expect(sets.first?.reps == 15)
    }

    @Test("buffered amends apply in their own order")
    func bufferedAmendsKeepOrder() {
        let sets = fold([
            event("amend", set: "a", seq: 8, patch: SetPatch(weightKg: 80)),
            event("amend", set: "a", seq: 9, patch: SetPatch(weightKg: 90)),
            event("append", set: "a", seq: 1),
        ])
        #expect(sets.first?.weightKg == 90)
    }

    @Test("an empty patch is recognised as changing nothing")
    func emptyPatch() {
        #expect(SetPatch().isEmpty)
        #expect(!SetPatch(reps: 1).isEmpty)
        #expect(!SetPatch(weightKg: 0).isEmpty)   // 0 kg is a real load, not absence
    }

    // ── Ordering ──────────────────────────────────────────────────────────

    @Test("sets come back ordered by setIndex, not by when they were logged")
    func orderedByIndex() {
        let sets = fold([
            event("append", set: "c", seq: 1, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 3, weightKg: 10, reps: 1
            )),
            event("append", set: "a", seq: 2, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 1, weightKg: 10, reps: 1
            )),
            event("append", set: "b", seq: 3, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 2, weightKg: 10, reps: 1
            )),
        ])
        #expect(sets.map(\.id) == ["a", "b", "c"])
    }

    @Test("two devices claiming the same setIndex both survive, stably ordered")
    func duplicateIndexIsNotRenumbered() {
        // Renumbering here would silently rewrite what the user typed on one of
        // the two devices. Showing both is the honest answer.
        let sets = fold([
            event("append", set: "w", device: "watch", seq: 4, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 4, weightKg: 100, reps: 5
            )),
            event("append", set: "p", device: "phone", seq: 5, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 4, weightKg: 105, reps: 5
            )),
        ])
        #expect(sets.count == 2)
        #expect(sets.map(\.id) == ["w", "p"])
    }

    @Test("the tiebreak is deviceId, so concurrent events order identically everywhere")
    func concurrentEventsOrderByDevice() {
        // Same Lamport value = genuinely concurrent. Both devices must still
        // agree on the resulting list.
        let watchFirst = fold([
            event("append", set: "w", device: "watch", seq: 7, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 1, weightKg: 1, reps: 1
            )),
            event("append", set: "p", device: "phone", seq: 7, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 1, weightKg: 2, reps: 1
            )),
        ])
        let phoneFirst = fold([
            event("append", set: "p", device: "phone", seq: 7, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 1, weightKg: 2, reps: 1
            )),
            event("append", set: "w", device: "watch", seq: 7, snapshot: SetSnapshot(
                exerciseId: "x", setIndex: 1, weightKg: 1, reps: 1
            )),
        ])
        #expect(watchFirst == phoneFirst)
        // "phone" < "watch" lexically, so the phone's set is first — arbitrary,
        // but identical on both devices, which is the entire requirement.
        #expect(watchFirst.map(\.id) == ["p", "w"])
    }

    @Test("an empty log folds to no sets")
    func emptyLog() {
        #expect(fold([]).isEmpty)
    }

    // ── The invariants the domain depends on ──────────────────────────────

    @Test("a 0 kg bodyweight set survives the fold intact")
    func bodyweightSetSurvives() {
        // The `weight === 0` blind spot cost this codebase months of "1RM 0"
        // labels. The store must never be the layer that drops an unloaded set.
        let sets = fold([
            event("append", set: "a", seq: 1, snapshot: SetSnapshot(
                exerciseId: "reverse-crunch", setIndex: 1, weightKg: 0, reps: 17
            ))
        ])
        #expect(sets.count == 1)
        #expect(sets[0].weightKg == 0)
        #expect(sets[0].reps == 17)
    }

    @Test("nil est_1rm stays nil rather than becoming zero")
    func nilIsNotZero() {
        let sets = fold([event("append", set: "a", seq: 1)])
        #expect(sets[0].est1rmKg == nil)
    }

    @Test("an L/R pair keeps both sides independent")
    func unilateralPairIsIndependent() {
        let sets = fold([
            event("append", set: "l", seq: 1, snapshot: SetSnapshot(
                exerciseId: "curl", setIndex: 1, weightKg: 12, reps: 10,
                side: "left", pairId: "p1"
            )),
            event("append", set: "r", seq: 2, snapshot: SetSnapshot(
                exerciseId: "curl", setIndex: 1, weightKg: 14, reps: 9,
                side: "right", pairId: "p1"
            )),
            // Editing the left arm must not touch the right one. The web app
            // deleted a `linked` flag for exactly this reason: an arm that is
            // genuinely weaker cannot be recorded if typing its number rewrites
            // the other side.
            event("amend", set: "l", seq: 3, patch: SetPatch(reps: 8)),
        ])
        #expect(sets.count == 2)
        let left = try! #require(sets.first { $0.side == "left" })
        let right = try! #require(sets.first { $0.side == "right" })
        #expect(left.reps == 8)
        #expect(right.reps == 9)
        #expect(right.weightKg == 14)
        #expect(left.pairId == right.pairId)
    }
}

// The `LamportClock` suite that stood here tested a struct nothing in
// production called: `AppDatabase.tickClock` implements the clock in SQL so the
// stamp and the event it stamps land in one transaction. Four passing tests
// gave a dead duplicate of the ordering rule confidence it had not earned.
// The clock's real behaviour is covered by `EventStoreTests.clockAdvances`,
// `clockPersists` and `ingestAdvancesClock`, against the implementation that
// actually runs.
