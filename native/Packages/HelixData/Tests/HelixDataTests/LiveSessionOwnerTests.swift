import Foundation
import Testing
import GRDB
@testable import HelixData

/// The pencil: exactly one device offers a keyboard at a time.
@Suite("Live session pencil")
struct LiveSessionOwnerTests {

    private func seeded(deviceId: String) throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: deviceId)
        try db.writer.write { conn in
            try Exercise(id: "ex-squat", name: "Back Squat").insert(conn)
            try WorkoutSession(id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02")
                .insert(conn)
        }
        return db
    }

    private func snapshot(_ index: Int) -> SetSnapshot {
        SetSnapshot(exerciseId: "ex-squat", setIndex: index, weightKg: 100, reps: 5)
    }

    // ── Claiming ──────────────────────────────────────────────────────────

    @Test("an unclaimed session is writable — nobody has started yet")
    func unclaimedIsWritable() throws {
        let db = try seeded(deviceId: "phone")
        #expect(try db.sessionOwner(sessionId: "s1") == nil)
        #expect(try db.holdsPencil(sessionId: "s1"))
    }

    @Test("logging the first set claims the pencil")
    func firstWriteClaims() throws {
        let db = try seeded(deviceId: "phone")
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))

        let owner = try #require(try db.sessionOwner(sessionId: "s1"))
        #expect(owner.ownerDeviceId == "phone")
        #expect(owner.sessionId == "s1")
    }

    @Test("claiming twice does not restamp when it was already ours")
    func reclaimIsStable() throws {
        // `ownerSince` drives "iPhone has been logging for 22 minutes". Bumping
        // it on every set would reset that to zero all session long.
        let db = try seeded(deviceId: "phone")
        let first = try db.claimPencil(sessionId: "s1")
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2))

        let owner = try #require(try db.sessionOwner(sessionId: "s1"))
        #expect(owner.claimSeq == first.claimSeq, "a restamp would have taken a new tick")
        // Not `==`: GRDB stores a datetime to millisecond precision, so a Date
        // does not survive a round-trip bit-identical. Comparing stored dates
        // for exact equality is a test that fails on a Tuesday.
        #expect(abs(owner.ownerSince.timeIntervalSince(first.ownerSince)) < 0.001)
    }

    @Test("releasing frees the session for anyone")
    func releaseFrees() throws {
        let db = try seeded(deviceId: "phone")
        try db.claimPencil(sessionId: "s1")
        try db.releasePencil(sessionId: "s1")
        #expect(try db.sessionOwner(sessionId: "s1") == nil)
    }

    // ── Refusal ───────────────────────────────────────────────────────────

    @Test("a device that does not hold the pencil cannot log")
    func nonOwnerCannotLog() throws {
        let watch = try seeded(deviceId: "watch")
        // The phone claimed, and the claim reached us over the link.
        try watch.ingestOwnership(LiveSessionOwner(
            sessionId: "s1", ownerDeviceId: "phone", claimSeq: 5
        ))

        #expect(!(try watch.holdsPencil(sessionId: "s1")))
        #expect(throws: EventStoreError.notSessionOwner(owner: "phone")) {
            try watch.appendSet(sessionId: "s1", setId: "w1", snapshot(1))
        }
        #expect(throws: EventStoreError.notSessionOwner(owner: "phone")) {
            try watch.voidSet(sessionId: "s1", setId: "anything")
        }
        // And nothing was written on the way to throwing.
        #expect(try watch.setEvents(sessionId: "s1").isEmpty)
        #expect(try watch.pendingOutbox().isEmpty)
    }

    @Test("a non-owner cannot release someone else's pencil")
    func nonOwnerCannotRelease() throws {
        let watch = try seeded(deviceId: "watch")
        try watch.ingestOwnership(LiveSessionOwner(
            sessionId: "s1", ownerDeviceId: "phone", claimSeq: 5
        ))
        try watch.releasePencil(sessionId: "s1")

        let owner = try #require(try watch.sessionOwner(sessionId: "s1"))
        #expect(owner.ownerDeviceId == "phone", "the phone is still writing to it")
    }

    // ── Handover ──────────────────────────────────────────────────────────

    @Test("Log here takes the pencil and unblocks writing")
    func forceClaimTakesOver() throws {
        let watch = try seeded(deviceId: "watch")
        try watch.ingestOwnership(LiveSessionOwner(
            sessionId: "s1", ownerDeviceId: "phone", claimSeq: 5
        ))

        let claim = try watch.claimPencil(sessionId: "s1", force: true)
        #expect(claim.ownerDeviceId == "watch")
        #expect(claim.claimSeq > 5, "a takeover must supersede what it replaces")

        try watch.appendSet(sessionId: "s1", setId: "w1", snapshot(1))
        #expect(try watch.setEvents(sessionId: "s1").count == 1)
    }

    @Test("a takeover stamps above the claim it replaces even across devices")
    func takeoverSupersedes() throws {
        let watch = try seeded(deviceId: "watch")
        try watch.ingestOwnership(LiveSessionOwner(
            sessionId: "s1", ownerDeviceId: "phone", claimSeq: 99
        ))
        let claim = try watch.claimPencil(sessionId: "s1", force: true)
        // `ingestOwnership` pulled the local clock to 99 first, so the takeover
        // cannot land underneath the claim it is replacing.
        #expect(claim.claimSeq == 100)
    }

    @Test("a stale claim arriving late cannot hand the pencil backwards")
    func staleClaimIgnored() throws {
        let db = try seeded(deviceId: "watch")
        try db.claimPencil(sessionId: "s1", force: true)
        let mine = try #require(try db.sessionOwner(sessionId: "s1"))

        // An old phone claim, delivered out of order.
        try db.ingestOwnership(LiveSessionOwner(
            sessionId: "s1", ownerDeviceId: "phone", claimSeq: mine.claimSeq - 1
        ))

        let owner = try #require(try db.sessionOwner(sessionId: "s1"))
        #expect(owner.ownerDeviceId == "watch")
    }

    @Test("two concurrent claims resolve the same way on both devices")
    func concurrentClaimsResolveIdentically() throws {
        // Both went offline and both claimed at the same logical time. Wall
        // clocks cannot settle this — they disagree — so the stamp decides, and
        // the device id breaks the exact tie.
        let phoneClaim = LiveSessionOwner(sessionId: "s1", ownerDeviceId: "phone", claimSeq: 7)
        let watchClaim = LiveSessionOwner(sessionId: "s1", ownerDeviceId: "watch", claimSeq: 7)

        #expect(phoneClaim.isSuperseded(by: watchClaim))
        #expect(!watchClaim.isSuperseded(by: phoneClaim))

        let phone = try seeded(deviceId: "phone")
        let watch = try seeded(deviceId: "watch")
        try phone.ingestOwnership(phoneClaim)
        try phone.ingestOwnership(watchClaim)
        try watch.ingestOwnership(watchClaim)
        try watch.ingestOwnership(phoneClaim)

        #expect(try phone.sessionOwner(sessionId: "s1")?.ownerDeviceId
             == watch.sessionOwner(sessionId: "s1")?.ownerDeviceId)
        #expect(try phone.sessionOwner(sessionId: "s1")?.ownerDeviceId == "watch")
    }

    // ── The pencil is policy; the log is the guarantee ─────────────────────

    @Test("a remote event is accepted even from a device that does not hold the pencil")
    func ingestIsNotGuarded() throws {
        // The phone was offline and never heard about the takeover, so it kept
        // logging. Refusing its events to enforce a UI rule would lose real
        // sets. The log absorbs them; the fold puts them in a deterministic
        // order; nothing is lost.
        let watch = try seeded(deviceId: "watch")
        try watch.claimPencil(sessionId: "s1", force: true)

        try watch.ingest([SetEvent(
            id: "p-evt", sessionId: "s1", setId: "p1",
            deviceId: "phone", seq: 50,
            body: .append(snapshot(1))
        )])

        let rows = try watch.writer.read { try WorkoutSet.fetchAll($0) }
        #expect(rows.count == 1)
        #expect(rows[0].id == "p1")
    }

    @Test("deleting a session releases its pencil")
    func cascadeReleases() throws {
        let db = try seeded(deviceId: "phone")
        try db.claimPencil(sessionId: "s1")
        _ = try db.writer.write { try WorkoutSession.deleteOne($0, key: "s1") }
        #expect(try db.sessionOwner(sessionId: "s1") == nil)
    }

    @Test("pencil columns are snake_case")
    func columnNames() throws {
        let db = try AppDatabase.inMemory()
        let columns = try db.writer.read { try $0.columns(in: "live_sessions").map(\.name) }
        #expect(columns == ["session_id", "owner_device_id", "owner_since", "claim_seq"])
    }
}
