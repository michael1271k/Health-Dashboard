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
public enum HelixJSON {
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
public func newHelixID() -> String {
    UUID().uuidString.lowercased()
}
