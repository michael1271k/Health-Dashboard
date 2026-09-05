import Foundation

/// The one encoder pair used for anything that crosses a boundary — the
/// `set_events.body` column on disk, and the outbox payload on its way to
/// Postgres.
///
/// ── A BARE `JSONEncoder()` WAS WRONG IN THREE WAYS ──────────────────────────
/// The default configuration produces camelCase keys, and `.deferredToDate`
/// writes a bare number of seconds since 2001 — PostgREST rejects that for a
/// `timestamptz`, or coerces it into the wrong year. Both were being written
/// into rows that outlive the build that wrote them.
///
/// One shared, explicitly configured pair, hoisted out of the per-event path so
/// it is not reallocated on every append.
public enum OnyxJSON {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        // Stable key order, so an identical event serialises to identical bytes
        // on both devices — which is what lets a payload be compared or hashed.
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/// A lowercase UUID string.
///
/// `UUID().uuidString` is **uppercase**; Postgres `uuid` columns render
/// lowercase. Left alone, the same set comes back from the server under a
/// different string, `ingest`'s case-sensitive de-duplication misses it, and the
/// fold produces the set twice — defeating both the idempotence of `append` and
/// the terminality of `void`, since a lowercase tombstone does not match an
/// uppercase id.
///
/// Normalising at the one place ids are created, and again at the boundary in
/// `ingest`, is what keeps identity byte-identical across the wire.
public func newOnyxID() -> String {
    UUID().uuidString.lowercased()
}

extension OnyxJSON {
    /// The signed-in user's id, spelled the way every row in the store spells
    /// it: lowercase.
    ///
    /// ── THE SIX SYMPTOMS THIS ONE LINE CAUSED ───────────────────────────────
    /// `UUID.uuidString` is uppercase. A Postgres `uuid` column is not — it
    /// accepts either spelling on the way in and renders lowercase on the way
    /// out, so every row this device PULLED carried a lowercase `user_id`
    /// while every row it WROTE carried an uppercase one. Both spellings sat
    /// in the same SQLite table.
    ///
    /// SQLite compares TEXT byte for byte. There is no collation on any
    /// `user_id` column, so `Column("user_id") == userId` — the filter under
    /// the dashboard, the trends, the day page, the nutrition strip, the
    /// vitals and thirteen Pulse streams — matched the handful of rows this
    /// device had typed and none of the hundreds it had synced.
    ///
    /// The vanishing was the same bug wearing a clock: pull-to-refresh
    /// rewrote a locally-logged session's id to the server's lowercase, the
    /// commit hook fired, and the rebuilt feed 300 ms later could no longer
    /// see the session it had just been showing.
    ///
    /// Mint the string HERE and nowhere else. The rule is enforced by
    /// `UserIdCasingTests.noRawUuidStringOutsideThisFile`, which greps the
    /// tree, because the failure is silent: a wrong id produces empty
    /// screens, never an error.
    public static func canonicalUserID(_ id: UUID) -> String {
        id.uuidString.lowercased()
    }
}
