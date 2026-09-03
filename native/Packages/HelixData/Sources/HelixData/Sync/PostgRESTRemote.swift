import Foundation
import Supabase

/// `SyncRemote` over supabase-swift's PostgREST client.
///
/// Thin on purpose: every rule about WHAT to send lives in `SyncTranslation`
/// and every rule about WHEN lives in `SyncEngine`. What is left here is the
/// three HTTP shapes and the two things that are genuinely PostgREST-specific:
/// the conflict target, and `returning: .minimal`.
///
/// `.minimal` matters more than it looks. The default is `.representation`,
/// which makes the server re-SELECT every affected row THROUGH RLS and send
/// all of it back — thirty full rows on the return leg of a thirty-set upload,
/// over cellular, inside a background task, and then discarded unread.
public struct PostgRESTRemote: SyncRemote {

    private let client: SupabaseClient
    private let userId: String

    /// `userId` scopes the catalogue read. RLS already restricts every table to
    /// `user_id = auth.uid()`, so this is belt and braces — but the filter also
    /// keeps the request honest if the policy is ever widened for an admin.
    public init(client: SupabaseClient, userId: String) {
        self.client = client
        self.userId = userId
    }

    public func exerciseCatalogue() async throws -> [RemoteExercise] {
        try await client
            .from("exercises")
            .select("id,name")
            .eq("user_id", value: userId)
            .execute()
            .value
    }

    public func upsertSessions(_ rows: [RemoteSessionRow], ignoreDuplicates: Bool) async throws {
        guard !rows.isEmpty else { return }
        // `onConflict: "id"` is not a preference, it is the only legal target:
        // `workout_sessions` has exactly one unique constraint, its primary
        // key. There is no unique index on `client_session_id` — the web app's
        // idempotency token is enforced by a SELECT, not by the database.
        try await client
            .from("workout_sessions")
            .upsert(rows, onConflict: "id", returning: .minimal, ignoreDuplicates: ignoreDuplicates)
            .execute()
    }

    public func upsertSets(_ rows: [RemoteSetRow]) async throws {
        guard !rows.isEmpty else { return }
        try await client
            .from("workout_sets")
            .upsert(rows, onConflict: "id", returning: .minimal)
            .execute()
    }

    public func deleteSets(ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        try await client
            .from("workout_sets")
            .delete(returning: .minimal)
            .in("id", values: ids)
            .execute()
    }
}
