import Foundation
import GRDB
import Supabase
import Testing
@testable import OnyxData

/// The Wave 2.3 gate, against the LIVE project. Skipped unless the environment
/// names a session file:
///
///     ONYX_LIVE_URL=<host> ONYX_LIVE_ANON_KEY=<key> ONYX_LIVE_SESSION_FILE=<json with access_token + refresh_token>
///
/// Runs a fresh in-memory backfill and compares every table's local count
/// with PostgREST's `count=exact` for the same user. Nothing is written to the
/// server: the outbox is empty on a fresh store and the two score rows it
/// pushes are today's and are upserts.
@Suite("Live backfill gate", .enabled(if: ProcessInfo.processInfo.environment["ONYX_LIVE_SESSION_FILE"] != nil))
struct BackfillLiveTests {

    @Test("every table lands with exactly the server's row count")
    func countsMatch() async throws {
        let env = ProcessInfo.processInfo.environment
        let path = try #require(env["ONYX_LIVE_SESSION_FILE"])
        let json = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as? [String: Any])
        let client = OnyxSupabase.makeClient(config: SupabaseConfig(
            url: try #require(URL(string: "https://" + (env["ONYX_LIVE_URL"] ?? ""))),
            anonKey: try #require(env["ONYX_LIVE_ANON_KEY"])
        ))
        let session = try await client.auth.setSession(
            accessToken: try #require(json["access_token"] as? String),
            refreshToken: try #require(json["refresh_token"] as? String)
        )
        let userId = session.user.id.uuidString

        let db = try AppDatabase.inMemory(deviceId: "live-gate")
        let coordinator = SyncCoordinator(database: db, client: client, userId: userId)
        let box = Box()
        try await coordinator.backfill { box.set($0) }
        let progress = try #require(box.get())
        #expect(progress.isFinished)

        var mismatches: [String] = []
        for table in SyncCoordinator.backfillOrder {
            let server = try await client.from(table).select("*", head: true, count: .exact)
                .eq("user_id", value: userId).execute().count ?? -1
            let local = try await db.writer.read { conn in
                try Int.fetchOne(conn, sql: "SELECT count(*) FROM \"\(table)\"") ?? -1
            }
            let landed = progress.tables.first { $0.name == table }?.rows ?? -1
            print("gate \(table): server=\(server) local=\(local) landed=\(landed)")
            if server != local || landed != server { mismatches.append("\(table) server=\(server) local=\(local) landed=\(landed)") }
        }
        #expect(mismatches.isEmpty, "\(mismatches)")
    }
}

private final class Box: @unchecked Sendable {
    private var value: BackfillProgress?
    private let lock = NSLock()
    func set(_ p: BackfillProgress) { lock.lock(); value = p; lock.unlock() }
    func get() -> BackfillProgress? { lock.lock(); defer { lock.unlock() }; return value }
}
