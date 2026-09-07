import Foundation
import Testing
import GRDB
@testable import OnyxData

/// The half of sign-out that leaves nothing behind.
///
/// ── WHY THIS IS WORTH A TEST AND THE REST OF `signOut()` IS NOT ─────────────
/// The order of `signOut()` — drain, stop, revoke, erase, redraw — lives in
/// `AppEnvironment`, which needs a live Supabase client to exist, so it is
/// verified on a device. `eraseLocalData` is the one piece with real logic in
/// it: it enumerates `sqlite_master` rather than carrying a list of tables, and
/// the whole argument for doing it that way is that a list falls behind the
/// schema silently. A test that seeds several tables and then insists on ZERO
/// rows everywhere is what makes that argument checkable — and it fails the day
/// a new table escapes the sweep, which a hand-written list never would.
@Suite("Sign-out erases the local store")
struct SignOutEraseTests {

    private func seeded() throws -> AppDatabase {
        let db = try AppDatabase.inMemory()
        try db.writer.write { conn in
            try Exercise(id: "ex-squat", name: "Back Squat", primaryMuscle: "quads").insert(conn)
            try WorkoutSession(id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02").insert(conn)
        }
        return db
    }

    /// Every user table, by the same rule the erase itself uses. A test that
    /// named the tables would be the list this design exists to avoid.
    private func tableCounts(_ db: AppDatabase) throws -> [String: Int] {
        try db.writer.read { conn in
            let names = try String.fetchAll(conn, sql: """
                SELECT name FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'grdb_migrations'
                """)
            var counts: [String: Int] = [:]
            for name in names {
                counts[name] = try Int.fetchOne(conn, sql: "SELECT count(*) FROM \"\(name)\"") ?? 0
            }
            return counts
        }
    }

    @Test("no user table keeps a row")
    func everythingGoes() throws {
        let db = try seeded()
        let before = try tableCounts(db)
        #expect(before.values.reduce(0, +) > 0, "the fixture must actually seed something")

        try db.eraseLocalData()

        for (table, count) in try tableCounts(db) {
            #expect(count == 0, "\(table) still holds \(count) row(s) after sign-out")
        }
    }

    @Test("the schema survives, so the next user signs in to a working store")
    func schemaSurvives() throws {
        let db = try seeded()
        let tablesBefore = Set(try tableCounts(db).keys)

        try db.eraseLocalData()

        // Same tables, still writable. Dropping them — or dropping the
        // migration record — would make the next launch re-run the migrator
        // against a store it half-owns.
        #expect(Set(try tableCounts(db).keys) == tablesBefore)
        try db.writer.write { conn in
            try Exercise(id: "ex-new", name: "Leg Press", primaryMuscle: "quads").insert(conn)
        }
        #expect(try db.exercises().count == 1)
    }

    @Test("erasing an already-empty store is a no-op, not an error")
    func idempotent() throws {
        let db = try AppDatabase.inMemory()
        try db.eraseLocalData()
        try db.eraseLocalData()
        #expect(try tableCounts(db).values.reduce(0, +) == 0)
    }
}
