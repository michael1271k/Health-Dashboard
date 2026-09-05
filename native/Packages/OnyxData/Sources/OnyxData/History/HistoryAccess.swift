import Foundation
import GRDB

/// The two doors the chart screens use.
///
/// ── WHY A RAW READ IS EXPOSED AT ALL ────────────────────────────────────────
/// Every screen before Wave 7 read one day or one week, and each got a named
/// stream. The charts read RANGES — ninety days of body composition, every set
/// of one exercise ever, twenty weeks of sessions — and the shapes are as many
/// as the charts. A named stream per chart would be a query-key layer by another
/// name, the thing this package exists to delete. So: one-shot reads against
/// the mirrored tables, shaped at the call site, plus `stream` for the few that
/// must be live. Views still only ever see GRDB rows; nothing here reaches the
/// network.
public extension AppDatabase {
    /// One read, on the pool's reader connection.
    func read<T: Sendable>(_ block: @escaping @Sendable (Database) throws -> T) throws -> T {
        try writer.read(block)
    }

    /// Preview and screenshot seeding ONLY: raw rows into the local store,
    /// bypassing the outbox. Nothing written here is ever pushed, because the
    /// harness database is in-memory and dies with the process.
    func seedRows(_ block: @escaping @Sendable (Database) throws -> Void) throws {
        try writer.write(block)
    }
}
