import Foundation
import GRDB

/// Which device is currently holding the pencil for a live session.
///
/// ── THE PENCIL IS POLICY; THE LOG IS THE GUARANTEE ──────────────────────────
/// The event log already tolerates two devices writing at once — that is what
/// `SetEventFold` is for, and no set can be lost whatever happens here. So this
/// is not a correctness mechanism. It is a *user experience* mechanism, and the
/// distinction matters when reading the code:
///
///   · Without it, the phone in your pocket and the watch on your wrist both
///     show an editable set list. You log set 4 on the watch, glance at the
///     phone, see a stale list, log set 4 there too, and now the session has two
///     set 4s. Nothing was lost — but you have to clean it up, mid-workout.
///   · With it, exactly one device offers the keyboard. The other shows the same
///     session live and read-only, with a *Log here* button that takes over.
///
/// That is how Hevy behaves, and it is the reason Hevy never has to ask a user
/// to resolve a conflict.
///
/// Belt and braces, deliberately: if the two ever do write concurrently — the
/// phone was offline and never heard about the takeover — the log absorbs it and
/// the fold produces one deterministic list on both devices. The pencil makes
/// that rare; the log makes it survivable.
public struct LiveSessionOwner: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "live_sessions"

    public var sessionId: String
    public var ownerDeviceId: String
    /// When this device took the pencil. Shown to the user — "iPhone has been
    /// logging for 22 minutes" is what makes a takeover an informed choice
    /// rather than a guess.
    public var ownerSince: Date
    /// Lamport-stamped, from the same clock as the events.
    ///
    /// Two devices can both claim while offline from each other. Wall time
    /// cannot settle that — their clocks disagree — so a claim carries a logical
    /// stamp and the highest one wins, with `ownerDeviceId` breaking an exact
    /// tie. Identical rule to the fold's total order, so there is one ordering
    /// concept in this store rather than two.
    public var claimSeq: Int64

    public var id: String { sessionId }

    public enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case ownerDeviceId = "owner_device_id"
        case ownerSince = "owner_since"
        case claimSeq = "claim_seq"
    }

    public init(sessionId: String, ownerDeviceId: String, ownerSince: Date = Date(), claimSeq: Int64) {
        self.sessionId = sessionId
        self.ownerDeviceId = ownerDeviceId
        self.ownerSince = ownerSince
        self.claimSeq = claimSeq
    }

    /// Does `other` supersede this claim? Highest stamp wins; device id breaks a
    /// tie. Total and deterministic, so both devices reach the same answer.
    public func isSuperseded(by other: LiveSessionOwner) -> Bool {
        if other.claimSeq != claimSeq { return other.claimSeq > claimSeq }
        return other.ownerDeviceId > ownerDeviceId
    }
}

// MARK: - Claiming, holding and handing over

extension AppDatabase {

    /// Who holds the pencil, if anyone.
    public func sessionOwner(sessionId: String) throws -> LiveSessionOwner? {
        try writer.read { db in try LiveSessionOwner.fetchOne(db, key: sessionId) }
    }

    /// Is this device the writer for that session?
    ///
    /// An unowned session answers `true`: nobody has started logging, so the
    /// first device to write takes it. A session that has never been claimed is
    /// not a locked one.
    public func holdsPencil(sessionId: String) throws -> Bool {
        try writer.read { db in try Self.holdsPencil(db, sessionId: sessionId) }
    }

    static func holdsPencil(_ db: Database, sessionId: String) throws -> Bool {
        guard let owner = try LiveSessionOwner.fetchOne(db, key: sessionId) else { return true }
        return owner.ownerDeviceId == (try deviceId(db))
    }

    /// Take the pencil.
    ///
    /// - Parameter force: `false` is the implicit claim that happens when you
    ///   start logging: it succeeds only if the session is unowned or already
    ///   yours, and throws `notSessionOwner` otherwise. `true` is the *Log here*
    ///   button — a deliberate takeover that always succeeds.
    ///
    /// There is no lease and no automatic expiry, on purpose. A lease that
    /// expired on its own would let the watch steal the pencil because the phone
    /// was merely asleep, producing exactly the two-writer situation this is
    /// meant to avoid. A phone that dies mid-session leaves a stale claim, and
    /// the answer to that is a person tapping a button — which is also the only
    /// party who knows the phone is not coming back.
    @discardableResult
    public func claimPencil(sessionId: String, force: Bool = false) throws -> LiveSessionOwner {
        try writer.write { db in try Self.claimPencil(db, sessionId: sessionId, force: force) }
    }

    @discardableResult
    static func claimPencil(_ db: Database, sessionId: String, force: Bool) throws -> LiveSessionOwner {
        let me = try deviceId(db)
        let existing = try LiveSessionOwner.fetchOne(db, key: sessionId)

        if let existing, existing.ownerDeviceId != me, !force {
            throw EventStoreError.notSessionOwner(owner: existing.ownerDeviceId)
        }
        if let existing, existing.ownerDeviceId == me {
            return existing   // already ours; do not restamp `ownerSince`
        }

        let claim = LiveSessionOwner(
            sessionId: sessionId,
            ownerDeviceId: me,
            claimSeq: try tickClock(db)
        )
        try claim.upsert(db)
        return claim
    }

    /// Put the pencil down — finishing a session, or backgrounding the app on a
    /// device you are done logging from.
    public func releasePencil(sessionId: String) throws {
        try writer.write { db in
            guard let owner = try LiveSessionOwner.fetchOne(db, key: sessionId) else { return }
            // Only the holder may release. Otherwise a stale device could
            // unlock a session someone else is actively writing to.
            guard owner.ownerDeviceId == (try Self.deviceId(db)) else { return }
            _ = try LiveSessionOwner.deleteOne(db, key: sessionId)
        }
    }

    /// A claim made on another device, arriving over the link.
    ///
    /// Applied only if it supersedes what we hold, so a late-delivered old claim
    /// cannot hand the pencil backwards.
    public func ingestOwnership(_ claim: LiveSessionOwner) throws {
        try writer.write { db in
            try Self.observeClock(db, claim.claimSeq)
            if let current = try LiveSessionOwner.fetchOne(db, key: claim.sessionId) {
                guard current.isSuperseded(by: claim) else { return }
            }
            try claim.upsert(db)
        }
    }
}
