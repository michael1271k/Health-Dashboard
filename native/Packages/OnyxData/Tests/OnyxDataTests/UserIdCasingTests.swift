import Foundation
import Testing
import GRDB
@testable import OnyxData

/// The bug that emptied six screens, and the two things that keep it shut.
///
/// `AppEnvironment.userIdString` returned `UUID.uuidString` — uppercase —
/// while every row pulled from Postgres carried the lowercase spelling a
/// `uuid` column renders. SQLite compares TEXT byte for byte and none of these
/// columns has a collation, so `Column("user_id") == userId` matched what this
/// phone had typed and nothing it had synced.
///
/// Nothing about that failure is loud. There is no error, no empty state that
/// looks different from a genuinely empty week — just screens that quietly
/// stop knowing anything. So it is guarded twice: once at the mint
/// (`canonicalUserID`), once across the whole tree by grep, because a single
/// new `.uuidString` anywhere brings all six symptoms back.
@Suite("User id casing")
struct UserIdCasingTests {

    private let upper = "F405D57B-D09F-4A2E-8A33-0C112F2EC34C"
    private var lower: String { upper.lowercased() }

    @Test("the canonical spelling is the one Postgres renders")
    func canonicalIsLowercase() throws {
        let id = try #require(UUID(uuidString: upper))
        #expect(OnyxJSON.canonicalUserID(id) == lower)
        // The trap this function exists to close. If Foundation ever changes
        // its mind, the fix above stops being needed — and this line says so.
        #expect(id.uuidString == upper)
    }

    /// v12 against a store holding both spellings, which is what every device
    /// that ran Phase 2 has on disk.
    ///
    /// Three shapes, and the migration has to treat them differently:
    ///
    ///   · a table upserted on a NATURAL key (`daily_scores`, keyed on `id`,
    ///     conflict `user_id,date`) doubled — the lookup missed the pulled row
    ///     and the write minted a second under a fresh uuid;
    ///   · a table keyed on `user_id` itself (`dashboard_layouts`) doubled the
    ///     same way, one row per spelling;
    ///   · a row the device wrote and never managed to push has no twin at
    ///     all, and must SURVIVE, lowercased. Deleting it would be the
    ///     migration losing the only copy of a fact.
    @Test("the migration collapses the pre-push twin and lowercases the rest")
    func migrationCollapsesTwins() throws {
        let queue = try DatabaseQueue()
        let migrator = AppDatabase.migrator
        try migrator.migrate(queue, upTo: "v11.sessionMetrics")

        let stamp = "2026-09-04 10:00:00.000"
        try queue.write { db in
            // Same day, both spellings: the server's copy and the one this
            // device wrote before it learned the server's answer.
            for (id, user, score) in [("srv-1", lower, 71), ("dev-1", upper, 88)] {
                try db.execute(sql: """
                    INSERT INTO daily_scores (id, user_id, date, score, computed_at, finalized)
                    VALUES (?, ?, '2026-09-04', ?, ?, 0)
                    """, arguments: [id, user, score, stamp])
            }
            // A day only this device knows about — never pushed, no twin.
            try db.execute(sql: """
                INSERT INTO daily_scores (id, user_id, date, score, computed_at, finalized)
                VALUES ('dev-2', ?, '2026-09-05', 64, ?, 0)
                """, arguments: [upper, stamp])
            for user in [lower, upper] {
                try db.execute(sql: """
                    INSERT INTO dashboard_layouts (user_id, layout, updated_at) VALUES (?, '{}', ?)
                    """, arguments: [user, stamp])
            }
            // Keyed on `id`, which round-trips, so this one never doubled —
            // but its `user_id` still has to come down to lowercase or the
            // training reads stay blind.
            try db.execute(sql: """
                INSERT INTO workout_sessions (id, user_id, date, is_pending_sync)
                VALUES ('s1', ?, '2026-09-04', 0)
                """, arguments: [upper])
        }

        try migrator.migrate(queue)

        try queue.read { db in
            // The whole point of the wave: one spelling, everywhere.
            for table in ["daily_scores", "dashboard_layouts", "workout_sessions"] {
                let ids = try String.fetchAll(db, sql: "SELECT DISTINCT user_id FROM \(table)")
                #expect(ids == [lower], "\(table) still holds more than one spelling")
            }

            // The SERVER's row survives the collapse, not the device's. Not
            // because it is newer — because `sync_cursors` has already moved
            // past it and it would never be pulled again, while the device's
            // copy is either inside it already or still in the outbox.
            let kept = try String.fetchAll(db, sql: "SELECT id FROM daily_scores WHERE date = '2026-09-04'")
            #expect(kept == ["srv-1"])

            // The unpushed day is not a duplicate and must not be collateral.
            let solo = try Int.fetchOne(db, sql: "SELECT score FROM daily_scores WHERE date = '2026-09-05'")
            #expect(solo == 64)

            #expect(try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM dashboard_layouts") == 1)
        }
    }

    /// The grep that stops the next one.
    ///
    /// `canonicalUserID` only helps where it is called. This walks every Swift
    /// source in the tree and refuses any `uuidString` that is not lowercased
    /// on the spot — the id mint (`newOnyxID`), the user id
    /// (`canonicalUserID`) and `Layout`'s slug are the three that pass, and a
    /// fourth has to say why in the same line.
    @Test("no raw uuidString survives outside the two normalising helpers")
    func noRawUuidString() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // OnyxDataTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // OnyxData
            .deletingLastPathComponent()   // Packages
            .deletingLastPathComponent()   // native
        let roots = [
            root.appending(path: "Onyx"),
            root.appending(path: "Packages/OnyxCore/Sources"),
            root.appending(path: "Packages/OnyxData/Sources"),
            root.appending(path: "Packages/OnyxUI/Sources"),
        ]

        var offenders: [String] = []
        for dir in roots {
            let files = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)?
                .compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" } ?? []
            for file in files {
                for (n, line) in try String(contentsOf: file, encoding: .utf8)
                    .split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                    let code = line.trimmingCharacters(in: .whitespaces)
                    guard !code.hasPrefix("//"), code.contains("uuidString") else { continue }
                    // `UUID(uuidString:)` PARSES a string; only rendering one
                    // can introduce the uppercase spelling.
                    let renders = code.replacingOccurrences(of: "UUID(uuidString:", with: "").contains("uuidString")
                    guard renders, !code.contains(".lowercased()") else { continue }
                    offenders.append("\(file.lastPathComponent):\(n + 1) \(code)")
                }
            }
        }
        #expect(offenders.isEmpty, """
            Raw `uuidString` renders an UPPERCASE uuid; Postgres renders lowercase, and \
            SQLite compares TEXT byte for byte. Use `newOnyxID()` for a new row id and \
            `OnyxJSON.canonicalUserID(_:)` for the signed-in user.
            \(offenders.joined(separator: "\n"))
            """)
    }
}
